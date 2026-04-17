# Green Phase Results: US-15 Layer 3 — LegHistoryTable Render Extension

## Feature Context

- **Feature directory**: `plans/us-15/`
- **User story**: `docs/epics/03-stories/US-15-roll-pair-display-in-timeline.md`
- **Plan file**: `plans/us-15/plan.md`
- **Red phase results**: `plans/us-15/red-phase-results-layer3.md`
- **Mockup**: `mockups/us-15-roll-pair-timeline.mdx`

## Implementation Files Created/Modified

- `src/renderer/src/components/LegHistoryTable.tsx` — added three new internal components and replaced flat `legs.map` with `buildRollTimeline` timeline rendering
- `src/renderer/src/components/LegHistoryTable.test.tsx` — fixed two test assertions that were too broad (matching text in multiple elements)

## Public Interfaces Implemented

```typescript
// New internal components (not exported):
function NormalLegRow({ leg: LegHistoryEntry }): React.JSX.Element
function RollGroupHeaderRow({ group: RollGroup }): React.JSX.Element
function RollLegRow({ leg: LegHistoryEntry }): React.JSX.Element
function CumulativeSummaryRow({ summary: CumulativeRollSummary }): React.JSX.Element

// LegHistoryTable now imports from rollGroups:
import {
  buildRollTimeline,
  CumulativeRollSummary,
  LegHistoryEntry,
  RollGroup
} from '../lib/rollGroups'
```

## Implementation Summary

### Approach

1. Imported `buildRollTimeline` and types from `../lib/rollGroups` and `rollCreditDebitColors` from `../lib/rolls`
2. Extracted the existing leg row into `NormalLegRow` component
3. Added `RollGroupHeaderRow` — renders a full-width `<td colSpan={8}>` with roll number, type badge, fill date, and net per contract
4. Added `RollLegRow` — same columns as normal but with `pl-7` indent and blue-tinted background
5. Added `CumulativeSummaryRow` — shows Credits/Debits/Net summary after all roll groups
6. Replaced `legs.map(...)` with `buildRollTimeline(legs).map(...)` dispatching on `item.type`

### Key Design Decisions

- **React.Fragment with key**: Roll groups produce 3 `<tr>` elements; wrapped in `React.Fragment` with `rollChainId` as key
- **Inline styles for dynamic colors**: `borderTop`, `background` and per-group colors use inline styles since they depend on runtime values from `rollCreditDebitColors`
- **Test assertion fixes**: Two test assertions were overly broad — `getByText(/1\.60/)` matched 3 elements (group header net, credits span, net span); fixed to use specific patterns like `getByText(/Credits: \+\$1\.60/)`

### Deviations from Plan

- `LegHistoryEntry` type imported from `rollGroups.ts` (removes duplication) rather than redefining it locally

## Test Execution Results

```
Test Files  71 passed (71)
Tests       718 passed (718)
```

## Quality Checks

- ✅ `pnpm test` — 718/718 passed
- ✅ `pnpm lint` — no errors (warnings only, fixed by `pnpm format`)
- ✅ `pnpm typecheck` — no errors

## Known Limitations / Tech Debt

- `NormalLegRow` and `RollLegRow` share identical column structure — could be consolidated in refactor
- Inline style objects for colors are small but repeated — could be extracted to constants
- The `React` import is used only for `React.Fragment` — could use `<>` syntax in the refactor

## Handoff to Refactor Phase

Run `/refactor`. Focus areas:

1. Consolidate `NormalLegRow` and `RollLegRow` to share column rendering logic
2. Extract color/bg constants for roll group tinting
3. Consider using `<>` fragment shorthand instead of `<React.Fragment>`
