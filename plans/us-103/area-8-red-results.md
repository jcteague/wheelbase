# Red Phase Results: US-103 Area 8 — Dev-only `_test:pmcc-record-leg-event` seam

## Feature Context

- **Feature directory**: `plans/us-103/`
- **Plan**: `plans/us-103/plan.md` § 8. Dev-only seam; `plans/us-103/tasks.md` Area 8
- **Contract**: `plans/us-103/contracts/test-pmcc-record-leg-event.md`

## Test Files Created/Modified

- `/Users/johnteague/my-stuff/wb-103/src/main/ipc/test-pmcc-ledger.test.ts` (new)

## Interfaces Under Test

```typescript
// src/main/ipc/test-pmcc-ledger.ts (new)
export function registerTestPmccLedgerIpc(db: Database.Database): void
// registers exactly one channel:
// '_test:pmcc-record-leg-event' (_event, payload: unknown)
//   → Promise<{ ok: true, ledger: PmccLedgerResult, snapshot: CostBasisSnapshotRecord }
//            | { ok: false, errors: IpcFieldError[] }>   (via handleIpcCall)

// payload
{
  positionId: string,
  triggerEvent: PmccTriggerEvent,     // CSP_ROLL etc. rejected on field 'triggerEvent'
  eventDate: 'YYYY-MM-DD',
  legs: Array<{ legRole, action, strike, expiration, contracts, premiumPerContract,
                fillDate, fees, rollChainId }>   // may be empty
}
```

## Test Coverage Summary

### IPC Handler Tests (src/main/ipc/test-pmcc-ledger.test.ts)

- [x] Registers exactly one channel, `_test:pmcc-record-leg-event`
- [x] `SHORT_2` row after `createPmccPosition` → `ok: true`, `ledger.basisPerShare '21.2000'`, `snapshot.triggerEvent 'PMCC_SHORT_OPEN'`; legs +1, snapshots +1
- [x] `SHORT_ROLL` pair (shared `rollChainId 'rc-1'`) after `SHORT_2` → basis `'21.8000'`, legs +2, snapshots +1, `roll_chain_id` persisted
- [x] Empty `legs` + `PMCC_SHORT_EXPIRED` → snapshot written, basis `'23.0000'`, legs unchanged
- [x] `triggerEvent 'CSP_ROLL'` → `{ ok: false, errors: [{ field: 'triggerEvent', … }] }` (exactly one error), nothing written
- [x] `DROP TABLE cost_basis_snapshots` → `{ ok: false, errors: [{ code: 'internal_error', … }] }` (exactly one error), leg insert rolled back

### Property Tests

- No property — test seam (thin IPC fixture writer; ledger math is covered by `costbasis.property.test.ts`).

## Test Design Assumptions

- `ipcMain` mocked with `vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))`; the handler map is built from `vi.mocked(ipcMain.handle).mock.calls`, exactly like `test-iv-history.test.ts`. The handler is invoked as `handler(null, payload)` and awaited (handleIpcCall returns a Promise).
- The real in-memory DB (`makeTestDb()`) is passed straight to `registerTestPmccLedgerIpc(db)`; position opened with `createPmccPosition` on run-day-relative dates (`isoDate`), fixture rows from `pmccFixtures(position.id, isoDate)` mapped to the camelCase payload row.
- The CSP_ROLL and internal_error tests use `toEqual({ ok: false, errors: [expect.objectContaining(...)] })`, so the envelope must carry exactly one error and no extra top-level keys (handleIpcCall's ZodError / fallback branches already produce that shape — note `triggerEvent` must be the only failing field).
- The rollback test requires the leg insert and `appendPmccSnapshot` to share one `db.transaction(...)()`.

## Test Execution Results

```
pnpm test src/main/ipc/test-pmcc-ledger.test.ts

FAIL src/main/ipc/test-pmcc-ledger.test.ts (6 tests)
  Error: Cannot find module '/src/main/ipc/test-pmcc-ledger' imported from
  '/Users/johnteague/my-stuff/wb-103/src/main/ipc/test-pmcc-ledger.test.ts'

Test Files  1 failed (1)
     Tests  6 failed (6)
```

## Verification

- ✅ All 6 tests fail with `Cannot find module './test-pmcc-ledger'` — the handler module does not exist yet
- ✅ Test setup (createPmccPosition, fixtures, DB) runs before the failing import, so no fixture errors
- ✅ ESLint clean, prettier formatted

## Handoff to Green Phase

Implement `src/main/ipc/test-pmcc-ledger.ts` per tasks.md Area 8 [Green] (schemas in `src/main/schemas.ts`, registration in `src/main/index.ts` test block, preload `testPmccRecordLegEvent`).
