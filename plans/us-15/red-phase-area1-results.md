# Red Phase Results: US-15 Area 1 — Backend rollChainId in getPosition

## Feature Context

- **Feature directory**: `plans/us-15/`
- **User story**: `docs/epics/03-stories/US-15-roll-pair-display-in-timeline.md`
- **Plan file**: `plans/us-15/plan.md`

## Test Files Modified

- `src/main/services/get-position.test.ts` — two new tests added to the existing `describe('getPosition', ...)` block

## Interfaces Under Test

```typescript
// src/main/schemas.ts — LegRecord
interface LegRecord {
  // ... existing fields ...
  rollChainId: string | null // NEW field — shared UUID for ROLL_FROM + ROLL_TO pair
}

// src/main/services/get-position.ts
// - LegRow interface: needs roll_chain_id: string | null
// - GET_LEGS_QUERY: needs roll_chain_id in SELECT
// - mapLegRow: needs rollChainId: r.roll_chain_id ?? null
```

## Test Coverage Summary

- [x] After a CSP roll, ROLL_FROM and ROLL_TO legs both have a defined, non-null `rollChainId` that is the same UUID
- [x] A CSP_OPEN (non-roll) leg has `rollChainId: null`

## Test Execution Results

```
 ❯  main  src/main/services/get-position.test.ts (11 tests | 2 failed)
     ✓ returns position with activeLeg and costBasisSnapshot for a CSP_OPEN position
     ✓ returns null for an unknown positionId
     ✓ returns legs array with all legs in chronological order
     ✓ returns empty legs array when position has no legs
     ✓ returns ROLL_TO leg as activeLeg after a CSP roll
     ✓ returns activeLeg as null when no open leg exists
     ✓ getPosition returns allSnapshots as empty array when position has no snapshots
     ✓ getPosition returns allSnapshots ordered snapshot_at ASC for a CSP_OPEN position
     ✓ getPosition returns allSnapshots with multiple snapshots after assign and CC open
     × getPosition returns rollChainId on ROLL_FROM and ROLL_TO legs after a CSP roll
     × getPosition returns rollChainId as null for a non-roll leg (CSP_OPEN)

FAIL: AssertionError: expected undefined to be defined
  at get-position.test.ts:248 — rollFromLeg!.rollChainId is undefined (not in SELECT)

FAIL: AssertionError: expected undefined to be null
  at get-position.test.ts:271 — cspOpenLeg!.rollChainId is undefined (not in SELECT)
```

## Verification

- ✅ Every new test fails because `rollChainId` is not in the SELECT query — not due to test bugs
- ✅ All 9 existing tests continue to pass unchanged
- ✅ No syntax errors in test files

## Handoff to Green Phase

Green phase must:

1. Add `rollChainId: string | null` to `LegRecord` in `src/main/schemas.ts` (after `fillDate`)
2. Add `roll_chain_id: string | null` to `LegRow` interface in `src/main/services/get-position.ts`
3. Add `roll_chain_id` to the `GET_LEGS_QUERY` SELECT column list
4. Add `rollChainId: r.roll_chain_id ?? null` to `mapLegRow`
