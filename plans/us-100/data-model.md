# Data Model: US-100 — Collect IVR on watchlist add and outside market hours

No migration. `ivr_snapshot` (migration `007`), `watchlist` (`012`) and `trading_session` (`015`)
are unchanged in shape. This story changes **what value `ivr_snapshot.observed_at` carries**
and **when rows are written**.

## `ivr_snapshot` — semantic change to `observed_at`

| Column        | Type | Before US-100                | After US-100                                                                                                                                                                        |
| ------------- | ---- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `underlying`  | TEXT | upper-cased ticker           | unchanged                                                                                                                                                                           |
| `observed_at` | TEXT | ISO instant of the **fetch** | ISO instant of the **close of the session the reading belongs to** (`TradingSession.closeAt`); falls back to the fetch instant only when the calendar cannot speak for that instant |
| `ivr`         | TEXT | 1 dp decimal string          | unchanged                                                                                                                                                                           |
| `ivp`, `iv30` | TEXT | nullable                     | unchanged                                                                                                                                                                           |
| `source`      | TEXT | `'barchart'`                 | unchanged                                                                                                                                                                           |

**Invariant introduced:** for a given `underlying`, at most one row per exchange session. Enforced
by `persistSnapshot`'s delete window (below), not by a constraint — the PK stays
`(underlying, observed_at)` so the same-session overwrite is still delete-then-insert.

### Observation stamp resolution (pure, in the collector)

```
input:  calendar: TradingCalendar (readTradingCalendar(db, now)), fetchedAt = result.data.observedAt
session = getMostRecentCompletedSession(calendar, parseISO(fetchedAt))
stamp   = session?.closeAt ?? fetchedAt
```

| Fetch instant (ET)                    | Calendar      | `session`   | `observed_at` written |
| ------------------------------------- | ------------- | ----------- | --------------------- |
| Wed 17:00, Wed is a session           | covers Wed    | Wed         | Wed 16:00 ET closeAt  |
| Sun 15:00, Fri last session           | covers Sun    | Fri         | Fri 16:00 ET closeAt  |
| Thanksgiving Thu 18:00 (closure)      | covers Thu    | Wed         | Wed 16:00 ET closeAt  |
| Tue 10:00 (session open, not closed)  | covers Tue    | Mon         | Mon 16:00 ET closeAt  |
| Black Friday 15:00, early close 13:00 | covers Fri    | Fri (13:00) | Fri 13:00 ET closeAt  |
| any                                   | never fetched | `null`      | fetch instant (warn)  |

### Dedupe window in `persistSnapshot`

```
if session !== null:
  next  = first calendar.sessions entry with date > session.date   (may be undefined)
  DELETE WHERE underlying = ? AND observed_at >= session.closeAt
                            AND (next === undefined OR observed_at < next.closeAt)
else:
  DELETE WHERE underlying = ? AND observed_at >= utcDayStart(fetchedAt) AND observed_at < utcDayStart + 1 day   (today's rule)
INSERT (underlying, stamp, ivr, ivp, iv30, source)
```

The `next` lookup is a small pure helper on the calendar (`observationWindowOf(calendar, session)`
→ `{ from: session.closeAt, to: nextSession?.closeAt ?? null }`), placed in
`src/main/core/trading-calendar.ts` beside `getMostRecentCompletedSession`.

## Collector input / result

`CollectIVRSnapshotsInput` gains:

| Field     | Type                        | Default       | Meaning                                                                                                                                    |
| --------- | --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `trigger` | `'scheduled' \| 'explicit'` | `'scheduled'` | `scheduled`: a `closed` calendar verdict skips the batch with `skippedReason: 'market_closed'`. `explicit`: never skipped by the calendar. |

`CollectIVRSnapshotsResult` is unchanged (`successCount`, `errorCount`, `skippedCount`,
`skippedReason: 'market_closed' | null`). An explicit run can never return `market_closed`.

### Per-ticker outcome (new, internal)

```ts
type TickerOutcome = 'persisted' | 'not_available' | 'failed'
```

| `IVRResult.status` / event      | Outcome         | Log                                                   | Batch tally    |
| ------------------------------- | --------------- | ----------------------------------------------------- | -------------- |
| `ok`                            | `persisted`     | debug `ivr_snapshot_persisted` (ticker, stamp)        | `successCount` |
| `not_available`                 | `not_available` | info `ticker not covered by Barchart IVR`             | `skippedCount` |
| `parse_error` … `invalid_input` | `failed`        | warn `IVR collection failed for ticker`               | `errorCount`   |
| `fetchIvr` throws               | `failed`        | warn `IVR collection threw for ticker` (`err` key)    | `errorCount`   |
| `persistSnapshot` throws        | _propagates_    | — (systemic; batch aborts, on-demand catches → error) | —              |

## Scheduler run context (new)

```ts
export type JobTrigger = 'scheduled' | 'explicit'
export type JobRunContext = { trigger: JobTrigger }
export type JobHandler = (ctx: JobRunContext) => Promise<unknown>
runNow(jobName: string, opts?: { trigger?: JobTrigger }): Promise<unknown>   // default 'explicit'
```

