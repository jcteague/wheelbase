# Refactor Phase Results: US-106 — PMCC short-call assignment-risk alert

## Automated Simplification

| Area      | Files                                                                                             | Result                                                          |
| --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A core    | `src/main/core/alerts.ts`, `alerts.test.ts`, `alerts.property.test.ts`                            | passed — re-wrapped the shared guard's doc comment only         |
| C service | `src/main/services/evaluate-alerts.ts`, `evaluate-alerts-pmcc.test.ts`, `evaluate-alerts.test.ts` | passed — candidate ids computed once in `loadPmccEvaluableRows` |
| D e2e     | `e2e/pmcc-assignment-risk-alert.spec.ts`, `e2e/alert-helpers.ts`                                  | see the e2e run recorded below                                  |
| B queue   | (no simplifier run; the change is a 9-line inline badge branch)                                   | —                                                               |

## Manual Refactorings Performed

### 1. Extract function — `priceDirection`

**File**: `src/main/core/alerts.ts`
**Before**: `strikeProximitySummary` and `pmccAssignmentRiskSummary` each computed `price >= strike ? 'above' : 'below'`.
**After**: Both now call one `priceDirection(input)`, which documents that at-the-money reads "above".

### 2. Object parameters — property-test helpers

**File**: `src/main/core/alerts.property.test.ts`
**Before**: `input(phase, strike, price)` and `fires(strike, price, phase)` took positional parameters.
**After**: Both take a `RuleCase` object (the project convention for 3+ parameters).

### 3. Derive a hand-copied type — `ManagementQueueItem` in the preload

**Files**: `src/preload/index.d.ts`, `src/renderer/src/components/ManagementQueueRow.tsx`
**Before**: The preload hand-copied the queue item with `phase: string`, which forced `item.phase as WheelPhase` in the row.
**After**: The global is now an alias of the schema's `ManagementQueueItem` (`phase: WheelPhase`), so the cast is gone and the new `=== 'PMCC_OPEN'` branch is type-checked.

### 4. Object parameters — `loadPmccEvaluableRows`

**File**: `src/main/services/evaluate-alerts.ts`
**Before**: The signature was `(db, failedIds, logger)`.
**After**: It takes `{ db, failedIds, logger }`.

### 5. Test hygiene — service suite

**File**: `src/main/services/evaluate-alerts-pmcc.test.ts`
**Before**: A redundant `leg` alias wrapped `makePmccLeg`, and the bulk-read failure flag was reset in only some describes.
**After**: Tests call `makePmccLeg` directly, and one top-level `beforeEach` resets the flag. The partial reset had leaked a failure into the last describe.

### 6. E2E — data-driven wheel cases and shared LEAPS check

**File**: `e2e/pmcc-assignment-risk-alert.spec.ts`
**Before**: S8 branched on `ticker === 'MSFT'` inside the test, and S6/S9 duplicated the "no `$80.00` / LEAPS expiration in any summary" loop.
**After**: Each S8 case carries its own `wheelRule` and `wheelOutcome`, and `expectNoLeapsReference` holds the shared check.

## Quality Checks

- ✅ `pnpm test` — 289 files, 4648 tests passed (after C-Refactor)
- ✅ `pnpm lint`
- ✅ `pnpm typecheck`
- ✅ `pnpm format`
- ✅ Core properties stressed at 500 runs × 5 seeds; the temporary wrapper was removed

## Files touched (production)

- `src/main/core/alerts.ts`
- `src/main/services/evaluate-alerts.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/components/ManagementQueueRow.tsx`

## E2E coverage added or modified

- `e2e/pmcc-assignment-risk-alert.spec.ts` — 9 scenario families, 15 cases
- `e2e/alert-helpers.ts` — `readAlertRows` handles an empty table

## Remaining Tech Debt

- [ ] **Accepted gap — expired PMCC short stays current** until US-119 (OPT-25) / US-111 (OPT-19) add production writers for the closing short-call legs. Until then `PMCC_ASSIGNMENT_RISK` can keep firing on a short past its expiration date. Closure stays ledger-driven by design, and the alert service needs no change. Both Linear issues carry the follow-up, including switching the S6 e2e from the test hook to the real path.

- [ ] `src/main/services/evaluate-alerts.ts` is about 390 lines. The PMCC selection helpers stay module-private there, per the plan's Type Design. If the file keeps growing, splitting selection into its own module is the next step.
- [ ] Pre-existing: a row whose `evaluatePosition` throws still has its alerts resolved, because the per-row catch does not add keep-open keys. US-106 preserves keys only for PMCC selection failures, as planned. The wheel path is unchanged.

## Notes

All refactorings were made incrementally, with tests passing after each change.
