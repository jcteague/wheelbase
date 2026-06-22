# ADR: IVR collection targets come from active positions

<!-- generated:from us-44 -->

## Decision

The collector derives its ticker batch from the `positions` table by selecting distinct `ticker` values where `status != 'CLOSED'`, then normalizes to uppercase and de-duplicates before fetches.

## Why

The story defines the batch as "all active-position underlyings," and the SQLite schema already owns that truth. Reading directly from `positions` keeps the collector independent from renderer-facing list queries and avoids pulling in list-only derived fields or UI grouping concerns.

Sorting and de-duplicating the targets also makes the batch order deterministic, which simplifies tests and log review.

## Alternatives considered

- **Reuse `listPositions()` output** — rejected because it computes renderer-facing fields the collector does not need.
- **Infer activeness from phase only** — rejected because `status` is the clearer, existing signal for excluding closed wheels.

## Source

- `plans/us-44/research.md`
- `plans/us-44/data-model.md`
- `src/main/services/ivr-collector.ts`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
