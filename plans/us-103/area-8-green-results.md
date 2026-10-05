# Green Phase Results: US-103 Area 8 — Dev-only `_test:pmcc-record-leg-event` seam

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan file**: `plans/us-103/plan.md` § 8. Dev-only seam
- **Contract**: `plans/us-103/contracts/test-pmcc-record-leg-event.md`
- **Red phase results**: `plans/us-103/area-8-red-results.md`
- **Mockup**: n/a (main process only)

## Files touched (production)

- `src/main/schemas.ts` — `LegAction`/`LegRole` now a value import (were type-only); new "Dev-only test seam schemas" section at the end of the file: private `TestLegRowSchema`, exported `TestPmccLegEventPayloadSchema` + `TestPmccLegEventPayload` type
- `src/main/ipc/test-pmcc-ledger.ts` (new) — `registerTestPmccLedgerIpc(db)`; local `INSERT_LEG_SQL` + `insertLegRow`
- `src/main/index.ts` — registers it next to `registerTestIvHistoryIpc(db)` in the `NODE_ENV === 'test'` block
- `src/preload/index.ts` — `testPmccRecordLegEvent(payload)`
- `src/preload/index.d.ts` — `testPmccRecordLegEvent: (payload: unknown) => Promise<IpcResult<{ ledger: PmccLedgerResult; snapshot: CostBasisSnapshotRecord }>>` (+ the two type imports)

## E2E coverage added or modified

None.

## Public Interfaces Implemented

```typescript
// src/main/schemas.ts
export const TestPmccLegEventPayloadSchema // { positionId, triggerEvent: PmccTriggerEvent, eventDate, legs: TestLegRow[] }
export type TestPmccLegEventPayload

// src/main/ipc/test-pmcc-ledger.ts
export function registerTestPmccLedgerIpc(db: Database.Database): void
// '_test:pmcc-record-leg-event' → { ok: true, ledger, snapshot } | { ok: false, errors }
```

## Implementation Summary

Handler is `handleIpcCall` → Zod parse → one `db.transaction` that inserts each leg row then
returns `appendPmccSnapshot(...)` (`ledger`, `snapshot` spread into the envelope). A failed
snapshot insert rolls back the leg rows; a Zod failure writes nothing.

### Deviations from Plan

- Contract's `.min(0)` on `legs` dropped (no-op).
- Schemas appended under a new dev-only section at the end of `schemas.ts` — there was no existing `_test` schema section.

## Test Execution Results

- `pnpm test src/main/ipc/test-pmcc-ledger.test.ts` — 6/6 pass
- Full `pnpm test`: 3871 passed, 15 failed — 7 `ipc/*.test.ts` + `index.test.ts` 5000 ms timeouts (load flake; all pass rerun in isolation, 109/109), 1 `ipc/positions.test.ts` + 6 `list-positions.test.ts` (other agents' in-progress Red)

## Quality Checks

- ✅ `pnpm lint` clean
- ✅ `typecheck:node` clean
- ⚠️ `typecheck:web` — errors only in other areas' in-progress work (`PmccPositionRow`, `PositionCard.test`, `PositionCockpit.spec`, `PositionDetail*` tests: `initialNetDebit` / `pmccLedger`); none in files touched here

## Known Limitations / Tech Debt

- `insertLegRow` duplicates `create-pmcc-position.ts#insertPmccLeg`'s SQL but is NOT byte-identical: it adds the `roll_chain_id` column, takes `action` from the payload (not role-derived), uses `premiumPerContract` for both `premium_per_contract` and `fill_price`, and generates its own `randomUUID()`. Refactor candidate: one shared `leg-rows.ts#insertLegRow` with `roll_chain_id` that both callers use.
