# ADR: IVR collection targets come from active positions

> **Status: Superseded by [US-97](../../features/us-97-collect-ivr-for-watchlist-underlyings.md).**
> The collector now targets the **union** of open positions and the watchlist. The positions
> arm below is still one half of that union, and the normalisation described here is unchanged
> — but "active positions" is no longer the whole batch. See
> [ADR: IVR collection targets are the union of open positions and the watchlist](./union-ivr-targets-positions-and-watchlist.md).

<!-- generated:from us-44, us-97 -->

## Decision

_(As originally decided for US-44 — superseded, see above.)_

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
- Superseding ADR: `./union-ivr-targets-positions-and-watchlist.md` (US-97)
<!-- /generated -->
