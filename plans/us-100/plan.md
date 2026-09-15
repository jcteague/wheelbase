---
story: us-100
kind: feature
parent: null
topics: [market-data, ipc-handlers, screener, polling-scheduler]
status: planned
---

# Implementation Plan: US-100 — Collect IVR on watchlist add and outside market hours

## Summary

IV rank is collected the moment a ticker enters the app (watchlist add or manual position
entry) and an explicit "Refresh IVR now" is no longer refused on a weekend or holiday, while the
nightly scheduled run keeps its calendar guard. Every reading is stamped at the close of the
exchange session it belongs to, so a weekend fetch refreshes Friday's row instead of inventing a
Saturday one. Done means: the 13 acceptance scenarios pass end to end in `e2e/ivr-on-demand.spec.ts`,
the bench shows a freshly added ticker's IV rank without a reload, and the `ivr_snapshot` series
holds at most one row per underlying per session.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-6](https://linear.app/optionswheel/issue/OPT-6/us-100-collect-ivr-on-watchlist-add-and-outside-market-hours) (archived draft: `docs/epics/06-stories/US-100-collect-ivr-on-demand-and-outside-market-hours.md`)
- **Research & Design Decisions:** `plans/us-100/research.md`
- **Data Model & Selection Logic:** `plans/us-100/data-model.md`
- **API Contract(s):** `plans/us-100/contracts/ivr-collect-now.md`, `contracts/watchlist-add.md`, `contracts/positions-create.md`, `contracts/ivr-snapshot-updated.md`, `contracts/dev-only-test-channels.md`
- **Quickstart & Verification:** `plans/us-100/quickstart.md`
- **Spec orientation:** `docs/spec/features/us-44-ivr-snapshot-store-and-scheduler.md`, `us-97-…`, `us-98-ivr-staleness-tiers.md`, `us-116-market-facts-from-market-data-provider.md`; ADRs `ivr-non-trading-day-guard-in-collector.md`, `ivr-same-day-overwrite-delete-then-insert.md`, `ivr-freshness-in-completed-sessions.md`, `trading-calendar-fetched-and-cached.md`

## Prerequisites

All schema and infrastructure exist:

- `ivr_snapshot` (migration 007), `watchlist` (012), `trading_session` (015) — no migration in this story.
- `collectIVRSnapshots`, `persistSnapshot`, `IVR_COLLECT_JOB_NAME` in `src/main/services/ivr-collector.ts` (US-44/97/98).
- Pure calendar engine `src/main/core/trading-calendar.ts` with `getTradingSession`, `getMostRecentCompletedSession`, `etDateOf` (US-98).
- `readTradingCalendar`, `refreshTradingCalendar`, `ensureTradingCalendar` in `src/main/services/trading-calendar-store.ts` (US-98/116).
- `getLatestIvrByUnderlying` in `src/main/services/ivr-snapshots.ts` (US-65).
- `createPollingScheduler` with `runNow` join-in-flight guard (US-46).
- Fake IVR seam (`WHEELBASE_FAKE_IVR`, `_test:ivr-*`) and `FakeMarketDataProvider` calendar fixtures (US-44/98/116).
- Push-event precedent: `webContents.send('market-data:stock-quote')` + preload `onIpcEvent` (US-32).
- US-116 has shipped, so a reading collected here is legible on a fresh install.

## Implementation Areas

### 1. Core: session observation window

**Files to create or modify:**

- `src/main/core/trading-calendar.ts` — add `observationWindowOf(calendar, session)`
- `src/main/core/trading-calendar.test.ts` — new cases

**Red — tests to write:**

- `observationWindowOf` returns `{ from: session.closeAt, to: nextSession.closeAt }` for a mid-calendar session (Fri → Mon when Sat/Sun are closures; Wed → Fri when Thu is a holiday).
- Returns `{ from: session.closeAt, to: null }` when the session is the last one in `calendar.sessions`.
- Returns `null` when `session.date` is not an `open` day of the calendar (unknown day or closure).
- Pure: no import beyond `date-fns`; the module stays free of I/O (existing lint keeps this honest).

**Green — implementation:**

- `export function observationWindowOf(calendar: TradingCalendar, session: TradingSession): { from: string; to: string | null } | null` in `src/main/core/trading-calendar.ts`, beside `getMostRecentCompletedSession`. Validate the session via `getTradingSession(calendar, session.date)`, then `to = calendar.sessions.find((s) => s.date > session.date)?.closeAt ?? null`.

**Refactor — cleanup to consider:**

- Reuse the existing `covers`/`getTradingSession` helpers rather than re-walking `sessions`; keep the doc comment in the style of the neighbouring functions ("the half-open interval every reading between two closes belongs to").

**Acceptance criteria covered:**

- Foundation for "A weekend reading is stored against the trading day it belongs to … exactly one KO snapshot exists for Friday".

### 2. Scheduler: run context with a trigger

**Files to create or modify:**

- `src/main/services/polling-scheduler.ts` — `JobTrigger`, `JobRunContext`, `JobHandler` signature, `runNow(jobName, opts?)`
- `src/main/services/polling-scheduler.test.ts` — new cases

**Red — tests to write:**

- A timer tick invokes the handler with `{ trigger: 'scheduled' }` (register an `interval` job, advance the fake clock, assert the handler mock's first argument).
- `runNow('job')` invokes the handler with `{ trigger: 'explicit' }`.
- `runNow('job', { trigger: 'scheduled' })` invokes the handler with `{ trigger: 'scheduled' }`.
- `runNow` while a run is in flight still joins it and does **not** invoke the handler a second time (existing "joins the in-flight run" case extended to assert the handler call count is 1 and no second context is passed).
- Existing zero-arg handlers (`async () => {}`) still type-check and run (the `seedTestJobsFromEnv` fixtures in `src/main/ipc/test-scheduler.ts` compile unchanged).

**Green — implementation:**

- `export type JobTrigger = 'scheduled' | 'explicit'`, `export type JobRunContext = { trigger: JobTrigger }`, `export type JobHandler = (ctx: JobRunContext) => Promise<unknown>`.
- `runHandler(state, ctx)` and `runTracked(state, ctx)` take the context; `tick` passes `{ trigger: 'scheduled' }`; `runNow(jobName, { trigger = 'explicit' }: { trigger?: JobTrigger } = {})` passes `{ trigger }`. `PollingScheduler.runNow` signature updated on the interface.

**Refactor — cleanup to consider:**

- The join-in-flight comment on `JobState.running` should mention that a joined run keeps the trigger it started with.

**Acceptance criteria covered:**

- "Manual refresh works on a weekend" / "…weekday market holiday" (the explicit trigger reaches the collector); "The scheduled run still skips a weekend" / "…still fires after hours on a weekday" (scheduled trigger).

### 3. Collector: trigger split, shared per-ticker body, session stamping

**Files to create or modify:**

- `src/main/services/ivr-collector.ts` — `trigger` input; export `collectTicker`; stamping + session-window dedupe in `persistSnapshot`
- `src/main/services/ivr-collector.test.ts` — new cases; three existing `observed_at` expectations updated

**Red — tests to write:**

- _Trigger split:_ with the 2026 calendar seeded and clock `2026-05-23T17:00:00Z` (Saturday), `collectIVRSnapshots({ trigger: 'scheduled' })` returns `skippedReason: 'market_closed'` and `fetchIvr` is not called (existing "returns early and logs skip for a weekend" case — make `trigger` explicit).
- Same clock, `trigger: 'explicit'`: `fetchIvr` is called for every target, the result has `skippedReason: null`, and an info log `ivr_collection_explicit_on_closed_day` (or equivalent) records that the closed verdict was overridden.
- Omitting `trigger` behaves as `'scheduled'` (the default keeps every existing call site guarded).
- Recognised weekday holiday (`2026-11-26`) with `trigger: 'explicit'` collects; with `'scheduled'` skips (extend the existing holiday case).
- _Stamping:_ clock `2026-05-29T21:30:00Z`, an `ok` result with `observedAt: '2026-05-29T21:05:00.000Z'` persists `observed_at === '2026-05-29T20:00:00.000Z'` (the 16:00 EDT close from `seedTradingCalendar`). Update the existing "persists a successful Barchart snapshot as decimal strings" expectation accordingly.
- A Sunday fetch (`observedAt: '2026-05-31T15:00:00.000Z'`) is stamped to Friday `2026-05-29T20:00:00.000Z`.
- A Thanksgiving fetch (`2026-11-26T23:00:00.000Z`) is stamped to Wednesday `2026-11-25T21:00:00.000Z` (EST).
- An intraday fetch on an open session (`2026-05-29T14:05:00.000Z`) is stamped to Thursday `2026-05-28T20:00:00.000Z`.
- When the calendar cannot speak for the observation (empty `trading_session`, no provider), the raw `observedAt` is persisted and a warn `ivr_observation_unstamped` is logged (the US-116 fresh-install path).
- _Session-window dedupe:_ an existing row at `2026-05-29T20:00:00.000Z` plus a Sunday fetch → exactly one row for SPY, stamped Friday, carrying the new value (rewrite the existing "re-running on the same UTC calendar day…" case as "re-collecting within the same session replaces the earlier row").
- A legacy fetch-instant row at `2026-05-30T01:00:00.000Z` (late-evening Friday manual refresh) is swept by a re-collection of Friday's session (rewrite "uses the UTC calendar day instead of slicing…" to this).
- A row belonging to the _previous_ session (`2026-05-28T20:00:00.000Z`) is **not** deleted by a Friday collection (two rows remain).
- _Extraction:_ `collectTicker` returns `'persisted'` / `'not_available'` / `'failed'` for the three result classes and `'failed'` when `fetchIvr` throws (warn with `err` key); it rethrows when `persistSnapshot` throws (existing "rethrows a persist failure" case now targets the helper via the batch).
- Batch tallies are unchanged for the existing union/isolation/abort cases (they must stay green untouched).

**Green — implementation:**

- `CollectIVRSnapshotsInput.trigger?: 'scheduled' | 'explicit'` defaulting to `'scheduled'` in the destructure. Guard becomes `if (session.status === 'closed' && trigger === 'scheduled') { …return market_closed }`; for `'explicit'` on a closed day, `logger.info({ etDate, trigger }, 'IVR collection proceeding on a closed day at explicit request')`.
- `export type TickerOutcome = 'persisted' | 'not_available' | 'failed'` and `export async function collectTicker({ db, logger, fetchIvr, calendar, ticker }: CollectTickerInput): Promise<TickerOutcome>` — moves the try/catch + switch out of the loop; `persistSnapshot(db, calendar, result)` stays outside the try.
- `persistSnapshot(db, calendar, result)`: `session = getMostRecentCompletedSession(calendar, parseISO(result.data.observedAt))`; `stamp = session?.closeAt ?? result.data.observedAt`; window = `session ? observationWindowOf(calendar, session) : null`; delete with `observed_at >= from AND (to IS NULL OR observed_at < to)` when a window exists, else the existing `utcDayBounds` delete; insert with `stamp`. Warn `ivr_observation_unstamped` when `session === null`. Debug `ivr_snapshot_persisted` with `{ ticker, stamp }`.
- The batch loop becomes `const outcome = await collectTicker(...)` + a tally (`persisted → successCount`, `not_available → skippedCount`, `failed → errorCount`), keeping the abort check at the ticker boundary and the `calendar` read once per run (it already exists for the guard).

**Refactor — cleanup to consider:**

- `utcDayBounds` survives only as the unstamped fallback — name and comment it as such.
- Keep the collector free of any `trigger` knowledge beyond the one guard line; do not thread it into `collectTicker`.
- Check the `ivr-collector-per-ticker-failure-isolation` ADR's description still matches the extracted helper.

**Acceptance criteria covered:**

- "Manual refresh works on a weekend", "Manual refresh works on a weekday market holiday", "A weekend reading is stored against the trading day it belongs to", "The scheduled run still skips a weekend", "The scheduled run still fires after hours on a weekday".

### 4. On-demand collection service

**Files to create or modify:**

- `src/main/services/ivr-on-demand.ts` — new: `IvrOnDemand`, `createIvrOnDemand`
- `src/main/services/ivr-on-demand.test.ts` — new

**Red — tests to write:**

- `collect('aapl')` with no snapshot calls `fetchIvr` exactly once with `'AAPL'`, persists one row stamped at the current trading day's close, logs info `ivr_on_demand_collected`, and invokes `onCollected('AAPL')`.
- It never touches the batch targets: with KO on the watchlist and MSFT open, `collect('AAPL')` makes no `fetchIvr` call for KO or MSFT.
- With an AAPL row already attributed to the current trading day (row at Friday's `closeAt`, clock Sunday), `collect('AAPL')` makes no fetch, leaves the row unchanged, logs debug `ivr_on_demand_already_collected`, and does not call `onCollected`.
- With an AAPL row attributed to the _previous_ session (Thursday's close, clock Friday 21:30Z), `collect('AAPL')` fetches and writes Friday's row (two rows remain).
- With an empty calendar (`trading_session` empty, `getProvider` throws), dedupe falls back to ET-date equality: a row stamped earlier today skips; a row from yesterday fetches and persists unstamped.
- `fetchIvr` rejecting → resolves (never rejects), no row, warn logged (`IVR collection threw for ticker`), `onCollected` not called.
- `fetchIvr` resolving `network_error` → resolves, no row, warn logged, `onCollected` not called.
- `fetchIvr` resolving `not_available` → resolves, no row, info logged, `onCollected` not called.
- A `persistSnapshot` failure (e.g. `db.close()` before collect) → resolves, error logged `ivr_on_demand_failed`.
- `ensureTradingCalendar` is awaited before the read: with `needsRefresh` true and a provider that returns a calendar, `trading_session` is populated by the time the stamp is resolved (assert the persisted row is stamped, not raw).

**Green — implementation:**

- `export type IvrOnDemand = { collect(ticker: string): Promise<void> }` and `export function createIvrOnDemand({ db, getProvider, fetchIvr = fetchIVR, clock = { now: () => new Date() }, logger = defaultLogger, onCollected }: CreateIvrOnDemandDeps): IvrOnDemand` in `src/main/services/ivr-on-demand.ts`, following the state machine in `data-model.md` ("`collect(ticker)` state machine"). Uses `ensureTradingCalendar`, `readTradingCalendar`, `getMostRecentCompletedSession`, `etDateOf`, `getLatestIvrByUnderlying`, `collectTicker`.
- Whole body inside `try { … } catch (err) { logger.error({ ticker, err }, 'ivr_on_demand_failed') }` so the returned promise never rejects; document that guarantee on the type like `ensureTradingCalendar` does.

**Refactor — cleanup to consider:**

- The "belongs to the same session" predicate is used for dedupe here and conceptually mirrors `persistSnapshot`'s window; if both read naturally as one pure helper (`sessionDateOf(calendar, instant)`), extract it into `core/trading-calendar.ts`; otherwise leave inline.
- Run the code-simplifier on the new module.

**Acceptance criteria covered:**

- "Adding a ticker to the watchlist collects its IVR immediately", "Adding a ticker collects only that ticker", "Adding a ticker that already has a reading for the day does not refetch", "The add succeeds even when the IVR fetch fails" (warn-level clause), "A ticker Barchart does not cover is added without an IV rank", and the three position-open scenarios (same port).

### 5. Wire the port: services, IPC registration, composition

**Files to create or modify:**

- `src/main/services/watchlist.ts` — `addWatchlistEntry(db, payload, ivrOnDemand?)`
- `src/main/services/positions.ts` — `createPosition(db, payload, ivrOnDemand?)`
- `src/main/ipc/watchlist.ts` — `registerWatchlistIpc({ …, ivrOnDemand })`
- `src/main/ipc/positions.ts` — `registerPositionsHandlers(db, { ivrOnDemand }?)`
- `src/main/index.ts` — construct `createIvrOnDemand`, pass to both registrations; `ivr-collect` handler forwards `ctx.trigger`; `onCollected` pushes `ivr:snapshot-updated`
- Tests: `src/main/services/watchlist.test.ts`, `src/main/services/positions.test.ts`, `src/main/ipc/watchlist.test.ts`, `src/main/ipc/positions.test.ts`, `src/main/index.test.ts`

**Red — tests to write:**

- `addWatchlistEntry(db, payload, port)` calls `port.collect('AAPL')` (normalised) exactly once **after** the row exists (assert the row is present inside the fake `collect`).
- `addWatchlistEntry` for a duplicate ticker throws `ValidationError('ticker','duplicate')` and never calls `collect`.
- `addWatchlistEntry(db, payload)` with no port behaves exactly as before (existing cases stay green).
- `createPosition(db, payload, port)` calls `port.collect(payload.ticker)` once after the transaction; a lifecycle rejection (bad expiration) never calls it; no port → unchanged.
- The `positions:create` handler passes the `ivrOnDemand` it was registered with as the third argument of `createPosition`; `watchlist:add` does the same for `addWatchlistEntry` (mock the services, assert call args). Handlers stay a single service call.
- `index.test.ts`: the `ivr-collect` handler invoked with `{ trigger: 'explicit' }` calls `collectIVRSnapshots` with `trigger: 'explicit'` (and with `'scheduled'` when so invoked); `createIvrOnDemand` is constructed once with the fake collaborators' `fetchIvr`/`clock`, and the same instance is passed to `registerWatchlistIpc` and `registerPositionsHandlers`; `onCollected('AAPL')` sends `('ivr:snapshot-updated', { ticker: 'AAPL' })` on the main window's `webContents` and is a no-op when the window is null.

**Green — implementation:**

- `watchlist.ts`: import `type { IvrOnDemand }`; after `logger.info({ ticker }, 'watchlist_entry_added')` add `void ivrOnDemand?.collect(ticker)`.
- `positions.ts`: same after the transaction and the existing `position_created` info log (add one if absent — INFO for the business event); `void ivrOnDemand?.collect(payload.ticker)`.
- `ipc/watchlist.ts`: accept `ivrOnDemand?: IvrOnDemand`, pass as third arg. `ipc/positions.ts`: `registerPositionsHandlers(db, { ivrOnDemand }: { ivrOnDemand?: IvrOnDemand } = {})`, pass as third arg to `createPosition`.
- `index.ts`: `const ivrOnDemand = createIvrOnDemand({ db, logger, getProvider: () => marketDataFactory.create(), onCollected: (ticker) => mainWindow?.webContents.send('ivr:snapshot-updated', { ticker }), ...ivrCollaborators })`, declared right after `ivrCollaborators`; pass to `registerWatchlistIpc` and `registerPositionsHandlers(db, { ivrOnDemand })` (move that registration after `ivrCollaborators` if needed). `ivr-collect` handler: `handler: async ({ trigger }) => collectIVRSnapshots({ …, trigger })`.

**Refactor — cleanup to consider:**

- Both services now end with the same two lines (info log, `void ivrOnDemand?.collect`); that is two call sites of a port, not a concept — do not abstract.
- `registerPositionsHandlers` becomes the second registration to take an options object; match `registerWatchlistIpc`'s destructured style.

**Acceptance criteria covered:**

- All four watchlist-add scenarios and all three position-open scenarios (the trigger now fires); "Manual refresh works on a weekend" (the trigger reaches the collector).

### 6. Renderer: refresh the bench when a reading lands; retire the dead "market closed" branch

**Files to create or modify:**

- `src/preload/index.ts`, `src/preload/index.d.ts` — `ivr.onSnapshotUpdated`
- `src/renderer/src/hooks/useIvrSnapshotUpdates.ts` (+ `.test.ts`) — new
- `src/renderer/src/pages/WatchlistPage.tsx` — mount the hook
- `src/renderer/src/pages/SettingsPage.tsx`, `SettingsPage.test.tsx` — remove the `skippedReason === 'market_closed'` message branch and its test

**Red — tests to write:**

- `useIvrSnapshotUpdates` subscribes via `window.api.ivr.onSnapshotUpdated` on mount, and on an event `{ ticker: 'AAPL' }` calls `queryClient.invalidateQueries` for `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results` (mirror `useStockQuotes.test.ts`'s callback-capture pattern).
- The unsubscribe returned by `onSnapshotUpdated` is called on unmount.
- `SettingsPage.test.tsx`: the manual-refresh success message shows `N snapshots saved, M errors` for a summary with `skippedReason: null`; the "shows a skipped message when the collector reports market_closed" test is deleted.

**Green — implementation:**

- Preload: `ivr: { collectNow: …, onSnapshotUpdated: onIpcEvent<{ ticker: string }>('ivr:snapshot-updated') }`; `index.d.ts` adds `onSnapshotUpdated: (cb: (event: { ticker: string }) => void) => () => void`.
- `useIvrSnapshotUpdates()` — `useEffect` subscribing and invalidating both keys; returns nothing.
- `WatchlistPage`: call `useIvrSnapshotUpdates()` beside `useWatchlistSnapshot()`.
- `SettingsPage.tsx:511` — drop the `market_closed` branch; the success path renders the saved/errors line unconditionally. `CollectIvrNowResult.skippedReason` in `src/renderer/src/api/ivr.ts` stays (the envelope shape is unchanged).

**Refactor — cleanup to consider:**

- If `MessageText`'s tone plumbing in `SettingsPage` only existed for the muted "market closed" case, simplify it; otherwise leave.

**Acceptance criteria covered:**

- "…an AAPL IV rank is readable without waiting for the scheduled run" as the trader sees it; "Manual refresh works on a weekend … the summary does not report market_closed".

### 7. Test seams: fetch log, scheduled-trigger run, e2e helpers

**Files to create or modify:**

- `src/main/integrations/fake-ivr.ts` — `fetchLog`, `readFakeIvrFetchLog`, reset in `setFakeIvrOutcomes`
- `src/main/ipc/test-ivr.ts` (+ `.test.ts`) — `_test:ivr-fetch-log`
- `src/main/ipc/test-scheduler.ts` — `_test:scheduler-run-scheduled`
- `src/preload/index.ts`, `index.d.ts` — `testIvrFetchLog`, `testSchedulerRunScheduled`
- `e2e/ivr-helpers.ts` — `readIvrFetchLog`, `collectIvrScheduled`, `networkErrorOutcome`, `seedBenchAndSettle`
- `e2e/trading-day-fixtures.ts` — `sessionCloseOn(day)`

**Red — tests to write:**

- `fake-ivr` (unit, if a test file exists; otherwise cover through `test-ivr.test.ts`): each `fetchIvr` call appends the upper-cased ticker; `setFakeIvrOutcomes` clears the log.
- `test-ivr.test.ts`: `_test:ivr-fetch-log` returns the log; after `_test:ivr-set-outcomes` it returns `[]`.
- `_test:scheduler-run-scheduled` calls `scheduler.runNow(jobName, { trigger: 'scheduled' })` and returns the handler result (mock the scheduler).

**Green — implementation:**

- `fake-ivr.ts`: `let fetchLog: string[] = []`; `fakeFetchIvr` pushes `key` before returning; `setFakeIvrOutcomes` sets `fetchLog = []`; `export function readFakeIvrFetchLog(): string[]`.
- `test-ivr.ts`: `ipcMain.handle('_test:ivr-fetch-log', () => readFakeIvrFetchLog())`.
- `test-scheduler.ts`: `ipcMain.handle('_test:scheduler-run-scheduled', (_, jobName: string) => scheduler.runNow(jobName, { trigger: 'scheduled' }))`.
- Preload + d.ts entries.
- `e2e/ivr-helpers.ts`: `readIvrFetchLog(page): Promise<string[]>`; `collectIvrScheduled(page): Promise<IvrBatch>` (wraps `testSchedulerRunScheduled('ivr-collect')`); `networkErrorOutcome(ticker)` mirroring the scraper's `network_error` member (`barchart-ivr-scraper.ts:56-62`); `seedBenchAndSettle(page, { positions, watchlist })` that seeds via the production IPCs, then `expect.poll(readIvrFetchLog)` until every seeded ticker appears (so the Background's own on-add collections have finished before a test resets the log).
- `e2e/trading-day-fixtures.ts`: `sessionCloseOn(day)` — 16:00 ET on `day` as an ISO instant, computed with `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })` the way `core/trading-calendar.ts` does, so the expected stamp is right in both EDT and EST.

**Refactor — cleanup to consider:**

- `IvrOutcome` in `ivr-helpers.ts` grows a fourth member; keep the helper functions one line each.

**Acceptance criteria covered:**

- Observability for every "no IVR request is made for …" clause and both scheduled-run scenarios.

### 8. E2e Tests

**Files to create or modify:**

- `e2e/ivr-on-demand.spec.ts` — new, one test per AC, names verbatim
- `e2e/ivr-collector.spec.ts` — rewrite three guard tests onto the scheduled trigger; move `SAME_DAY_*` constants onto `fakeNowAt(...)` and expect `sessionCloseOn(FAKE_NOW_DAY)`
- `e2e/ivr-watchlist-collection.spec.ts:209` — expect the session close, not the fetch instant

Background for every US-100 test: `seedBenchAndSettle(page, { positions: ['MSFT'], watchlist: ['KO'] })`, then `setIvrOutcomes(...)` (which also resets the fetch log) with the scenario's outcomes. Default launch is `launchIvrApp(dbPath)` (weekday, after close) unless the scenario names a day.

**Red — tests to write (`e2e/ivr-on-demand.spec.ts`):**

- `it('Adding a ticker to the watchlist collects its IVR immediately')` — program `okOutcome('AAPL', …)`; add AAPL **through the Watchlist add form** (not the IPC) so the push path is exercised; `expect.poll(readIvrSnapshots)` contains an AAPL row; `expect.poll(() => ivrCell(page, 'AAPL'))` reads the value with a non-`empty` state **without** reloading the page. Falsifiable: without the push event the cell stays `n/a`.
- `it('Adding a ticker collects only that ticker')` — add AAPL; `readIvrFetchLog()` equals `['AAPL']` (KO and MSFT absent).
- `it('Adding a ticker that already has a reading for the day does not refetch')` — add AAPL, wait for its row, `removeFromWatchlist(page,'AAPL')`, `setIvrOutcomes` with a _different_ AAPL value (resets log), add AAPL again; log contains no `AAPL` and the row's `ivr` is the first value.
- `it('The add succeeds even when the IVR fetch fails')` — `networkErrorOutcome('AAPL')`; add via the form; the AAPL card renders, no inline/root error text is visible, `readIvrSnapshots()` has no AAPL row. (Warn-level clause is pinned by `ivr-on-demand.test.ts`; the e2e suite has no log seam — note this in the test.)
- `it('A ticker Barchart does not cover is added without an IV rank')` — `notAvailableOutcome('XYZ')`; add XYZ; card renders and `ivrCell(page,'XYZ')` state is `empty` / text `n/a`.
- `it('Opening a position collects its IVR immediately')` — `okOutcome('TSLA', …)`; `seedActivePosition(page,'TSLA')`; `expect.poll(readIvrSnapshots)` contains a TSLA row; fetch log equals `['TSLA']`.
- `it('Opening a position for an already-collected ticker does not refetch')` — KO already collected by the Background; after reset, `seedActivePosition(page,'KO')`; log contains no `KO`.
- `it('The position is created even when the IVR fetch fails')` — `networkErrorOutcome('TSLA')`; `createPosition` resolves `ok: true`; no TSLA row.
- `it('Manual refresh works on a weekend')` — launch with `fakeNow: afterCloseOn(mostRecent(0))` (Sunday); `collectIvrNow` → `skippedReason === null`, `successCount === 2`, log contains `KO` and `MSFT`.
- `it('Manual refresh works on a weekday market holiday')` — pick `holiday = sessionsBefore(BASE_DAY, 2)`, launch with `fakeNow: afterCloseOn(holiday), marketCalendar: weekdayCalendar([holiday])`; `collectIvrNow` → log contains `KO` and `MSFT`, `skippedReason === null`.
- `it('A weekend reading is stored against the trading day it belongs to')` — Sunday launch; `friday = sessionsBefore(mostRecent(0), 1)`; after `collectIvrNow`, the KO rows filter to exactly one and its `observed_at === sessionCloseOn(friday)`.
- `it('The scheduled run still skips a weekend')` — launch `fakeNow: afterCloseOn(mostRecent(6))` (Saturday); `collectIvrScheduled` → `skippedReason === 'market_closed'`, fetch log `[]`.
- `it('The scheduled run still fires after hours on a weekday')` — default launch; `collectIvrScheduled` → `successCount === 2`, log contains `KO` and `MSFT`.

**Red — existing specs to rewrite:**

- `ivr-collector.spec.ts` "AC: Market is closed on a non-trading day", "A recognised weekday holiday skips collection with no fetch", "The holiday guard still holds with no broker configured" → drive `collectIvrScheduled` instead of `collectIvrNow`; assertions unchanged.
- `ivr-collector.spec.ts` "AC: Successful snapshot is persisted" / "AC: Re-running on the same calendar day overwrites the existing row" and `ivr-watchlist-collection.spec.ts:209` → expected `observed_at` is `sessionCloseOn(FAKE_NOW_DAY)`; replace the hard-coded `2026-05-29…` constants with `fakeNowAt('14:05:00.000Z')` / `fakeNowAt('20:55:00.000Z')` so the observation is inside the 45-day read window and actually stamped (today those dates sit outside the window and would silently take the unstamped fallback).

**Green — implementation:**

- Nothing beyond areas 1–7; this area only adds and rewrites tests.

**Refactor — cleanup to consider:**

- If `ivr-collector.spec.ts` and `ivr-on-demand.spec.ts` both need Sunday/Saturday launches, hoist `weekendLaunch(page, weekday)` into `ivr-helpers.ts`.

**Acceptance criteria covered:**

- All 13 scenarios, one test each (see audit).

## AC Audit

| #   | AC (verbatim scenario title)                                            | E2e test (area 8)                                          |
| --- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Adding a ticker to the watchlist collects its IVR immediately           | same-named `it` in `ivr-on-demand.spec.ts`                 |
| 2   | Adding a ticker collects only that ticker                               | same-named `it`                                            |
| 3   | Adding a ticker that already has a reading for the day does not refetch | same-named `it`                                            |
| 4   | The add succeeds even when the IVR fetch fails                          | same-named `it` (+ warn clause in `ivr-on-demand.test.ts`) |
| 5   | A ticker Barchart does not cover is added without an IV rank            | same-named `it`                                            |
| 6   | Opening a position collects its IVR immediately                         | same-named `it`                                            |
| 7   | Opening a position for an already-collected ticker does not refetch     | same-named `it`                                            |
| 8   | The position is created even when the IVR fetch fails                   | same-named `it` (+ warn clause in unit)                    |
| 9   | Manual refresh works on a weekend                                       | same-named `it`                                            |
| 10  | Manual refresh works on a weekday market holiday                        | same-named `it`                                            |
| 11  | A weekend reading is stored against the trading day it belongs to       | same-named `it`                                            |
| 12  | The scheduled run still skips a weekend                                 | same-named `it`                                            |
| 13  | The scheduled run still fires after hours on a weekday                  | same-named `it`                                            |

Every AC has exactly one e2e test; none are lumped.

## Out of scope (from the story, restated so `/plan-tasks` does not invent work)

- Changing the `afterClose + 60min` cadence; backfilling IVR history for tickers already on the
  watchlist; the Barchart scraper itself; staleness tiers and `IvrCell` rendering; any Alpaca-derived
  IV rank; the screener's IV-rank floor.
- The `PollingScheduler.runNow` error-propagation cleanup noted at the foot of the trading-day
  follow-up remains untaken (shared US-46 infrastructure).

## Spec follow-through (after completion)

`/update-spec us-100` should: amend the `ivr-non-trading-day-guard-in-collector` ADR (guard is
trigger-scoped), amend `ivr-same-day-overwrite-delete-then-insert` (window is the session, stamp is
the close), add the `ivr:snapshot-updated` push event and the two dev-only channels to
`contracts/ipc-handlers.md`, mark `followup-ivr-trading-day-calendar.md`'s trigger half closed, and
note in `us-98` that `observed_at` now names the session close.
