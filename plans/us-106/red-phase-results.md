# Red Phase Results: US-106 — PMCC short-call assignment-risk alert

## Feature Context

- **Feature directory**: `plans/us-106/`
- **User story**: [OPT-14 / US-106](https://linear.app/optionswheel/issue/OPT-14) (Linear)
- **Plan file**: `plans/us-106/plan.md`

## Test Files Created/Modified

- `src/main/core/alerts.test.ts` — `PMCC_ASSIGNMENT_RISK (US-106)` describe: the five firing prices with exact summaries, the two quiet prices, the 107.7999 rounding guard, price/strike skip reasons, the non-PMCC phase guard, 4-DTE co-fire, unchanged wheel outputs
- `src/main/core/alerts.property.test.ts` (new) — threshold oracle, monotonicity, phase guard
- `src/renderer/src/components/ManagementQueueRow.test.tsx` — PMCC badge, actions, phase-based branch, wheel badge retained
- `src/main/services/evaluate-alerts-pmcc.test.ts` (new) — current-short selection, generic rules on the short, real short roll, closing events, lifecycle, missing quotes, failure isolation, queue enrichment
- `src/main/services/evaluate-alerts.test.ts` — US-101 blanket-exclusion test replaced by the 5-DTE `EXPIRATION_IMMINENT` expectation
- `e2e/pmcc-assignment-risk-alert.spec.ts` (new) — nine Linear scenario families, 15 named cases

## Interfaces Under Test

```typescript
// src/main/core/alerts.ts
type RuleCode = ... | 'PMCC_ASSIGNMENT_RISK'
export const PMCC_ASSIGNMENT_RISK_MAX_PERCENT_BELOW = 2
export type PmccAssignmentRiskInput = PriceVsStrikeInput
evaluatePosition(input) // unchanged signature; new registry entry

// src/main/services/evaluate-alerts.ts — evaluateAlerts(...) unchanged signature
// src/renderer/src/components/ManagementQueueRow.tsx — unchanged props
```

## Property Tests

- `alerts.property.test.ts`: fires iff `price × 100 ≥ strike × 98` (an independent multiplication oracle over near-strike and arbitrary pairs); a firing price keeps firing as it rises; non-PMCC phases never match or skip. Stressed at 500 runs across seeds 1, 42, 1337, 20261017 and 987654 with no counterexample. The temporary wrapper was removed afterwards.

## Test Execution Results

| Area      | Command                                                                            | Red result                                                                                                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A core    | `vitest run src/main/core/alerts*.test.ts`                                         | 13 failed: 5 fire, 4 price skip, 2 strike skip, co-fire, oracle. Monotonicity and phase-guard properties passed vacuously, which the tasks expected.                                                                       |
| B queue   | `vitest run …/ManagementQueueRow.test.tsx`                                         | 2 failed: no `PMCC · short call` badge. Actions and the wheel badge passed.                                                                                                                                                |
| C service | `TZ=America/New_York vitest run src/main/services/evaluate-alerts{,-pmcc}.test.ts` | 20 failed. Every failure was an absent PMCC alert, or `openRule(...)!.id` reading undefined because no alert fired. The inactive-PMCC and post-short-earnings negatives passed.                                            |
| D e2e     | spec run against a pre-feature `HEAD` worktree with `--bail 0`                     | 11 of 15 failed with `expected one open PMCC_ASSIGNMENT_RISK alert, got 0` or `expected [] …`. The 4 that passed are the two S2 negatives and the two S8 wheel regression guards, which hold before the feature by design. |

## Verification

- ✅ Every Red failure was caused by the missing feature, not by test bugs. Two test bugs found during Green were fixed in the tests: a replay-corruption fixture that SQLite's TEXT affinity neutralised, and a mock flag that leaked between describes.
- ✅ Core tests import only from `src/main/core/`.

## Notes

- The E2E spec was written after Areas A–C, as the tasks file allows. Its baseline failures above are the Red evidence.
- `e2e/alert-helpers.ts` `readAlertRows` now returns `[]` for an empty table. `sqlite3 -json` prints nothing at all in that case, and the MSFT case is the first spec to read an empty alerts table.
