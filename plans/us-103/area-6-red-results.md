# Red Phase Results: US-103 Area 6 — Detail read path (`pmccLedger` on `positions:get`)

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan**: `plans/us-103/plan.md` § 6; **tasks**: `plans/us-103/tasks.md` Area 6
- **Contract**: `plans/us-103/contracts/positions-get.md`

## Test Files Modified

- `/Users/johnteague/my-stuff/wb-103/src/main/services/get-position.test.ts` — new `describe('getPosition — PMCC ledger (US-103)')`, 5 tests
- `/Users/johnteague/my-stuff/wb-103/src/main/ipc/positions.test.ts` — 1 test: `positions:get success envelope carries pmccLedger for a PMCC`

## Interfaces Under Test

```typescript
// src/main/schemas.ts
export interface GetPositionResult {
  // ...existing fields
  pmccLedger: PmccLedgerResult | null // import type from '../core/costbasis'
}

// src/main/services/get-position.ts
// getPosition: pmccLedger = strategyType === 'PMCC' ? pmccLedgerFromLegs(legs) : null
```

## Test Coverage Summary

### Service (`get-position.test.ts`)

- [x] After `createPmccPosition` (XYZ LEAPS $80 @ 25.00, short $110 @ 2.00, ×1, no fees) → `pmccLedger` deep-equals `23.0000 / 2300.0000 / 25.0000 / 2500.0000 / 2.0000 / 200.0000 / 103.0000 / 8.0000`
- [x] After `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL`, `LEAPS_ROLL` (each inserted in a `db.transaction` with `appendPmccSnapshot`) → `basisPerShare 19.3000`, `effectiveShareCost 104.3000`, `leapsCostPerShare 22.5000`
- [x] Wheel position → `pmccLedger === null`
- [x] PMCC with all legs deleted → `pmccLedger === null`
- [x] `legs` include the `SHORT_CALL_EXPIRED` leg with `action 'EXPIRE'` (roles in order `LEAPS_OPEN, SHORT_CALL_OPEN, SHORT_CALL_EXPIRED`), and the ledger after an expiration is still `23.0000`

### IPC (`positions.test.ts`)

- [x] `positions:get` success envelope carries `pmccLedger` (service mocked, as the rest of the file does)

### Property tests

- No property — read path (the ledger math is property-tested in `costbasis.property.test.ts`).

## Test Design Assumptions

- Fixture legs use run-day-relative dates (`pmccFixtures(position.id, isoDate)`) because `createPmccPosition` validates against today — same as `pmcc-cost-basis-chain.test.ts`.
- The "no role filtering" test's leg assertions pass today (it is a regression guard); its trailing `pmccLedger.basisPerShare === '23.0000'` assertion is what makes it red.
- The IPC handler is a pass-through spread of the mocked service result, so the IPC case **passes at runtime today**. It is red under `pnpm typecheck` only: the mock result's `pmccLedger` is checked with `satisfies Partial<GetPositionResult>` (TS2353), and the envelope is read as `{ ok: true } & GetPositionResult` (TS2339). Green's schema change turns both green.

## Test Execution Results

```text
pnpm test src/main/services/get-position.test.ts src/main/ipc/positions.test.ts
FAIL getPosition — PMCC ledger (US-103) > returns the entry ledger right after createPmccPosition
  AssertionError: expected undefined to deeply equal { basisPerShare: '23.0000', …(7) }
FAIL … > returns the running ledger after an expiration, a new short, a short roll and a LEAPS roll
  TypeError: Cannot read properties of undefined (reading 'basisPerShare')
FAIL … > returns pmccLedger null for a wheel position
  AssertionError: expected undefined to be null
FAIL … > returns pmccLedger null for a PMCC whose legs were deleted
  AssertionError: expected undefined to be null
FAIL … > returns the SHORT_CALL_EXPIRED leg with action EXPIRE in legs (no role filtering)
  TypeError: Cannot read properties of undefined (reading 'basisPerShare')
Tests  5 failed | 62 passed (67)

pnpm typecheck (this area's errors)
src/main/ipc/positions.test.ts(1095,7): TS2353 'pmccLedger' does not exist in type 'Partial<GetPositionResult>'
src/main/ipc/positions.test.ts(1115,21): TS2339 Property 'pmccLedger' does not exist on type '{ ok: true; } & GetPositionResult'
src/main/services/get-position.test.ts(425|446|465|473|491): TS2339 Property 'pmccLedger' does not exist on type 'GetPositionResult'
```

## Verification

- ✅ Every service failure is `pmccLedger` being `undefined` — the field is not implemented
- ✅ IPC case fails under typecheck only (pass-through handler; documented above)
- ✅ No syntax, import, or fixture errors

## Handoff to Green Phase

Add `pmccLedger: PmccLedgerResult | null` to `GetPositionResult` and compute it in `getPosition` from the already-read `legs` via `pmccLedgerFromLegs` for PMCC positions (null otherwise). No handler change needed.