| Entry point                                                                                    | `trigger`                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| timer tick (`tick` → `runTracked`)                                                             | `scheduled`                                                                                                                                                |
| `runNow(name)` — `ivr:collect-now`, `assignments:run-detection-now`, `onBrokerProviderChanged` | `explicit`                                                                                                                                                 |
| `runNow(name, { trigger: 'scheduled' })` — `_test:scheduler-run-scheduled` only                | `scheduled`                                                                                                                                                |
| `runNow` joining an in-flight run                                                              | whatever the in-flight run was (documented; a scheduled run can only be in flight on a session day, so a joined manual refresh never sees `market_closed`) |

## On-demand port (new)

```ts
export type IvrOnDemand = {
  /** Collects one ticker if it has no reading for the current trading day. Never rejects. */
  collect(ticker: string): Promise<void>
}

type CreateIvrOnDemandDeps = {
  db: Database.Database
  getProvider: () => MarketCalendarSource // may throw when unconfigured — ensureTradingCalendar guards it
  fetchIvr?: (ticker: string) => Promise<IVRResult> // default fetchIVR; e2e injects the fake
  clock?: { now(): Date } // default wall clock; e2e injects the fake
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>
  onCollected?: (ticker: string) => void // index.ts: webContents.send('ivr:snapshot-updated', { ticker })
}
```

### `collect(ticker)` state machine

```
normalize ticker (trim, upper)
now = clock.now()
await ensureTradingCalendar(db, getProvider, now)             // never rejects
calendar = readTradingCalendar(db, now)
today    = getMostRecentCompletedSession(calendar, now)         // may be null
latest   = getLatestIvrByUnderlying(db, [ticker]).get(ticker)
if latest belongs to today  → debug ivr_on_demand_already_collected; return
outcome  = await collectTicker({ db, logger, fetchIvr, calendar, ticker })
if outcome === 'persisted'  → info ivr_on_demand_collected; onCollected?.(ticker)
(any throw → error ivr_on_demand_failed; return)
```

"belongs to today":

- `today !== null`: `getMostRecentCompletedSession(calendar, parseISO(latest.observedAt))?.date === today.date`
- `today === null`: `etDateOf(parseISO(latest.observedAt)) === etDateOf(now)`

## Service signatures (extended, backwards compatible)

```ts
addWatchlistEntry(db, payload, ivrOnDemand?: IvrOnDemand): WatchlistEntryRecord
createPosition(db, payload, ivrOnDemand?: IvrOnDemand): CreatePositionResult
registerWatchlistIpc({ db, getProvider, getCurrentDate?, ivrOnDemand? })
registerPositionsHandlers(db, deps?: { ivrOnDemand?: IvrOnDemand })
```

Both services call `void ivrOnDemand?.collect(ticker)` **after** the write has committed and after
their existing `*_added` / `position_created` info log. The duplicate-ticker `ValidationError` in
`addWatchlistEntry` is thrown before the insert, so a rejected add never triggers collection.

## Push event (new)

```ts
// channel 'ivr:snapshot-updated', main → renderer
type IvrSnapshotUpdatedEvent = { ticker: string }
```

Renderer: `useIvrSnapshotUpdates()` subscribes via `window.api.ivr.onSnapshotUpdated` and
invalidates `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results`.

## Test seams (dev-only, `NODE_ENV === 'test'`)

| Channel                         | Payload   | Returns                        | Notes                                                                |
| ------------------------------- | --------- | ------------------------------ | -------------------------------------------------------------------- |
| `_test:ivr-fetch-log`           | —         | `string[]` tickers, call order | Reset by `_test:ivr-set-outcomes`                                    |
| `_test:scheduler-run-scheduled` | `jobName` | handler result (`unknown`)     | `runNow(jobName, { trigger: 'scheduled' })`; e2e wraps as `IvrBatch` |

Fake collaborator state added to `fake-ivr.ts`: `fetchLog: string[]`; `fakeFetchIvr` pushes the
upper-cased ticker before resolving; `setFakeIvrOutcomes` clears it.

## Validation rules from the acceptance criteria

| AC                                                     | Rule                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Adding a ticker collects only that ticker              | `collect(ticker)` never queries `COLLECTION_TARGETS_QUERY`; exactly one `fetchIvr` call               |
| Already has a reading for the day → no refetch         | Dedupe by session attribution (above); existing row untouched                                         |
| Add succeeds when the fetch fails                      | `collect` is detached (`void`) and never rejects; fetch failure → warn; add response already returned |
| Barchart does not cover it → `n/a`                     | `not_available` writes no row; bench `IvrCell` renders `data-ivr-state="empty"`                       |
| Manual refresh on weekend / holiday                    | `trigger: 'explicit'` ignores `closed`; summary `skippedReason === null`                              |
| Weekend reading stored against Friday, exactly one row | Stamp = Friday `closeAt`; delete window `[Fri close, Mon close)`                                      |
| Scheduled run still skips a weekend                    | `trigger: 'scheduled'` + `closed` → `market_closed`, zero fetches                                     |
| Scheduled run still fires after hours on a weekday     | `trigger: 'scheduled'` + `open` (session already closed at 17:00 ET) → collects                       |
