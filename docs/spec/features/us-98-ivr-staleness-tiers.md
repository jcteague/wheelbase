# US-98: Age an IV-rank reading so a stale one can't pass as current

<!-- generated:from us-98 -->

> **Status: shipped.** The freshness engine, the exchange-calendar cache, the earnings
> split and the screener surface are implemented, refactored, and covered end to end by
> `e2e/ivr-staleness.spec.ts`.
>
> **All 13 acceptance criteria are covered**, one verbatim-named test each.
> AC5 and AC13 had no surface to assert on until [US-96](./us-96-one-live-bench.md) folded
> the screener into the Watchlist page; both landed with it and are now tested here. US-96
> also carried `expired` to the renderer as a visible reading, which changes what AC6 can
> claim — see the note on that row below.
>
> The tier boundaries are still the _proposed_ values: trader validation is an open
> prerequisite.

## Summary

An IV-rank reading is aged against **completed New York trading sessions** and against
**any earnings print known to have landed since it was taken**. The resulting verdict —
`fresh`, `aging`, `stale`, `predates_earnings`, or nothing at all — is computed once at
the service boundary and shared by every surface that shows IVR.

Readings stay visible whatever their age, but only `fresh` and `aging` ones are _usable_
for decisions. An unusable reading cannot satisfy an IV condition, and the screener's
`iv_rank_floor` is never applied to it — so a stale number can neither promote a
candidate nor exclude one. A reading older than ten sessions is indistinguishable from
no reading at all.

Freshness is measured in sessions rather than days because that is the unit the
question is actually asked in: Friday's close is still current on Monday morning, a
holiday does not age anything, and an early close is a whole session.

## Acceptance criteria

| AC   | Scenario                                                       |
| ---- | -------------------------------------------------------------- |
| AC1  | A reading from the last close shows without an age qualifier   |
| AC2  | Friday's close is still fresh on Monday morning                |
| AC3  | An exchange holiday does not age a reading                     |
| AC4  | An aging reading shows its age but stays usable                |
| AC5  | A stale reading is muted and cannot satisfy an IV condition    |
| AC6  | An expired reading is indistinguishable from no reading        |
| AC7  | An earnings print invalidates a reading regardless of age      |
| AC8  | A print before the observation does not invalidate the reading |
| AC9  | Missing earnings knowledge falls back to the time tiers alone  |
| AC10 | A stale IV rank never blocks a candidate from ranking          |
| AC11 | The IV-rank floor is not applied to a stale reading            |
| AC12 | The IV-rank floor is not applied to an expired reading         |
| AC13 | Signal refuses to claim entry readiness on an unusable reading |

Each AC is one verbatim-named test in `e2e/ivr-staleness.spec.ts`; all 13 pass.

**AC5 and AC13 were added once [US-96](./us-96-one-live-bench.md) shipped the bench.**
Both assert on a verdict the app could not render before then. US-98 wrote them against a
"Signal" reporting "Entry ready"; that concept shipped as the per-gate verdict and the
"Meets criteria" section, so the tests read the vocabulary that exists while asserting
exactly what the scenarios describe — a stale reading muted beside a half-full ring whose
tooltip says it cannot satisfy an IV condition, and a stock whose only obstacle is that
reading held out of Meets criteria.

**AC6 was superseded.** "An expired reading is indistinguishable from no reading" was
true only while an expired reading collapsed to `null`. US-96 carries it to the renderer
with its value and age, so it now shows `exp` where a never-collected ticker shows `n/a`.
The decision rule the AC protected is unchanged — an expired reading is still unusable and
still never applies the IV-rank floor — so the test was renamed "An expired reading shows
exp and behaves as no reading" and asserts both halves.

`e2e/ivr-collector.spec.ts` additionally carries the recognised-holiday no-fetch
regression, including the brokerless case.

## What was built

### The exchange calendar is a cache, not a constant

`trading_session` (migration `015`) holds one row per calendar day in the range that has
been fetched — **closures included**, as a NULL `close_at`. Storing closures explicitly
is what lets coverage be derived as `MIN(date)..MAX(date)`, so a day nobody fetched
reads as _unknown_ rather than silently as a closure.

`src/main/services/trading-calendar-store.ts` is the only writer.
`refreshTradingCalendar` pulls the venue's own calendar through
`BrokerProvider.getMarketCalendar` and rewrites the range; `readTradingCalendar` is pure
DB and never fetches, because a screen must not hang on the broker. Reads load 45 days
back through 2 ahead — comfortably past the ten-session stale boundary, and bounded so
an ancient snapshot cannot walk months of rows. Refreshes run at most weekly and cover
120 days back through 400 ahead, so a laptop offline for weeks still has coverage. The
store warns 30 days before coverage runs out, and warns loudly when the calendar has
never been fetched at all.

### The engine is pure over a calendar value

`src/main/core/trading-calendar.ts` holds no data. It takes a `TradingCalendar`
(`firstDay`, `lastDay`, ascending `sessions`) and answers:

