# ADR: The IVR collector is idempotent over missing sessions; the closed-day guard is removed

<!-- generated:from us-121 -->

## Decision

`collectIVRSnapshots` no longer takes a `trigger` and no longer asks the calendar for permission.
For each target ticker, `collectIvHistory`:

1. recomputes rows behind the current engine version from stored inputs;
2. computes the **required** sessions — the 253 most recent sessions (252-session window + anchor)
   whose bars have settled (today counts only 45 minutes after its close, `BAR_SETTLE_MINUTES`);
3. subtracts sessions that already hold a reading or a gap;
4. returns `up_to_date` with **zero** provider calls if nothing is missing; otherwise fetches only
   from the oldest missing session.

Backfill, nightly catch-up, a rerun on the same evening and a weekend run are therefore one code
path. On a weekend or holiday the missing set is empty, every ticker is `up_to_date`, and no bar
request is made. `skippedReason` loses `'market_closed'`. A same-session rerun no longer
overwrites anything — it is `up_to_date` and leaves the row unchanged.

`JobRunContext.trigger` stays on the US-46 scheduler (still exercised by
`_test:scheduler-run-scheduled`) but has no consumer after this story.

**Supersedes** [ivr-non-trading-day-guard-in-collector](./ivr-non-trading-day-guard-in-collector.md)
(and its US-98/US-100 amendments) and
[ivr-same-day-overwrite-delete-then-insert](./ivr-same-day-overwrite-delete-then-insert.md).

## Why

- The guard existed to stop a Saturday run re-scraping Friday's Barchart number. With bars, the run
  knows what it already holds, so a closed-day run is a no-op by construction; a second mechanism
  for the same thing is duplicated intent.
- Removing it also removes the one race-only value on `ivr:collect-now` (an explicit click joining
  a scheduled run and inheriting its trigger). Both paths now behave identically.
- The overwrite rule existed because a Barchart scrape was a point-in-time number. A stored IV30
  reading is a function of settled daily bars that Alpaca does not revise, so there is nothing to
  overwrite — and the 45-minute settle margin makes sure a reading is never built from a
  still-forming bar.

## Alternatives considered

- **Keep the guard for the scheduled path only** — two behaviours for one job, protecting a request
  that no longer happens.
- **Skip the weekly calendar refresh on closures too** — one small throttled request; not worth a branch.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADRs "The closed-day guard is removed…", "Today counts as complete only 45 minutes after its close"
- `plans/us-121/contracts/ivr-collect-now.md`
- `src/main/services/ivr-collector.ts`, `src/main/services/iv-history.ts`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
