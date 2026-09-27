# ADR: An absent IV rank carries a display-only reason; run state lives in memory

<!-- generated:from us-121 -->

## Decision

Every bench row (`watchlist:snapshot`) and ranked candidate (`screener:results`) carries exactly
one of `ivRank` or `ivRankAbsence`. The pair is a union (`IvRankLookup` in the main process,
`IpcIvRankPair` across preload and renderer), so "both null" cannot be represented. `IvrCell` and
`ReadingNote` take a single `ivr` pair prop.

| Reason                 | Source                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `pending`              | run state — a run for the ticker is in flight                                                            |
| `no_market_data`       | run state — the last run had no Alpaca market-data credentials                                           |
| `failed`               | run state — the last run for the ticker failed                                                           |
| `insufficient_history` | derived on read — rows exist but < 200 of 252 window sessions (carries `coverage`, `window`, `required`) |
| `not_collected`        | neither rows nor any known run (also a fresh relaunch)                                                   |

Precedence when no reading is published: `pending` > `no_market_data` > `failed` >
`insufficient_history` > `not_collected` (`absenceFor` in `ivr-snapshots.ts`). A published reading
always wins over any run status — a catch-up in flight never hides a rank.

**Run state** is a `createIvRunState()` closure over a `Map` in `services/iv-run-state.ts`, created
once in `index.ts` and shared by the batch collector, the on-demand path and both read paths. The
callers own the transitions: `markPending` before each ticker's turn (the on-demand path does it
synchronously before its first `await`, so the snapshot the renderer refetches after
`watchlist:add` already reads `pending`), `settle` after. `collected` / `up_to_date` clear the
entry. The batch marks every remaining target `no_market_data` when a turn reports it.

**The reason is display-only.** `ivGate`, `usableIvRanks` and the screener floor read only
`ivRank` and treat every absence as `unknown`.

**Refresh push.** Because the bench does not poll, a settle must reach the renderer: the on-demand
path fires `ivr:snapshot-updated` for the ticker after **every** settle (`onSettled`), and the
batch fires it **once per run** with `ticker: null` (`onCompleted`, from a `finally`).

## Why

- `null` hid five situations behind one blank; two of them (a backfill in flight, missing
  credentials) are things the trader can act on or should wait for.
- In-memory state is honest by construction: a relaunch mid-backfill has no run in flight, so
  `not_collected` is the truth until the next run, and there is no stale `pending` row to expire.
- Carrying `window` / `required` on `insufficient_history` spares the renderer a copy of two core
  constants it cannot import across the process boundary.
- Push cadence: pushing only on `collected` left cards stuck on "Computing IV history"; pushing per
  ticker from the batch re-ran the screener (a chain pull per ticker) N times.

## Alternatives considered

- **Persisting run state in a table** — needs expiry rules for a crashed run and adds a write per
  collection for a value nobody queries later.
- **Two nullable sibling fields at the IPC boundary** — the planned shape; it let the IPC types
  represent "both null" and forced defensive branches in `IvrCell` / `ReadingNote`, so the union
  was carried through instead (Gate D fix).
- **Deriving `failed` from the absence of a recent reading** — indistinguishable from `not_collected`.
- **Letting the reason affect the verdict** — the story says display-only.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADRs "An absent rank carries a display-only reason…", "On-demand pushes per ticker on every settle…"
- `plans/us-121/contracts/watchlist-snapshot-ivrank.md`, `plans/us-121/refactor-phase-results.md`
- `src/main/services/iv-run-state.ts`, `src/main/services/ivr-snapshots.ts`, `src/preload/index.d.ts`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
