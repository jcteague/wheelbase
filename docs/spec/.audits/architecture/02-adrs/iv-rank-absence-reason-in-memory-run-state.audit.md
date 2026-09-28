---
page: docs/spec/architecture/02-adrs/iv-rank-absence-reason-in-memory-run-state.md
audited_at: 2026-09-28
findings: 11
---

# Audit: docs/spec/architecture/02-adrs/iv-rank-absence-reason-in-memory-run-state.md

## Verified (10)

- ✓ `IvRankPair` union in main (`src/main/services/iv-rank-lookup.ts:19`) and renderer (`src/renderer/src/api/ivr.ts:30`); `IpcIvRankPair` in `src/preload/index.d.ts:453`, intersected into bench rows / candidates (`:491,530`).
- ✓ `IvrCell` and `ReadingNote` take a single `ivr: IvRankPair` prop — `src/renderer/src/components/IvrCell.tsx:16`, `ReadingNote.tsx:16`.
- ✓ Reasons `pending | no_market_data | failed | not_collected` and `insufficient_history` with `coverage`, `window`, `required` — `iv-rank-lookup.ts:14-15,48-54`.
- ✓ Precedence run-status > `insufficient_history` > `not_collected` in `absenceFor` — `iv-rank-lookup.ts:39-57`; a published reading wins (`:62-82`). (`pending`/`no_market_data`/`failed` are mutually exclusive map values, so their relative order is moot.)
- ✓ `createIvRunState()` is a closure over a `Map` — `src/main/services/iv-run-state.ts:18-38`; created once in `src/main/index.ts:204` and passed to on-demand, watchlist and screener (`:212-233`) and the batch.
- ✓ `collected` / `up_to_date` clear the entry; `failed` / `no_market_data` set it — `iv-run-state.ts:25-35`.
- ✓ On-demand marks `pending` synchronously before its first `await` and settles after — `src/main/services/ivr-on-demand.ts:82-90`.
- ✓ Batch marks remaining targets `no_market_data` — `src/main/services/ivr-collector.ts:95-98,150-153`.
- ✓ Push: `ivr:snapshot-updated` after every on-demand settle (`ivr-on-demand.ts:89`, wired `index.ts:208-218`) and once per batch run with `ticker: null` from a `finally` (`ivr-collector.ts:70-76`, `index.ts:277`).
- ✓ Reason is display-only: `ivGate` reads only the reading (`src/main/core/watchlist-signal.ts:81-95`); `usableIvRanks` reads only `ivRank` (`src/main/services/screener.ts:114-121`). Cited plan files exist (`plans/us-121/contracts/watchlist-snapshot-ivrank.md`, `plans/us-121/refactor-phase-results.md`).

## Drift (0)

None.

## Unverifiable (1)

- ? "Pushing per ticker from the batch re-ran the screener N times" / Gate D history — narrative.

## Missing files (0)

None.
