# US-97: Collect IVR snapshots for watchlist underlyings

<!-- generated:from us-97 -->

## Summary

US-97 widens the nightly IVR collection targets from open positions only to the **union of
open positions and the watchlist**, so IV rank is populated for the bench names the screener
actually ranks. [US-44](./us-44-ivr-snapshot-store-and-scheduler.md) named this gap
deliberately in its Out of Scope, which was defensible while nothing read IVR outside the
positions list. Epic 08 changed that: [US-65](./us-65-score-wheel-candidates.md) joins the
latest IVR onto every ranked candidate, and US-96 builds whole acceptance criteria on it —
IV-rank cells, `IVR ≥ N` condition tags, and an "IV low" signal chip, none of which can fire
without a snapshot.

The production change is one SQL statement plus per-ticker failure isolation. Everything
downstream of the target list — rate limiting, same-day overwrite, the `ivr:collect-now` IPC,
the scheduler registration — was already target-agnostic and is untouched. No migration, no
new dependency.

## Acceptance criteria

Background: the watchlist holds KO, AAPL, and XYZ; the trader holds an open CSP on MSFT;
MSFT is not on the watchlist.

- **Watchlist underlyings are collected alongside held positions** — IVR is fetched for KO,
  AAPL, XYZ, and MSFT, and the summary reports 4 succeeded, 0 skipped, 0 errors.
- **A watchlisted ticker with only a closed position is still collected** — KO's only position
  is CLOSED, and IVR is still fetched for KO.
- **A ticker that is both held and watchlisted is collected once** — AAPL is fetched exactly
  once and exactly one AAPL snapshot exists for that day.
- **A watchlist ticker with no IVR coverage is skipped, not failed** — Barchart does not cover
  XYZ, so the summary reports 3 succeeded, 1 skipped, 0 errors, and the other three each have a
  fresh IV rank.
- **One ticker failing does not suppress the others** — KO's fetch fails, AAPL/XYZ/MSFT are
  still attempted, the KO failure is logged at warn level, and the summary reports 3 succeeded,
  0 skipped, 1 error.
- **Removing a ticker from the watchlist stops future collection** — KO is removed and has no
  open position, so no new KO snapshot is written and yesterday's remains readable.
- **The manual collect-now trigger covers the watchlist too** — a just-added TSLA is fetched by
  the manual trigger.
- **A screened candidate shows a real IV rank instead of n/a** — KO on the watchlist with no
  open position and a recorded IVR of 38.0 shows an IV rank of 38.0 on its candidate row.
- **A populated IV rank lets the screener's IV floor apply to a bench name** — KO at IVR 22.0
  against an IV-rank floor of 30 appears in the excluded list with reason
  `IV rank 22.0 below 30`.

## What was built

`listActiveUnderlyings` in `src/main/services/ivr-collector.ts` became `listCollectionTargets`,
reading `COLLECTION_TARGETS_QUERY`:

```sql
SELECT ticker FROM positions WHERE status != 'CLOSED'
UNION
SELECT ticker FROM watchlist
```

The `toUpperCase()` → `Set` → `localeCompare` pipeline that follows is unchanged, and is what
makes a ticker that is both held and watchlisted resolve to a single fetch: SQL `UNION`
de-duplicates case-sensitively, and the uppercase pass closes the `spy`/`SPY` gap. Every
watchlist column other than `ticker` is ignored — being on the list is the only criterion. See
[ADR: IVR collection targets are the union of open positions and the watchlist](../architecture/02-adrs/union-ivr-targets-positions-and-watchlist.md),
which supersedes the US-44 ADR.

The collection loop also gained per-ticker `try/catch` around the **fetch**. The scraper does
not return every failure as a status — `fetchIVR` parses the response body outside a `try`, so a
non-JSON body rejects rather than returning a `network_error`. Because
`PollingScheduler.runHandler` catches a rejected handler and returns `undefined`, an unguarded
throw aborted the batch and lost every ticker after the offending one. A `persistSnapshot` throw
is deliberately not isolated — a failing DB write is systemic and aborts the run — and the
market-status read at the top degrades (assume trading day) when the broker is unreachable or
not configured at all. See
[ADR: Per-ticker failure isolation in the IVR collection loop](../architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md).

On the renderer side, Settings' "Refresh IVR now" button is now disabled while the mutation is
pending and reads `Refreshing IVR…`. The run is now watchlist-length, so this is where a human
waits. Beneath it, `scheduler.runNow` joins an in-flight run (and a firing tick skips one), so a
concurrent batch cannot start even from a fresh mount or the scheduled after-close tick.

## Consequences

**The IV-rank floor now bites bench names, deliberately.** US-67's `iv_rank_floor` applies only
when a reading exists. Before this story a watchlist-only ticker always read `null`, so the floor
could never exclude it; now a thin-IVR bench name drops out of the ranked list when the floor is
enabled — exactly what the floor was asked to do. See
[US-67](./us-67-configure-screening-criteria.md).

**Runtime grows with the watchlist.** Collection is sequential, paced by the scraper's internal
1 req/s rate limiter, so the after-close run grows by roughly one second per watchlist name. A
25-name watchlist turns a 5-name run into a ~30 second run — acceptable for a job firing 60
minutes after close, but it argues against an unbounded watchlist without revisiting the pacing.
On quit, the loop is aborted at the next ticker boundary so a long batch cannot stall shutdown.

**Non-zero skip counts are normal.** Speculative bench names are likelier to be uncovered by
Barchart than names the trader already holds, so the `not_available` path is exercised far more
often. That is not a signal of breakage.

## E2E harness

The screener e2e harness previously worked around this gap by seeding a **throwaway active CSP
per ticker** so the collector would reach it. That workaround is gone: `seedIvr` in
`e2e/screener-helpers.ts` now relies on the watchlist `launchScreener` already seeded. Removing
it introduced a new silent failure — an `ivr` key that is not a fixture ticker is not on the
watchlist and so persists nothing at all — which `assertIvrTickersCollectible` now catches
loudly, in the manner of the file's existing `assertClearOffsetUsable`. `seedWatchlist` moved to
`e2e/ivr-helpers.ts` (screener-helpers already imports from it, not the reverse), joined by
`removeFromWatchlist` and `seedClosedPosition`.

`e2e/ivr-collector.spec.ts` (US-44) seeds no watchlist rows, so its exact `skippedCount` /
`successCount` assertions are unaffected.

## Out of scope

- **Staleness handling.** `getLatestIvrByUnderlying` returns the newest row regardless of age, so
  a ticker that stopped being collected still reports its last known IVR with no age signal. More
  likely with bench names; deciding the tolerance and UI treatment is its own story.
- **Backfilling IVR history** for tickers already on the watchlist — the first run after this
  ships produces the first snapshot.
- Changing the collection cadence, the 1 second rate limit, or the scraper itself
  ([US-43](./us-43-barchart-ivr-scraper.md)).
- IVR for PMCC or call-side screening (Epic 09).
- The IV-rank display, colouring, and Signal logic (US-66, US-96).

## Source

- `plans/us-97/`
- `src/main/services/ivr-collector.ts`
- `src/renderer/src/pages/SettingsPage.tsx`
- `e2e/ivr-watchlist-collection.spec.ts`, `e2e/ivr-helpers.ts`, `e2e/screener-helpers.ts`
<!-- /generated -->
