# Red Phase Results: US-15 Layer 3 — LegHistoryTable Render Extension

## Feature Context

- **Feature directory**: `plans/us-15/`
- **User story**: `docs/epics/03-stories/US-15-roll-pair-display-in-timeline.md`
- **Plan file**: `plans/us-15/plan.md`

## Test Files Modified

- `src/renderer/src/components/LegHistoryTable.test.tsx` — 7 new tests added under `describe('LegHistoryTable roll pair grouping', ...)`

## Interfaces Under Test

The tests require `LegHistoryTable` to:

1. Import and call `buildRollTimeline` from `../lib/rollGroups`
2. Import and call `computeCumulativeRollSummary` from `../lib/rollGroups`
3. Import `rollCreditDebitColors` from `../lib/rolls`
4. Render new internal components:
   - `RollGroupHeaderRow` — shows "Roll #N", roll type badge, net per contract
   - `RollLegRow` — indented row for ROLL_FROM / ROLL_TO legs
   - `CumulativeSummaryRow` — shows "Credits", "Debits", "Net", roll count
5. Replace flat `legs.map(...)` in `<tbody>` with `buildRollTimeline(legs).map(...)`:
   - `type: 'leg'` → existing `<tr>`
   - `type: 'roll'` → `<RollGroupHeaderRow>` + two `<RollLegRow>`
   - `type: 'cumulative'` → `<CumulativeSummaryRow>`

## Test Coverage Summary

| #   | Test name                                             | Covers                                 |
| --- | ----------------------------------------------------- | -------------------------------------- |
| 1   | renders "Roll #1" and "Roll Out"                      | AC1 — visual grouping, roll type label |
| 2   | renders "+$1.60/contract" for net credit              | AC2 — net credit display               |
| 3   | renders debit amount for net debit                    | AC3 — net debit display                |
| 4   | renders "Roll #1"/"Roll #2"/"Roll #3" for three pairs | AC4 — sequential numbering             |
| 5   | cumulative summary contains Credits/1.60/Net          | AC4 — cumulative summary               |
| 6   | CSP Open → Roll #1 → Credits → Assign DOM order       | AC6 — chronological non-roll legs      |
| 7   | ROLL_FROM has null basis, ROLL_TO shows $174.90       | AC7 — running basis per leg            |

## Test Execution Results

```
Tests   7 failed | 12 passed (19)
```

All 7 new tests fail. All 12 existing tests pass.

## Verification

- ✅ Every new test fails because the component does not yet call `buildRollTimeline` or render roll group UI
- ✅ All failures are `Unable to find element with text: /Roll #1/` or similar — missing implementation, not test bugs
- ✅ No syntax errors in test file
- ✅ All 12 pre-existing tests continue to pass (no regressions introduced)

## Handoff to Green Phase

Green phase should implement in `src/renderer/src/components/LegHistoryTable.tsx`:

1. Import `buildRollTimeline`, `computeCumulativeRollSummary`, `RollGroup`, `CumulativeRollSummary` from `../lib/rollGroups`
2. Import `rollCreditDebitColors` from `../lib/rolls`
3. Add `RollGroupHeaderRow`, `RollLegRow`, `CumulativeSummaryRow` internal components
4. Replace `<tbody>{legs.map(...)}` with `buildRollTimeline(legs).map(...)`
