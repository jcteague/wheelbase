---
page: docs/spec/architecture/02-adrs/usable-ivr-only-reaches-the-engine.md
audited_at: 2026-09-28
findings: 1
---

# Audit: usable-ivr-only-reaches-the-engine.md

## Verified (8)

- ✓ `screenWatchlistCandidates` builds `ivRanks` from `usableIvRanks(...)` — `src/main/services/screener.ts:235,279`.
- ✓ `usableIvRanks` drops null readings, `value === null`, and non-usable states — `screener.ts:114-120`.
- ✓ Readings come from `readIvRankLookup` in `iv-rank-lookup.ts` — `screener.ts:27,103`.
- ✓ After `rankCandidates`, the full assessed reading (and `ivRankAbsence`) is overlaid onto each row — `screener.ts:288-291` (`lookupOf(ivRankLookups, candidate.ticker)`); `IvRankPair` at `src/main/services/iv-rank-lookup.ts:19-21`.
- ✓ `RankedCandidate = Omit<ScoredCandidate, 'ivRank'> & IvRankPair` — `screener.ts:38` (consistent with the amendment's `ivRankAbsence`).
- ✓ `ivGate` reads a null value as `unknown('IV unavailable')` — `src/main/core/watchlist-signal.ts:81-85`.
- ✓ `iv_rank_floor` never sees a null — `src/main/core/screener.ts:285`.
- ✓ Links: `../../features/us-121-iv-rank-from-own-iv-history.md`, `./iv-rank-absence-reason-in-memory-run-state.md`, `../../.extracts/us-98.md`, features us-98 and us-67 exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "Both the snapshot read and the earnings read degrade internally … no second try/catch in the assessment path" and AC10–AC12 invariants — behavioural; not mechanically verified.

## Missing files (0)

None.