- `getTradingSession(calendar, day)` → `open` / `closed` / `unavailable`
- `getMostRecentCompletedSession(calendar, instant)` — the newest session already closed
- `countCompletedSessionsAfter(calendar, session, now)` — the age unit, or `null`
- `etDateOf(instant)` and `etInstantAt(day, time)` — Eastern-day and Eastern-wall-clock
  conversion via native `Intl.DateTimeFormat`, no timezone dependency

Every one of them returns unknown rather than guessing when the calendar cannot speak
for the moment in question.

### The freshness verdict

`src/main/core/ivr-freshness.ts` turns a raw `IvRank` plus `{ now, lastEarnings,
calendar }` into an `IvRankAssessment`: `assessed` with a reading, `expired`, or
`unreadable`. Precedence is input validity → completed-session age → known-earnings
override → time tier.

| Age (completed sessions) | State                  | Usable |
| ------------------------ | ---------------------- | ------ |
| 0–1                      | `fresh`                | yes    |
| 2–3                      | `aging`                | yes    |
| 4–10                     | `stale`                | no     |
| over 10                  | _expired_ — no reading | no     |

Constants live in that module (`FRESH_MAX_AGE`, `AGING_MAX_AGE`, `STALE_MAX_AGE`).
Usability is derived from the state by `isUsableState`, never carried alongside it.
A zero IVR is a real value, distinct from no reading. Nothing is persisted — the verdict
is recomputed per request.

### Earnings history, split from the next print

`fetchEarningsCalendar` widens the existing Finnhub request to 30 days back and returns
`next` and `last` independently. `earnings_date` gains a nullable `last_earnings` column
(migration `014`). `getEarningsCalendar` is the shared read-through resolver;
`getEarnings` is a next-only projection of it, so alert and [US-70](./us-70-earnings-in-window-warning.md)
callers are unchanged and no ticker is fetched twice. A successfully fetched date is
returned even when its cache write fails.

A cached `next_earnings` that is now in the past is recovered as last-print knowledge —
without that, a pre-print reading was judged on age alone and a stale high IVR read as
usable the morning after a print.

All of these comparisons are on the **Eastern** calendar day.

### The screener shows every reading and scores only some

`screenWatchlistCandidates` reads the shared earnings knowledge once, assesses each
ticker's snapshot against the cached calendar, and builds the engine's `ivRanks` map
from **usable readings only**. After `rankCandidates`, the full assessed reading is
overlaid on each surviving row as `RankedCandidate.ivRank`. `FILTERS`, the yield/score
formula, rank ordering, promotion data and exclusion reasons are untouched — a stale
value is simply absent from both the positive gate and the negative filter.

Both the snapshot read and the earnings read degrade internally to "unknown for
everyone" rather than sinking the run, per the batch failure-isolation rule.

### One cell renders every reading

`IvrCell` is the single display for IVR on any surface. Fresh is a bare value with no
qualifier; `aging` and `stale` append `· Nd`; `predates_earnings` adds a muted
"predates earnings" caption; absent renders `n/a`. Unusable states are muted
(`text-wb-text-muted`), overriding any richer per-surface tone, so a number the rank was
not built on never looks like one that was. The exact age is in the accessible label
("2 trading days old") and the observation date is in the tooltip only, formatted in ET.
`data-ivr-state` makes the state assertable. The old permanent `44 (Aug 7)` suffix from
`fmtIvr` is retired in favour of `formatIvrValue`.

### Collection is gated on the calendar, not the broker clock

`collectIVRSnapshots` no longer calls `getMarketStatus` and no longer applies a UTC
weekend heuristic. It refreshes the calendar when a broker is configured, then asks
`getTradingSession` about today's ET date: `closed` skips with the existing
`market_closed` summary, `unavailable` logs and continues best-effort, `open` collects.
The broker argument is now optional — a brokerless watchlist trader still collects, and
a broker outage leaves the cached rows untouched rather than aborting the batch. This
supersedes the [non-trading-day guard ADR](../architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md)
from [US-44](./us-44-ivr-snapshot-store-and-scheduler.md).

### Deterministic time for tests

`createFakeIvrCollaborators()` is resolved once in `src/main/index.ts` **before**
screener IPC registration, so the collector and screener share one clock; a test-only
`testIvrSetNow` setter sits behind the existing `NODE_ENV=test` `test-ivr` seam. The
clock is a composition dependency — production never accepts a time through public IPC.
This is what lets a holiday scenario seed on the preceding open day and then advance,
rather than collecting on the holiday itself.

### Watchlist Signal **(planned — blocked on US-96)**

The watchlist snapshot is to carry the same assessed reading, computed at the same
request clock Signal uses. `deriveSignal` treats an unusable or absent reading as
**unknown**, never as a failed numeric comparison, and any required unknown gate
prevents "Entry ready":

