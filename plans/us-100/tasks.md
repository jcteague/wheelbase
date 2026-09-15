# US-100 — Collect IVR on watchlist add and outside market hours — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Read `plans/us-100/plan.md`, `research.md`, `data-model.md` and `contracts/*.md` before starting any area
- No migration in this story. `ivr_snapshot`, `watchlist`, `trading_session` are unchanged in shape

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### Core: Session Observation Window

- [x] **[Red]** Write failing tests — `src/main/core/trading-calendar.test.ts`
  - Test cases:
    - `observationWindowOf(calendar, session)` returns `{ from: session.closeAt, to: nextSession.closeAt }` for a mid-calendar session (Fri → Mon when Sat/Sun are closures; Wed → Fri when Thu is a holiday)
    - Returns `{ from: session.closeAt, to: null }` when the session is the last one in `calendar.sessions`
    - Returns `null` when `session.date` is not an `open` day of the calendar (unknown day or closure)
    - Module stays pure: no import beyond `date-fns` (existing lint keeps this honest)
  - Run `pnpm test src/main/core/trading-calendar.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/trading-calendar.ts` _(depends on: Core Red ✓)_
  - `export function observationWindowOf(calendar: TradingCalendar, session: TradingSession): { from: string; to: string | null } | null`, placed beside `getMostRecentCompletedSession`
  - Validate via `getTradingSession(calendar, session.date)`; `to = calendar.sessions.find((s) => s.date > session.date)?.closeAt ?? null`
  - Run `pnpm test src/main/core/trading-calendar.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/trading-calendar.ts` _(depends on: Core Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Reuse existing `covers`/`getTradingSession` helpers rather than re-walking `sessions`; doc comment in the neighbouring style ("the half-open interval every reading between two closes belongs to")
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Scheduler: Run Context with a Trigger

- [x] **[Red]** Write failing tests — `src/main/services/polling-scheduler.test.ts`
  - Test cases:
    - A timer tick invokes the handler with `{ trigger: 'scheduled' }` (register an `interval` job, advance the fake clock, assert the handler mock's first argument)
    - `runNow('job')` invokes the handler with `{ trigger: 'explicit' }`
    - `runNow('job', { trigger: 'scheduled' })` invokes the handler with `{ trigger: 'scheduled' }`
    - `runNow` while a run is in flight joins it and does **not** invoke the handler a second time (extend the existing "joins the in-flight run" case: handler call count is 1, no second context passed)
    - Existing zero-arg handlers (`async () => {}`) still type-check and run (`seedTestJobsFromEnv` fixtures in `src/main/ipc/test-scheduler.ts` compile unchanged)
  - Run `pnpm test src/main/services/polling-scheduler.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/polling-scheduler.ts` _(depends on: Scheduler Red ✓)_
  - `export type JobTrigger = 'scheduled' | 'explicit'`, `export type JobRunContext = { trigger: JobTrigger }`, `export type JobHandler = (ctx: JobRunContext) => Promise<unknown>`
  - `runHandler(state, ctx)` and `runTracked(state, ctx)` take the context; `tick` passes `{ trigger: 'scheduled' }`
  - `runNow(jobName, { trigger = 'explicit' }: { trigger?: JobTrigger } = {})` passes `{ trigger }`; update `PollingScheduler.runNow` on the interface
  - Run `pnpm test src/main/services/polling-scheduler.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/polling-scheduler.ts` _(depends on: Scheduler Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - The join-in-flight comment on `JobState.running` should mention that a joined run keeps the trigger it started with
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Renderer: Snapshot-Updated Hook + Retire Dead "Market Closed" Branch

> Shares `src/preload/index.ts` / `index.d.ts` with the Test Seams area (Layer 2). Keep the preload edit additive (one `onSnapshotUpdated` entry under `ivr`) so the later edit merges cleanly.

- [x] **[Red]** Write failing tests — `src/renderer/src/hooks/useIvrSnapshotUpdates.test.ts` (new), `src/renderer/src/pages/SettingsPage.test.tsx`
  - Test cases:
    - `useIvrSnapshotUpdates` subscribes via `window.api.ivr.onSnapshotUpdated` on mount; on an event `{ ticker: 'AAPL' }` it calls `queryClient.invalidateQueries` for `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results` (mirror `useStockQuotes.test.ts`'s callback-capture pattern)
    - The unsubscribe returned by `onSnapshotUpdated` is called on unmount
    - `SettingsPage.test.tsx`: manual-refresh success message shows `N snapshots saved, M errors` for a summary with `skippedReason: null`; **delete** the "shows a skipped message when the collector reports market_closed" test
  - Run `pnpm test src/renderer/src/hooks/useIvrSnapshotUpdates.test.ts src/renderer/src/pages/SettingsPage.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/hooks/useIvrSnapshotUpdates.ts`, `src/renderer/src/pages/WatchlistPage.tsx`, `src/renderer/src/pages/SettingsPage.tsx` _(depends on: Renderer Red ✓)_
  - Preload: `ivr: { collectNow: …, onSnapshotUpdated: onIpcEvent<{ ticker: string }>('ivr:snapshot-updated') }`; `index.d.ts` adds `onSnapshotUpdated: (cb: (event: { ticker: string }) => void) => () => void`
  - `useIvrSnapshotUpdates()` — `useEffect` subscribing and invalidating both query keys; returns nothing
  - `WatchlistPage`: call `useIvrSnapshotUpdates()` beside `useWatchlistSnapshot()`
  - `SettingsPage.tsx` (~line 511): drop the `skippedReason === 'market_closed'` branch; success path renders the saved/errors line unconditionally. `CollectIvrNowResult.skippedReason` in `src/renderer/src/api/ivr.ts` stays (envelope unchanged)
  - Tailwind + `wb-*` tokens only; no inline styles
  - Run `pnpm test src/renderer/src/hooks/useIvrSnapshotUpdates.test.ts src/renderer/src/pages/SettingsPage.test.tsx` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/hooks/useIvrSnapshotUpdates.ts` _(depends on: Renderer Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - If `MessageText`'s tone plumbing in `SettingsPage` only existed for the muted "market closed" case, simplify it; otherwise leave
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Collector + Test Seams (depends on Layer 1)

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### Collector: Trigger Split, Shared Per-Ticker Body, Session Stamping

**Requires:** Core Green ✓ (`observationWindowOf`)

- [x] **[Red]** Write failing tests — `src/main/services/ivr-collector.test.ts` _(depends on: Core Green ✓)_
  - Trigger split (2026 calendar seeded):
    - Clock `2026-05-23T17:00:00Z` (Saturday), `collectIVRSnapshots({ trigger: 'scheduled' })` → `skippedReason: 'market_closed'`, `fetchIvr` not called (make `trigger` explicit in the existing weekend case)
    - Same clock, `trigger: 'explicit'` → `fetchIvr` called for every target, `skippedReason: null`, info log records the closed verdict was overridden (`ivr_collection_explicit_on_closed_day` or equivalent)
    - Omitting `trigger` behaves as `'scheduled'`
    - Weekday holiday `2026-11-26`: `'explicit'` collects, `'scheduled'` skips (extend the existing holiday case)
  - Stamping:
    - Clock `2026-05-29T21:30:00Z`, `ok` result with `observedAt: '2026-05-29T21:05:00.000Z'` persists `observed_at === '2026-05-29T20:00:00.000Z'` (update "persists a successful Barchart snapshot as decimal strings")
    - Sunday fetch `2026-05-31T15:00:00.000Z` → stamped Friday `2026-05-29T20:00:00.000Z`
    - Thanksgiving fetch `2026-11-26T23:00:00.000Z` → stamped Wednesday `2026-11-25T21:00:00.000Z` (EST)
    - Intraday fetch on an open session `2026-05-29T14:05:00.000Z` → stamped Thursday `2026-05-28T20:00:00.000Z`
    - Empty `trading_session`, no provider → raw `observedAt` persisted, warn `ivr_observation_unstamped`
  - Session-window dedupe:
    - Existing row at `2026-05-29T20:00:00.000Z` + Sunday fetch → exactly one SPY row, stamped Friday, new value (rewrite "re-running on the same UTC calendar day…" as "re-collecting within the same session replaces the earlier row")
    - Legacy fetch-instant row at `2026-05-30T01:00:00.000Z` is swept by a re-collection of Friday's session (rewrite "uses the UTC calendar day instead of slicing…")
    - Row from the _previous_ session `2026-05-28T20:00:00.000Z` is **not** deleted by a Friday collection (two rows remain)
  - Extraction:
    - `collectTicker` returns `'persisted'` / `'not_available'` / `'failed'` for the three result classes; `'failed'` when `fetchIvr` throws (warn with `err` key); rethrows when `persistSnapshot` throws (existing "rethrows a persist failure" case now targets the helper via the batch)
    - Batch tallies unchanged for existing union/isolation/abort cases (must stay green untouched)
  - Run `pnpm test src/main/services/ivr-collector.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/ivr-collector.ts` _(depends on: Collector Red ✓)_
  - `CollectIVRSnapshotsInput.trigger?: 'scheduled' | 'explicit'` defaulting to `'scheduled'`; guard becomes `if (session.status === 'closed' && trigger === 'scheduled')`; for `'explicit'` on a closed day `logger.info({ etDate, trigger }, 'IVR collection proceeding on a closed day at explicit request')`
  - `export type TickerOutcome = 'persisted' | 'not_available' | 'failed'`; `export async function collectTicker({ db, logger, fetchIvr, calendar, ticker }: CollectTickerInput): Promise<TickerOutcome>` — moves try/catch + switch out of the loop; `persistSnapshot(db, calendar, result)` stays outside the try
  - `persistSnapshot(db, calendar, result)`: `session = getMostRecentCompletedSession(calendar, parseISO(result.data.observedAt))`; `stamp = session?.closeAt ?? result.data.observedAt`; window = `session ? observationWindowOf(calendar, session) : null`; delete `observed_at >= from AND (to IS NULL OR observed_at < to)` when a window exists, else existing `utcDayBounds` delete; insert with `stamp`. Warn `ivr_observation_unstamped` when `session === null`; debug `ivr_snapshot_persisted` with `{ ticker, stamp }`
  - Batch loop: `const outcome = await collectTicker(...)` + tally (`persisted → successCount`, `not_available → skippedCount`, `failed → errorCount`); abort check stays at the ticker boundary; `calendar` read once per run
  - Run `pnpm test src/main/services/ivr-collector.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/ivr-collector.ts` _(depends on: Collector Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `utcDayBounds` survives only as the unstamped fallback — name and comment it as such
  - Keep the collector free of `trigger` knowledge beyond the one guard line; do not thread it into `collectTicker`
  - Check `docs/spec/architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md` still describes the extracted helper (note drift for `/update-spec`, do not rewrite the ADR here)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Test Seams: Fetch Log, Scheduled-Trigger Run, E2E Helpers

**Requires:** Scheduler Green ✓ (`runNow(jobName, { trigger })`)

> Shares `src/preload/index.ts` / `index.d.ts` with the Renderer area (Layer 1). Add `testIvrFetchLog` and `testSchedulerRunScheduled` beside the existing `_test:*` entries.

- [x] **[Red]** Write failing tests — `src/main/ipc/test-ivr.test.ts`, `src/main/ipc/test-scheduler.test.ts` (or the file that already covers `test-scheduler.ts`) _(depends on: Scheduler Green ✓)_
  - Test cases:
    - `fake-ivr` (via `test-ivr.test.ts` unless a `fake-ivr.test.ts` exists): each `fetchIvr` call appends the upper-cased ticker to the log; `setFakeIvrOutcomes` clears it
    - `_test:ivr-fetch-log` returns the log; after `_test:ivr-set-outcomes` it returns `[]`
    - `_test:scheduler-run-scheduled` calls `scheduler.runNow(jobName, { trigger: 'scheduled' })` and returns the handler result (mock the scheduler)
  - Run `pnpm test src/main/ipc/test-ivr.test.ts src/main/ipc/test-scheduler.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/fake-ivr.ts`, `src/main/ipc/test-ivr.ts`, `src/main/ipc/test-scheduler.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `e2e/ivr-helpers.ts`, `e2e/trading-day-fixtures.ts` _(depends on: Test Seams Red ✓)_
  - `fake-ivr.ts`: `let fetchLog: string[] = []`; `fakeFetchIvr` pushes `key` before returning; `setFakeIvrOutcomes` sets `fetchLog = []`; `export function readFakeIvrFetchLog(): string[]`
  - `test-ivr.ts`: `ipcMain.handle('_test:ivr-fetch-log', () => readFakeIvrFetchLog())`
  - `test-scheduler.ts`: `ipcMain.handle('_test:scheduler-run-scheduled', (_, jobName: string) => scheduler.runNow(jobName, { trigger: 'scheduled' }))` — returns the result (unlike `_test:scheduler-run-now`)
  - Preload + `.d.ts`: `testIvrFetchLog`, `testSchedulerRunScheduled`
  - `e2e/ivr-helpers.ts`: `readIvrFetchLog(page): Promise<string[]>`; `collectIvrScheduled(page): Promise<IvrBatch>` (wraps `testSchedulerRunScheduled('ivr-collect')`); `networkErrorOutcome(ticker)` mirroring the scraper's `network_error` member (`barchart-ivr-scraper.ts:56-62`); `seedBenchAndSettle(page, { positions, watchlist })` seeds via production IPCs then `expect.poll(readIvrFetchLog)` until every seeded ticker appears
  - `e2e/trading-day-fixtures.ts`: `sessionCloseOn(day)` — 16:00 ET on `day` as an ISO instant via `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })` (correct in both EDT and EST)
  - Run `pnpm test src/main/ipc/test-ivr.test.ts src/main/ipc/test-scheduler.test.ts` — all tests must pass; `pnpm typecheck` covers the e2e helpers
- [x] **[Refactor]** `/refactor` — `e2e/ivr-helpers.ts`, `src/main/integrations/fake-ivr.ts` _(depends on: Test Seams Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `IvrOutcome` in `ivr-helpers.ts` grows a fourth member; keep the helper functions one line each
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — On-Demand Collection Service (depends on Layer 2)

### On-Demand Service

**Requires:** Collector Green ✓ (`collectTicker`, session-stamped `persistSnapshot`)

- [x] **[Red]** Write failing tests — `src/main/services/ivr-on-demand.test.ts` (new) _(depends on: Collector Green ✓)_
  - Test cases:
    - `collect('aapl')` with no snapshot calls `fetchIvr` exactly once with `'AAPL'`, persists one row stamped at the current trading day's close, logs info `ivr_on_demand_collected`, invokes `onCollected('AAPL')`
    - Never touches batch targets: with KO on the watchlist and MSFT open, `collect('AAPL')` makes no `fetchIvr` call for KO or MSFT
    - AAPL row already attributed to the current trading day (row at Friday's `closeAt`, clock Sunday) → no fetch, row unchanged, debug `ivr_on_demand_already_collected`, `onCollected` not called
    - AAPL row attributed to the _previous_ session (Thursday's close, clock Friday 21:30Z) → fetches and writes Friday's row (two rows remain)
    - Empty calendar (`trading_session` empty, `getProvider` throws) → dedupe falls back to ET-date equality: a row stamped earlier today skips; a row from yesterday fetches and persists unstamped
    - `fetchIvr` rejecting → resolves (never rejects), no row, warn `IVR collection threw for ticker`, `onCollected` not called
    - `fetchIvr` resolving `network_error` → resolves, no row, warn logged, `onCollected` not called
    - `fetchIvr` resolving `not_available` → resolves, no row, info logged, `onCollected` not called
    - `persistSnapshot` failure (e.g. `db.close()` before collect) → resolves, error `ivr_on_demand_failed`
    - `ensureTradingCalendar` is awaited before the read: with `needsRefresh` true and a provider returning a calendar, the persisted row is stamped, not raw
  - Run `pnpm test src/main/services/ivr-on-demand.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/ivr-on-demand.ts` (new) _(depends on: On-Demand Red ✓)_
  - `export type IvrOnDemand = { collect(ticker: string): Promise<void> }` (doc the never-rejects guarantee on the type like `ensureTradingCalendar` does)
  - `export function createIvrOnDemand({ db, getProvider, fetchIvr = fetchIVR, clock = { now: () => new Date() }, logger = defaultLogger, onCollected }: CreateIvrOnDemandDeps): IvrOnDemand`
  - State machine from `data-model.md`: normalize ticker → `now = clock.now()` → `await ensureTradingCalendar(db, getProvider, now)` → `calendar = readTradingCalendar(db, now)` → `today = getMostRecentCompletedSession(calendar, now)` → `latest = getLatestIvrByUnderlying(db, [ticker]).get(ticker)` → skip if `latest` belongs to today (session `.date` equality; `etDateOf` equality when `today === null`) → `outcome = await collectTicker(...)` → on `'persisted'` info `ivr_on_demand_collected` + `onCollected?.(ticker)`
  - Whole body in `try { … } catch (err) { logger.error({ ticker, err }, 'ivr_on_demand_failed') }`
  - Run `pnpm test src/main/services/ivr-on-demand.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/ivr-on-demand.ts` _(depends on: On-Demand Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - The "belongs to the same session" predicate mirrors `persistSnapshot`'s window; if both read naturally as one pure helper (`sessionDateOf(calendar, instant)`), extract it into `core/trading-calendar.ts`; otherwise leave inline
  - Run the code-simplifier on the new module
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Wire the Port (depends on Layers 1–3)

### Wiring: Services, IPC Registration, Composition

**Requires:** Scheduler Green ✓, Collector Green ✓, On-Demand Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/watchlist.test.ts`, `src/main/services/positions.test.ts`, `src/main/ipc/watchlist.test.ts`, `src/main/ipc/positions.test.ts`, `src/main/index.test.ts` _(depends on: Scheduler Green ✓, Collector Green ✓, On-Demand Green ✓)_
  - Test cases:
    - `addWatchlistEntry(db, payload, port)` calls `port.collect('AAPL')` (normalised) exactly once **after** the row exists (assert the row is present inside the fake `collect`)
    - `addWatchlistEntry` for a duplicate ticker throws `ValidationError('ticker','duplicate')` and never calls `collect`
    - `addWatchlistEntry(db, payload)` with no port behaves as before (existing cases stay green)
    - `createPosition(db, payload, port)` calls `port.collect(payload.ticker)` once after the transaction; a lifecycle rejection (bad expiration) never calls it; no port → unchanged
    - `positions:create` handler passes the registered `ivrOnDemand` as the third arg of `createPosition`; `watchlist:add` does the same for `addWatchlistEntry` (mock the services, assert call args). Handlers stay a single service call
    - `index.test.ts`: `ivr-collect` handler invoked with `{ trigger: 'explicit' }` calls `collectIVRSnapshots` with `trigger: 'explicit'` (and `'scheduled'` when so invoked); `createIvrOnDemand` constructed once with the fake collaborators' `fetchIvr`/`clock`, same instance passed to `registerWatchlistIpc` and `registerPositionsHandlers`; `onCollected('AAPL')` sends `('ivr:snapshot-updated', { ticker: 'AAPL' })` on the main window's `webContents` and is a no-op when the window is null
  - Run `pnpm test src/main/services/watchlist.test.ts src/main/services/positions.test.ts src/main/ipc/watchlist.test.ts src/main/ipc/positions.test.ts src/main/index.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/watchlist.ts`, `src/main/services/positions.ts`, `src/main/ipc/watchlist.ts`, `src/main/ipc/positions.ts`, `src/main/index.ts` _(depends on: Wiring Red ✓)_
  - `watchlist.ts`: `addWatchlistEntry(db, payload, ivrOnDemand?: IvrOnDemand)`; after `logger.info({ ticker }, 'watchlist_entry_added')` add `void ivrOnDemand?.collect(ticker)`
  - `positions.ts`: `createPosition(db, payload, ivrOnDemand?: IvrOnDemand)`; after the transaction and the `position_created` info log (add one if absent) `void ivrOnDemand?.collect(payload.ticker)`
  - `ipc/watchlist.ts`: `registerWatchlistIpc({ …, ivrOnDemand?: IvrOnDemand })`, passed as third arg. `ipc/positions.ts`: `registerPositionsHandlers(db, { ivrOnDemand }: { ivrOnDemand?: IvrOnDemand } = {})`, passed as third arg to `createPosition`
  - `index.ts`: `const ivrOnDemand = createIvrOnDemand({ db, logger, getProvider: () => marketDataFactory.create(), onCollected: (ticker) => mainWindow?.webContents.send('ivr:snapshot-updated', { ticker }), ...ivrCollaborators })` right after `ivrCollaborators`; pass to both registrations (move `registerPositionsHandlers` after `ivrCollaborators` if needed); `ivr-collect` handler becomes `async ({ trigger }) => collectIVRSnapshots({ …, trigger })`
  - Run the same test files — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/watchlist.ts`, `src/main/services/positions.ts`, `src/main/ipc/positions.ts`, `src/main/index.ts` _(depends on: Wiring Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Both services end with the same two lines (info log, `void ivrOnDemand?.collect`); that is two call sites of a port, not a concept — **do not abstract**
  - `registerPositionsHandlers` becomes the second registration taking an options object; match `registerWatchlistIpc`'s destructured style
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

> Switch ABI first: `pnpm rebuild:electron`. Switch back with `pnpm rebuild:node` before any later `pnpm test`.
> Background for every US-100 test: `seedBenchAndSettle(page, { positions: ['MSFT'], watchlist: ['KO'] })`, then `setIvrOutcomes(...)` (resets the fetch log) with the scenario's outcomes. Default launch is `launchIvrApp(dbPath)` (weekday, after close) unless the scenario names a day.

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/ivr-on-demand.spec.ts` (new); rewrite `e2e/ivr-collector.spec.ts`, `e2e/ivr-watchlist-collection.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC, names verbatim:
    - AC-1: Adding a ticker to the watchlist collects its IVR immediately → `it('Adding a ticker to the watchlist collects its IVR immediately')` — `okOutcome('AAPL', …)`; add AAPL **through the Watchlist add form** (not the IPC); `expect.poll(readIvrSnapshots)` contains AAPL; `expect.poll(() => ivrCell(page, 'AAPL'))` non-`empty` state **without reload**. Falsifiable: without the push event the cell stays `n/a`
    - AC-2: Adding a ticker collects only that ticker → `it('Adding a ticker collects only that ticker')` — `readIvrFetchLog()` equals `['AAPL']`
    - AC-3: Adding a ticker that already has a reading for the day does not refetch → `it('Adding a ticker that already has a reading for the day does not refetch')` — add, wait for row, `removeFromWatchlist`, `setIvrOutcomes` with a different AAPL value, add again; log has no `AAPL`, row keeps the first value
    - AC-4: The add succeeds even when the IVR fetch fails → `it('The add succeeds even when the IVR fetch fails')` — `networkErrorOutcome('AAPL')`; card renders, no error text, no AAPL row (warn clause pinned by `ivr-on-demand.test.ts`; note in test)
    - AC-5: A ticker Barchart does not cover is added without an IV rank → `it('A ticker Barchart does not cover is added without an IV rank')` — `notAvailableOutcome('XYZ')`; card renders, `ivrCell` state `empty` / text `n/a`
    - AC-6: Opening a position collects its IVR immediately → `it('Opening a position collects its IVR immediately')` — `okOutcome('TSLA', …)`; `seedActivePosition(page,'TSLA')`; TSLA row; log equals `['TSLA']`
    - AC-7: Opening a position for an already-collected ticker does not refetch → `it('Opening a position for an already-collected ticker does not refetch')` — after reset, `seedActivePosition(page,'KO')`; log has no `KO`
    - AC-8: The position is created even when the IVR fetch fails → `it('The position is created even when the IVR fetch fails')` — `networkErrorOutcome('TSLA')`; `createPosition` resolves `ok: true`; no TSLA row
    - AC-9: Manual refresh works on a weekend → `it('Manual refresh works on a weekend')` — `fakeNow: afterCloseOn(mostRecent(0))` (Sunday); `collectIvrNow` → `skippedReason === null`, `successCount === 2`, log contains `KO` and `MSFT`
    - AC-10: Manual refresh works on a weekday market holiday → `it('Manual refresh works on a weekday market holiday')` — `holiday = sessionsBefore(BASE_DAY, 2)`; `fakeNow: afterCloseOn(holiday), marketCalendar: weekdayCalendar([holiday])`; log contains `KO`, `MSFT`; `skippedReason === null`
    - AC-11: A weekend reading is stored against the trading day it belongs to → `it('A weekend reading is stored against the trading day it belongs to')` — Sunday launch; `friday = sessionsBefore(mostRecent(0), 1)`; after `collectIvrNow` KO rows filter to exactly one with `observed_at === sessionCloseOn(friday)`
    - AC-12: The scheduled run still skips a weekend → `it('The scheduled run still skips a weekend')` — `fakeNow: afterCloseOn(mostRecent(6))` (Saturday); `collectIvrScheduled` → `skippedReason === 'market_closed'`, fetch log `[]`
    - AC-13: The scheduled run still fires after hours on a weekday → `it('The scheduled run still fires after hours on a weekday')` — default launch; `collectIvrScheduled` → `successCount === 2`, log contains `KO`, `MSFT`
  - Existing specs to rewrite:
    - `ivr-collector.spec.ts` "AC: Market is closed on a non-trading day", "A recognised weekday holiday skips collection with no fetch", "The holiday guard still holds with no broker configured" → drive `collectIvrScheduled` instead of `collectIvrNow`; assertions unchanged
    - `ivr-collector.spec.ts` "AC: Successful snapshot is persisted" / "AC: Re-running on the same calendar day overwrites the existing row" and `ivr-watchlist-collection.spec.ts:209` → expected `observed_at` is `sessionCloseOn(FAKE_NOW_DAY)`; replace hard-coded `2026-05-29…` constants with `fakeNowAt('14:05:00.000Z')` / `fakeNowAt('20:55:00.000Z')` so the observation is inside the 45-day read window and actually stamped
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Nothing beyond Layers 1–4; fix wiring gaps surfaced by the specs only
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests — `e2e/ivr-on-demand.spec.ts`, `e2e/ivr-collector.spec.ts`, `e2e/ivr-helpers.ts` _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - If `ivr-collector.spec.ts` and `ivr-on-demand.spec.ts` both need Sunday/Saturday launches, hoist `weekendLaunch(page, weekday)` into `ivr-helpers.ts`

---

## Out of Scope (do not invent work)

- Changing the `afterClose + 60min` cadence; backfilling IVR history for tickers already on the watchlist; the Barchart scraper itself; staleness tiers and `IvrCell` rendering; any Alpaca-derived IV rank; the screener's IV-rank floor
- The `PollingScheduler.runNow` error-propagation cleanup (shared US-46 infrastructure)

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (13 of 13, one `it()` each, names verbatim)
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] `/update-spec us-100` — amend `ivr-non-trading-day-guard-in-collector` and `ivr-same-day-overwrite-delete-then-insert` ADRs, add `ivr:snapshot-updated` + the two dev-only channels to `contracts/ipc-handlers.md`, mark `followup-ivr-trading-day-calendar.md`'s trigger half closed, note in `us-98` that `observed_at` now names the session close
