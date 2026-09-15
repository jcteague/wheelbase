# Research: US-100 — Collect IVR on watchlist add and outside market hours

**Story:** Linear [OPT-6](https://linear.app/optionswheel/issue/OPT-6/us-100-collect-ivr-on-watchlist-add-and-outside-market-hours)
(archived draft: `docs/epics/06-stories/US-100-collect-ivr-on-demand-and-outside-market-hours.md`).
**Mockup:** none (`mockups/us-100-*.mdx` does not exist; the only renderer change is a
cache invalidation, not a new surface).

## Current state (verified against `src/`, 2026-09-14, after US-116 landed)

| Concern                        | Where it is today                                                                                                                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Non-trading-day guard          | Top of `collectIVRSnapshots` (`src/main/services/ivr-collector.ts`): `getTradingSession(readTradingCalendar(db, now), etDateOf(now))` — `closed` → return `skippedReason: 'market_closed'`; `unavailable` → warn and continue; `open` → collect.     |
| Manual trigger                 | `ivr:collect-now` (`src/main/ipc/ivr.ts`) → `scheduler.runNow(IVR_COLLECT_JOB_NAME)` → the registered handler in `src/main/index.ts` → `collectIVRSnapshots`. Inherits the guard, so a weekend refresh is refused.                                   |
| Scheduler run tracking         | `createPollingScheduler` (`src/main/services/polling-scheduler.ts`): `JobState.running` — a tick during an in-flight run is skipped, `runNow` **joins** the in-flight promise. `JobHandler = () => Promise<unknown>`; nothing is passed to handlers. |
| Per-ticker body                | Inline in the batch loop: `fetchIvr` in try/catch → switch on `result.status` → `persistSnapshot` (outside the try — a DB fault is systemic).                                                                                                        |
| Same-day overwrite             | `persistSnapshot` deletes rows for the same underlying within the **UTC calendar day** of `result.data.observedAt`, then inserts.                                                                                                                    |
| Observation timestamp          | `barchart-ivr-scraper.ts:329` stamps `observedAt: new Date().toISOString()` at parse time — the _fetch_ instant, not Barchart's observation.                                                                                                         |
| Freshness attribution          | `getMostRecentCompletedSession(calendar, instant)` (`src/main/core/trading-calendar.ts`) — "an observation belongs to the latest session whose close is at or before its timestamp". Already pure and exactly the helper the story asks for.         |
| Latest reading per ticker      | `getLatestIvrByUnderlying(db, tickers)` (`src/main/services/ivr-snapshots.ts`) → `Map<ticker, { value, observedAt }>`.                                                                                                                               |
| Calendar refresh               | `refreshTradingCalendar(db, provider, now)` (weekly throttle, collector calls it directly); `ensureTradingCalendar(db, getProvider, now)` (US-116, never rejects, shared in-flight promise, used by the bench).                                      |
| Watchlist add                  | `addWatchlistEntry(db, payload)` (`src/main/services/watchlist.ts`), sync, single INSERT; IPC `watchlist:add` is thin (`registerWatchlistIpc({ db, getProvider, getCurrentDate })`).                                                                 |
| Position create                | `createPosition(db, payload)` (`src/main/services/positions.ts`), sync transaction; IPC `positions:create` via `registerPositionsHandlers(db)`.                                                                                                      |
| Bench refresh                  | `useWatchlistSnapshot` has **no** `refetchInterval` by design; `useAddToWatchlist` invalidates `watchlistQueryKeys.snapshot` + `screenerQueryKeys.results` on success — i.e. before any on-add collection could have landed.                         |
| main → renderer push precedent | `market-data:stock-quote` via `webContents.send` in `src/main/ipc/market-data.ts`; preload `onIpcEvent(channel)` helper; renderer subscribes in `useStockQuotes`.                                                                                    |
| e2e seams                      | `WHEELBASE_FAKE_IVR` → `createFakeIvrCollaborators()` (`fetchIvr` + `clock`); `_test:ivr-set-outcomes`, `_test:ivr-set-now`, `_test:ivr-snapshots`; `_test:scheduler-run-now` (discards result). No fetch log exists.                                |
| Follow-up this story subsumes  | `docs/epics/06-stories/followup-ivr-trading-day-calendar.md` — already **resolved by US-98** (calendar-backed guard). What remains for this story is the trigger split; `isTradingDay` no longer exists.                                             |

Existing e2e assertions that pin the current fetch-instant stamping and will change:
`e2e/ivr-collector.spec.ts` ("Successful snapshot is persisted", "Re-running on the same
calendar day overwrites…", "Market is closed on a non-trading day", both holiday tests),
`e2e/ivr-watchlist-collection.spec.ts:209`, and three unit tests in
`src/main/services/ivr-collector.test.ts` (`persists a successful Barchart snapshot…`,
`re-running on the same UTC calendar day…`, `uses the UTC calendar day instead of slicing…`).

## Unknowns and how they were resolved

No external technology is introduced; every unknown was resolvable by reading the code, so no
research agents were dispatched.

1. **How does the manual trigger learn it is manual?** → the scheduler passes a run context.
   See ADR "Trigger split via scheduler run context".
2. **Direct call vs scheduler for `ivr:collect-now`?** → keep the scheduler. `runNow` joins an
   in-flight run and the after-close tick skips while a run is in flight; calling the collector
   directly from IPC would let a manual refresh overlap the nightly batch and double-hit Barchart.
3. **Which "trading day" does a reading belong to?** → `getMostRecentCompletedSession` already
   answers it. See ADR "Stamp the observation at its session close".
4. **How does the bench show the reading without a refetch interval?** → push event. See ADR
   "Push `ivr:snapshot-updated`".
5. **How does e2e fire a _scheduled_ run now that `runNow` means explicit?** → `runNow` gains an
   optional `{ trigger }` and a dev-only channel forwards it. See ADR "Dev-only seams".
6. **How does e2e prove "no IVR request is made for KO"?** → the fake scraper records a fetch log.

## Architecture Decisions

### ADR: Trigger split via scheduler run context, not a `force` flag

- **Decision:** `PollingScheduler` passes a `JobRunContext = { trigger: 'scheduled' | 'explicit' }`
  to every handler: `tick` passes `'scheduled'`, `runNow` passes `'explicit'` by default.
  `JobHandler` becomes `(ctx: JobRunContext) => Promise<unknown>` (existing zero-arg handlers
  stay assignable). The `ivr-collect` handler in `src/main/index.ts` forwards `ctx.trigger` into
  `collectIVRSnapshots({ trigger })`, whose input gains `trigger?: 'scheduled' | 'explicit'`
  **defaulting to `'scheduled'`** so the guard stays on for every call site that does not opt in.
  In the collector, `session.status === 'closed'` short-circuits only when `trigger === 'scheduled'`;
  an explicit run logs the closed verdict at info and collects anyway.
- **Why:** "was this run asked for by a person" is a generic fact about a job run, so the scheduler
  is the right owner; the IPC keeps the scheduler's join-in-flight guard and cadence reset for free;
  the story explicitly resists a boolean `force`. Defaulting to `'scheduled'` keeps every existing
  unit test honest without edits.
- **Alternatives considered:** (a) IPC calls `collectIVRSnapshots` directly — loses the
  concurrency guard (see unknown 2). (b) Untyped `runNow(jobName, input?: unknown)` — works but
  makes the handler contract stringly-typed. (c) Two registered jobs sharing one collector — two
  cadence states for one batch.

### ADR: Explicit runs bypass the calendar; scheduled runs keep the guard

- **Decision:** The guard is split, not deleted. Scheduled: `closed` → skip with the existing
  `market_closed` summary (unchanged behaviour, now covering weekends **and** holidays through the
  cached calendar). Explicit (manual refresh, on-add, on-position-create): never refused by the
  calendar. Both still refresh and read the calendar, because stamping (next ADR) needs it.
- **Why:** The guard exists to avoid pointless _scheduled_ fetches, not to refuse a trader who is
  asking. Barchart has no credentials or market-hours dependency. This closes the trading-day
  follow-up's remaining half (the holiday half shipped in US-98).
- **Alternatives considered:** Deleting the guard entirely — a Saturday after-close tick cannot
  fire anyway, but the scheduled path would lose its documented `market_closed` summary and the
  US-44 AC that protects it.

### ADR: Stamp the observation at its session close (design option 1)

- **Decision:** Before persisting an `ok` result, resolve
  `session = getMostRecentCompletedSession(calendar, parseISO(result.data.observedAt))` and
  persist `observed_at = session.closeAt`. When the calendar cannot speak for that instant
  (`null` — never fetched, coverage gap), fall back to the raw fetch instant and log a warn
  (`ivr_observation_unstamped`) so the degradation is visible; this is exactly today's behaviour,
  which is what the US-116 e2e "fresh install" scenarios rely on. The dedupe window in
  `persistSnapshot` changes from "same UTC day" to "same session": delete rows with
  `observed_at >= session.closeAt` and, when the calendar knows the following session,
  `observed_at < nextSession.closeAt`. Without a session the UTC-day bounds remain the fallback.
  The stamp is derived from the **result's** `observedAt`, not the run clock, so e2e fixtures that
  program past observations still land in the session they name.
- **Why:** Preserves the invariant every reader already assumes — a row means "a trading day's
  close" — and makes weekend and intraday collection idempotent: Saturday and Sunday fetches both
  refresh Friday's row. `IvrCell`'s tooltip ("Observed <ET day>") becomes truthful for a weekend
  fetch. The session-window delete (rather than UTC-day) also sweeps up legacy fetch-instant rows
  from a late-evening manual refresh the first time that session is re-collected.
- **Alternatives considered:** (a) Allow weekend rows and teach readers to tolerate them — the
  freshness engine already attributes a Sunday-stamped row to Friday, but the series would carry
  duplicated non-observations and the tooltip would say "Observed Sunday". (b) A separate
  `trading_day` column — a migration to carry a value derivable from `observed_at` + calendar.
  (c) Stamp from the run clock — breaks the staleness fixtures, which move the observation, not
  the clock.
- **Risk noted, not re-litigated:** the story asserts Barchart's `impliedVolatilityRank1y` is
  last-close derived. If it moves intraday, a 10:00 ET Tuesday explicit fetch stamped to Monday's
  close carries a slightly newer number under Monday's date. The after-close scheduled run
  writes Tuesday's own row regardless, so the series stays one-row-per-session.

### ADR: One per-ticker body shared by the batch and the on-demand path

- **Decision:** Extract `collectTicker({ db, logger, fetchIvr, calendar, ticker })` from the batch
  loop in `ivr-collector.ts`, returning `'persisted' | 'not_available' | 'failed'`. It owns the
  fetch try/catch, the status switch, stamping and `persistSnapshot`; `persistSnapshot` stays
  outside the try so a DB fault still propagates. `collectIVRSnapshots` tallies outcomes into the
  unchanged `CollectIVRSnapshotsResult`. A new module `src/main/services/ivr-on-demand.ts`
  exports `createIvrOnDemand(deps): IvrOnDemand` where `IvrOnDemand = { collect(ticker): Promise<void> }`.
- **Why:** The story forbids reusing the full batch for a single add (it would refetch the entire
  watchlist ∪ positions). One body, two callers, no drift in failure classification or stamping.
- **Alternatives considered:** Parameterising `collectIVRSnapshots` with a `tickers` override —
  the batch's guard, abort signal and summary shape are all wrong for a single add.

### ADR: On-demand collection is fired from the service after the row commits, and never rejects

- **Decision:** `addWatchlistEntry(db, payload, ivrOnDemand?)` and
  `createPosition(db, payload, ivrOnDemand?)` gain an optional third argument and call
  `void ivrOnDemand?.collect(ticker)` **after** their write has committed and the success log has
  fired. `IvrOnDemand.collect` awaits `ensureTradingCalendar`, reads the calendar, dedupes against
  the resolved trading day (see next ADR), runs `collectTicker`, and on `'persisted'` invokes an
  `onCollected(ticker)` callback. Its body is wrapped so it **never rejects**: a fetch failure is
  already a warn inside `collectTicker`; a `persistSnapshot` throw is caught and logged at error.
  The IPC handlers stay thin — they pass the port through to the same single service call.
- **Why:** `watchlist:add` and `positions:create` are user-facing; a ~1 s Barchart round trip
  inside them makes the add feel broken, and CLAUDE.md's boundary-I/O rule says a failing fetch
  must never fail the add. Putting the call in the service (not the handler) keeps the handler
  rule intact and lets the unit tests exercise it with a fake port. The optional argument keeps
  every existing caller and test valid.
- **Alternatives considered:** (a) Orchestrating in the IPC handler — violates the thin-handler
  rule. (b) `await`ing collection inside the add — the add blocks on the network. (c) An event
  emitter the services publish to — indirection with one subscriber.

### ADR: Same-trading-day dedupe reads `ivr_snapshot`, attributed by session

- **Decision:** `collect(ticker)` resolves `today = getMostRecentCompletedSession(calendar, now)`
  and `latest = getLatestIvrByUnderlying(db, [ticker]).get(ticker)`. It skips the fetch when
  `getMostRecentCompletedSession(calendar, parseISO(latest.observedAt))?.date === today.date`.
  When the calendar is unavailable (`today === null`) it falls back to
  `etDateOf(latest.observedAt) === etDateOf(now)`. Skips are logged at debug
  (`ivr_on_demand_already_collected`).
- **Why:** The story requires a real read, not an in-memory cache a restart would lose.
  Attributing both sides by session (the same rule the freshness engine uses) means a legacy
  Sunday-stamped row still counts as Friday's reading, and a reading collected Monday morning
  (belonging to Friday) is correctly refetched after Monday's close.
- **Alternatives considered:** Comparing UTC dates — wrong for the weekend and the after-8pm-ET
  cases this story is about. The manual batch does **not** dedupe: a refresh is a deliberate
  refresh, and stamping makes it idempotent.

### ADR: Push `ivr:snapshot-updated` so the bench refreshes when a reading lands

- **Decision:** `onCollected(ticker)` in `src/main/index.ts` sends
  `webContents.send('ivr:snapshot-updated', { ticker })` on the main window. Preload exposes
  `window.api.ivr.onSnapshotUpdated(cb)` via the existing `onIpcEvent` helper. A renderer hook
  `useIvrSnapshotUpdates()` (mounted in `WatchlistPage`) invalidates `watchlistQueryKeys.snapshot`
  and `screenerQueryKeys.results` on each event. No payload beyond the ticker; the bench re-reads
  through its existing snapshot query.
- **Why:** `useWatchlistSnapshot` deliberately has no `refetchInterval`, and `useAddToWatchlist`'s
  invalidation fires before the detached collection can have landed, so without a push the trader
  sees `n/a` until they refocus the window — the symptom the story exists to fix. The story allows
  either "let the IVR query pick it up" or "push the snapshot separately"; only the push is
  observable on screen, which is what a falsifiable e2e needs.
- **Alternatives considered:** (a) Polling the snapshot for a while after an add — a timer
  guessing at Barchart's latency. (b) Returning the reading in the add response — the add would
  wait on the network.

### ADR: Dev-only seams — fetch log and scheduled-trigger run

- **Decision:** `fake-ivr.ts` records every `fetchIvr` call in a `fetchLog: string[]`; a new
  `_test:ivr-fetch-log` channel returns it and `_test:ivr-set-outcomes` resets it (programming new
  outcomes begins a new scenario). `runNow(jobName, opts?: { trigger?: JobTrigger })` accepts an
  override, and a new `_test:scheduler-run-scheduled` channel calls
  `runNow(jobName, { trigger: 'scheduled' })` and **returns** the handler result (unlike
  `_test:scheduler-run-now`, which discards it). Both registered only under `NODE_ENV === 'test'`.
- **Why:** Five ACs are negative ("no IVR request is made for …") and two are about the scheduled
  path; neither is observable through persisted rows alone once explicit runs collect on weekends.
- **Alternatives considered:** Inferring "no fetch" from "no new row" — a not_available outcome
  also writes no row, so the assertion would pass by accident.

## Open Questions

None. The one design question the story flagged (weekend observation date) is settled above per
the story's own recommendation (option 1). US-116, named as a prerequisite for user-visibility,
has shipped (`docs/spec/features/us-116-market-facts-from-market-data-provider.md`).
