# Green Phase Results: US-103 Area 6 — Detail read path (`pmccLedger` on `positions:get`)

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan file**: `plans/us-103/plan.md` § 6
- **Contract**: `plans/us-103/contracts/positions-get.md`
- **Red phase results**: `plans/us-103/area-6-red-results.md`
- Mockup check: not applicable (main-process change only)

## Files touched (production)

- `src/main/schemas.ts` — `GetPositionResult` gains `pmccLedger: PmccLedgerResult | null`; `PmccLedgerResult` added to the existing type import from `./core/costbasis`
- `src/main/services/get-position.ts` — `pmccLedger = strategyType === 'PMCC' ? pmccLedgerFromLegs(legs) : null`, from the already-read `legs`

Test fixtures updated (typecheck consequence of the new required field, not Red tests):

- `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx`, `src/renderer/src/pages/PositionDetailContent.test.tsx`, `src/renderer/src/pages/PositionDetailPage.test.tsx` — wheel `GetPositionResult` fixtures gain `pmccLedger: null`

## E2E coverage added or modified

None.

## Public Interfaces Implemented

```typescript
// src/main/schemas.ts
export interface GetPositionResult {
  // ...existing fields
  pmccLedger: PmccLedgerResult | null
}
// 'positions:get' → { ok: true, ...GetPositionResult } (handler unchanged; spreads the service result)
```

## Implementation Summary

`pmccLedgerFromLegs` already returns `null` for an empty leg list, so the PMCC-with-no-legs case needs no extra branch. No handler change.

### Deviations from Plan

- Three renderer test fixtures typed as `GetPositionResult` failed typecheck once the field became required; each got `pmccLedger: null`. No assertion changed.

## Test Execution Results

```text
pnpm test src/main/services/get-position.test.ts src/main/ipc/positions.test.ts
Test Files  2 passed (2)
Tests  67 passed (67)

pnpm test (renderer fixtures touched)
Test Files  3 passed (3)
Tests  75 passed (75)
```

Full `pnpm test`: the only failures are in other areas' in-progress work
(`ipc/test-pmcc-ledger.test.ts`, `services/list-positions.test.ts`, `lib/position-list-items.test.ts`).

## Quality Checks

- ✅ Area 6 tests pass
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` — no errors from this area; remaining errors are the list-summary area's `initialNetDebit` removal (`PmccPositionRow.tsx`, `PmccPositionRow.test.tsx`, `PositionCard.test.tsx`)

## Known Limitations / Tech Debt

- `getPosition` now has two parallel `strategyType === 'PMCC' ? … : null` lines (`initialNetDebit`, `pmccLedger`); Refactor could fold them.
- `pmccLedger` is computed after the `position_fetched` INFO log; harmless, but ordering could be tidied.

## Handoff to Refactor Phase

Run `/refactor` for Area 6; start from `src/main/services/get-position.ts`.
