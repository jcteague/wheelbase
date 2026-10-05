# Red Phase Results: US-103 Area 10 — PMCC list row shows the running cost basis

## Feature Context

- **Feature directory**: `plans/us-103/`
- **User story**: Linear OPT-9 (US-103)
- **Plan file**: `plans/us-103/plan.md` § "10. Renderer: PMCC list row"; contract `plans/us-103/contracts/positions-list.md`

## Test Files Modified

- `/Users/johnteague/my-stuff/wb-103/src/renderer/src/components/PmccPositionRow.test.tsx`
  - Fixture `pmcc` is now `{ long, short, basisPerShare: '21.8000', basisTotal: '2180.0000' }` (no `initialNetDebit`)
  - Replaced `cost basis cell shows the grouped initial net debit` with
    `cost basis cell shows the grouped running basis total with no net-debit suffix` — `cells()[9]` has `$2,180.00`, not `net debit`
  - Added `cost basis cell shows a negative basis total signed, not clamped to zero` — `basisTotal '-40.0000'` → `-$40.00`, not `$0.00`
  - The other test cases are unchanged
- `/Users/johnteague/my-stuff/wb-103/src/renderer/src/components/PositionCard.test.tsx`
  - `delegates a PMCC item to PmccPositionRow`: same fixture change; asserts `getByText('$2,180.00')` and the row has no `net debit` text (the plan missed this fixture)

## Interface Under Test

```typescript
// src/main/schemas.ts (already landed)
export type PmccListSummary = { long: PmccLegSummary; short: PmccLegSummary } & Pick<
  PmccLedgerResult,
  'basisPerShare' | 'basisTotal'
>

// src/renderer/src/components/PmccPositionRow.tsx — last TableCell renders fmtMoneyGrouped(basisTotal)
```

No property tests, because this is a renderer change.

## Test Execution Results

```
pnpm test src/renderer/src/components/PmccPositionRow.test.tsx src/renderer/src/components/PositionCard.test.tsx
Tests  14 failed | 27 passed (41)
Error: [DecimalError] Invalid argument: undefined
```

- All 13 `PmccPositionRow.test.tsx` cases and `PositionCard › delegates a PMCC item to PmccPositionRow` fail.
  `PmccPositionRow` still destructures `initialNetDebit` (now `undefined` with the new-shape fixture) and passes it to `fmtMoneyGrouped`, which throws during render.
- `pnpm typecheck`: `PmccPositionRow.tsx(22,24): TS2339 Property 'initialNetDebit' does not exist on type 'PmccListSummary'`. The two test files typecheck clean.

## Verification

- Every failure comes from the missing implementation, which reads the removed `initialNetDebit` field. None comes from a test bug.
- The nine cells' assertions themselves are unchanged. They fail only because the throw crashes the whole render, and they will pass once Green stops reading `initialNetDebit`. They can't stay green during Red without putting the removed field back in the fixture.

## Handoff to Green

In `PmccPositionRow.tsx`, destructure `basisTotal` and render `fmtMoneyGrouped(basisTotal)` in the last cell, dropping the ` net debit` suffix. All 41 tests should then pass.
