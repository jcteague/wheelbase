# ADR: IVR collection targets are the union of open positions and the watchlist

<!-- generated:from us-97 -->

## Decision

The collector derives its ticker batch from a single query:

```sql
SELECT ticker FROM positions WHERE status != 'CLOSED'
UNION
SELECT ticker FROM watchlist
```

`COLLECTION_TARGETS_QUERY` in `src/main/services/ivr-collector.ts`, read by
`listCollectionTargets` (renamed from `listActiveUnderlyings`). The existing
`toUpperCase()` → `Set` → `localeCompare` normalisation is unchanged.

This **supersedes** [IVR collection targets come from active positions](./active-ivr-targets-from-positions.md) (US-44).

## Why

IV rank is how a premium seller decides whether selling a put on a name is worth the capital
at all — a judgement made _before_ a position exists, on the bench. Targeting only open
positions meant every watchlist-only candidate joined the ranked list with `ivRank: null`,
leaving a silently empty column on the screen whose entire purpose is that column.

One query, one loop, one set of counters. The collector's rate limiting, failure isolation,
and same-day overwrite semantics are all downstream of the target list, so widening the list
is the entire change — no new pass, no new counters, no migration.

`UNION` (not `UNION ALL`) keeps the row set small before the in-memory `Set`. SQL de-duplicates
case-sensitively and the `toUpperCase()` that follows closes the `spy`/`SPY` gap; together they
are what guarantee a ticker that is both held and watchlisted is fetched exactly once.

## Selection truth table

| on watchlist | open position | closed position only | collected? | via       |
| ------------ | ------------- | -------------------- | ---------- | --------- |
| yes          | no            | —                    | yes        | watchlist |
| yes          | yes           | —                    | yes, once  | both arms |
| yes          | no            | yes                  | yes        | watchlist |
| no           | yes           | —                    | yes        | positions |
| no           | no            | yes                  | no         | —         |
| no           | no            | no                   | no         | —         |

Every watchlist column other than `ticker` is ignored — being on the list is the only criterion.

## Consequences

- **US-67's IV-rank floor now applies to bench names.** `iv_rank_floor` fires only when
  `ctx.ivRank !== null`, so before this change it could never exclude a watchlist-only ticker.
  A thin-IVR bench name now drops out of the ranked list when the floor is enabled — the
  intended behaviour, covered by an acceptance criterion.
- **Runtime grows with the watchlist.** Collection is sequential, paced by the scraper's
  internal 1 req/s rate limiter, so the after-close run grows by roughly one second per
  watchlist name (a 25-name watchlist turns a 5-name run into a ~30 second run). Fine for a job
  firing 60 minutes after close, but it argues against an unbounded watchlist without revisiting
  the pacing. The same growth lands on the awaited "Refresh IVR now" click; on quit, the loop is
  aborted at the next ticker boundary so a long batch cannot stall shutdown.
- **Non-zero skip counts are normal.** `not_available` was already a skip rather than an error;
  that path is exercised far more often now, because speculative bench names are likelier to be
  uncovered than names the trader already holds.
- **No backfill.** The first run after this ships produces the first snapshot for names already
  on the watchlist.

## Alternatives considered

- **A second collection pass over the watchlist** — rejected: doubles the loop, splits the
  counters, and needs its own dedupe against the first pass.
- **Reuse `listWatchlist()` + `listPositions()` and merge in TypeScript** — rejected for the same
  reason US-44 rejected `listPositions()`: those compute renderer-facing fields the collector does
  not need, and a single SQL statement is simpler to test.

## Source

- `plans/us-97/research.md`
- `plans/us-97/data-model.md`
- `src/main/services/ivr-collector.ts`
- Superseded ADR: `./active-ivr-targets-from-positions.md`
- Feature page: `../../features/us-97-collect-ivr-for-watchlist-underlyings.md`
<!-- /generated -->