| IV gate input                     | Verdict                          |
| --------------------------------- | -------------------------------- |
| no IV condition                   | no IV gate                       |
| usable reading at/above threshold | met                              |
| usable below threshold            | unmet — "IV low"                 |
| `stale`                           | unknown — "IV too old to judge"  |
| `predates_earnings`               | unknown — "IV predates earnings" |
| missing / expired / unassessable  | unknown — "IV unavailable"       |

It reuses US-96's snapshot endpoint and `IvrCell`; no competing endpoint, no per-row IVR
request, no renderer-side ageing.

## Architecture decisions

- [Freshness is measured in completed exchange sessions](../architecture/02-adrs/ivr-freshness-in-completed-sessions.md)
- [The exchange calendar is fetched and cached, not checked in](../architecture/02-adrs/trading-calendar-fetched-and-cached.md)
- [A known earnings print invalidates a reading before the age tiers apply](../architecture/02-adrs/earnings-invalidates-ivr-before-expiry.md)
- [Only usable readings reach the screening engine](../architecture/02-adrs/usable-ivr-only-reaches-the-engine.md)
- [Assessment returns a three-state result, not `null`](../architecture/02-adrs/ivr-assessment-three-state-result.md)
- [Non-trading-day IVR guard lives in the collector](../architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md) — **amended**: the guard now reads the cached calendar rather than the broker's market status
- [Earnings persisted per ticker](../architecture/02-adrs/earnings-persisted-per-ticker.md) — extended with `last_earnings`
- [Unknown earnings never excludes](../architecture/02-adrs/unknown-earnings-never-excludes.md) — the same principle now governs unknown IV freshness

## Contracts touched

- **`BrokerProvider.getMarketCalendar`** (new) — `{ start, end }` → `MarketCalendarDay[]`
  (`{ date, close }`, Eastern wall clock). Closed days are absent from the response.
  See [alpaca-integration](../contracts/alpaca-integration.md).
- **`screener:results`** — no request change; `ranked[].ivRank` widens to
  `{ value, observedAt, ageTradingDays, state }` or `null`. See
  [ipc-handlers](../contracts/ipc-handlers.md).
- **`fetchEarningsCalendar`** replaces `fetchNextEarnings`; `WHEELBASE_MOCK_EARNINGS`
  becomes a record of `EarningsCalendarRead`.
- **`getEarningsCalendar` / `getEarnings`** — one resolver, two projections.
- **`getAssessedIvrByUnderlying`** (new) — persisted snapshots assessed at the boundary,
  no network.
- **`testIvrSetNow`** (test-only) — mutates the shared clock behind the `NODE_ENV=test`
  guard.
- **Watchlist snapshot IVR** — specified in `plans/us-98/contracts/watchlist-ivr.md`,
  not yet wired.

## Schema

- [`trading_session`](../schema/tables.md#trading_session) — migration `015`
- [`earnings_date.last_earnings`](../schema/tables.md#earnings_date) — migration `014`

## Source files

- `src/main/core/trading-calendar.ts`
- `src/main/core/ivr-freshness.ts`
- `src/main/services/trading-calendar-store.ts`
- `src/main/services/ivr-snapshots.ts`
- `src/main/services/ivr-collector.ts`
- `src/main/services/earnings-dates.ts`
- `src/main/services/screener.ts`
- `src/main/services/scheduler-instance.ts`
- `src/main/integrations/broker-provider.ts`
- `src/main/integrations/alpaca-broker.ts`
- `src/main/integrations/fake-broker.ts`
- `src/main/integrations/finnhub-earnings.ts`
- `src/main/integrations/fake-earnings.ts`
- `src/main/integrations/fake-ivr.ts`
- `src/main/ipc/test-ivr.ts`
- `src/main/index.ts`
- `src/main/test-utils.ts`
- `src/preload/index.ts`, `src/preload/index.d.ts`
- `src/renderer/src/api/screener.ts`
- `src/renderer/src/components/IvrCell.tsx`
- `src/renderer/src/components/ScreenerResultsTable.tsx`
- `src/renderer/src/lib/screener-format.ts`
- `e2e/ivr-helpers.ts`, `e2e/screener-helpers.ts`, `e2e/dates.ts`
- `migrations/014_add_last_earnings.sql`, `migrations/015_create_trading_session.sql`
- `mockups/us-66-screener-results.mdx`

- `e2e/ivr-staleness.spec.ts`, `e2e/trading-day-fixtures.ts`

Not yet created: the watchlist snapshot / Signal modules that depend on US-96.

## See also

- [us-97 — Collect IVR for watchlist underlyings](./us-97-collect-ivr-for-watchlist-underlyings.md)
- [us-66 — Screener results](./us-66-screener-results.md)
- [us-67 — Configure screening criteria](./us-67-configure-screening-criteria.md)
- [us-70 — Earnings-in-window warning](./us-70-earnings-in-window-warning.md)
- [us-44 — IVR snapshot store & scheduler](./us-44-ivr-snapshot-store-and-scheduler.md)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
