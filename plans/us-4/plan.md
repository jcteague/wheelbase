# Implementation Plan: US-4 — Close a CSP Early (Buy to Close)

## Summary

This story adds the ability to close a cash-secured put (CSP) position early by recording a buy-to-close transaction. The close flow validates the position phase, calculates final P&L, persists a close leg and updated cost basis snapshot, and transitions the position to `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS`. The frontend shows a real-time P&L preview before the trader confirms.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/01-stories/US-4-close-csp-early.md`
- **Research & Design Decisions:** `plans/us-4/research.md`
- **Data Model:** `plans/us-4/data-model.md`
- **IPC Contracts:** `plans/us-4/contracts/close-csp.md`
- **Quickstart & Verification:** `plans/us-4/quickstart.md`

## Prerequisites

- US-1 complete: `positions` table, `legs` table, `cost_basis_snapshots` table, `createPosition` service, `positions:create` IPC handler — all exist.
- `ValidationError` class exists in `src/main/core/lifecycle.ts`.
- `makeTestDb()` and `isoDate()` test helpers exist in `src/main/test-utils.ts`.
- `src/main/core/types.ts` already defines `WheelPhase` union including `CSP_CLOSED_PROFIT` and `CSP_CLOSED_LOSS`.
- No DB migration required — `cost_basis_snapshots.final_pnl` (nullable TEXT) already exists.

---

## Implementation Areas

### 1. Core lifecycle: `closeCsp()` function

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — add `CloseCspInput`, `CloseCspResult` types and `closeCsp()` function

**Red — tests to write** (in `src/main/core/lifecycle.test.ts`):

- Test case: `closeCsp` with `currentPhase !== 'CSP_OPEN'` throws `ValidationError` with `field='__phase__'`, `code='invalid_phase'`, message `'Position is not in CSP_OPEN phase'`
- Test case: `closeCsp` with `closePricePerContract = '0'` throws `ValidationError` with `field='closePricePerContract'`, `code='must_be_positive'`
- Test case: `closeCsp` with `closePricePerContract = '-1.00'` throws same `must_be_positive` error
- Test case: `closeCsp` with `closeFillDate < openFillDate` (e.g. close `'2026-03-15'`, open `'2026-03-20'`) throws `ValidationError` with `field='fillDate'`, `code='close_date_before_open'`, message `'Close date cannot be before the open date'`
- Test case: `closeCsp` with `closeFillDate > expiration` (e.g. close `'2026-04-18'`, expiration `'2026-04-17'`) throws `ValidationError` with `field='fillDate'`, `code='close_date_after_expiration'`, message `'Close date cannot be after expiration date'`
- Test case: `closeCsp` with `closePricePerContract = '1.00'`, `openPremiumPerContract = '2.50'` (profit) returns `{ phase: 'CSP_CLOSED_PROFIT' }`
- Test case: `closeCsp` with `closePricePerContract = '3.50'`, `openPremiumPerContract = '2.50'` (loss) returns `{ phase: 'CSP_CLOSED_LOSS' }`
- Test case: `closeCsp` with `closePricePerContract = '2.50'`, `openPremiumPerContract = '2.50'` (breakeven) returns `{ phase: 'CSP_CLOSED_LOSS' }` (net P&L = 0 → loss)
- Test case: `closeCsp` with `closeFillDate === expiration` (equal, not after) passes validation — fill on expiry is valid

**Green — implementation:**

- Add `CloseCspInput` interface: `currentPhase: WheelPhase`, `closePricePerContract: string`, `openPremiumPerContract: string`, `closeFillDate: string`, `openFillDate: string`, `expiration: string`
- Add `CloseCspResult` interface: `phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'`
- Add `closeCsp(input: CloseCspInput): CloseCspResult` function:
  1. If `input.currentPhase !== 'CSP_OPEN'` → throw `ValidationError('__phase__', 'invalid_phase', 'Position is not in CSP_OPEN phase')`
  2. If `new Decimal(input.closePricePerContract).lte(0)` → throw `ValidationError('closePricePerContract', 'must_be_positive', 'Close price must be positive')`
  3. If `input.closeFillDate < input.openFillDate` → throw `ValidationError('fillDate', 'close_date_before_open', 'Close date cannot be before the open date')`
  4. If `input.closeFillDate > input.expiration` → throw `ValidationError('fillDate', 'close_date_after_expiration', 'Close date cannot be after expiration date')`
  5. Compute `netPnl = new Decimal(input.openPremiumPerContract).minus(input.closePricePerContract)`
  6. Return `{ phase: netPnl.gt(0) ? 'CSP_CLOSED_PROFIT' : 'CSP_CLOSED_LOSS' }`

**Refactor — cleanup:**

- Consider extracting a shared `validatePositiveDecimal(value, field, code, message)` helper if openWheel and closeCsp share the pattern.

**Acceptance criteria covered:**

- "Reject close when position is not in CSP_OPEN phase → rejected with message 'Position is not in CSP_OPEN phase'"
- "Reject close with invalid price (0, -1.00) → 'Close price must be positive'"
- "Reject close with fill date before the open leg's fill date → 'Close date cannot be before the open date'"
- "Reject close with fill date after expiration → 'Close date cannot be after expiration date'"
- "Close at profit → CSP_CLOSED_PROFIT", "Close at loss → CSP_CLOSED_LOSS"

---

### 2. Core cost basis: `calculateCspClose()` function

**Files to create or modify:**

- `src/main/core/costbasis.ts` — add `CspCloseInput`, `CspCloseResult` types and `calculateCspClose()` function

**Red — tests to write** (in `src/main/core/costbasis.test.ts`):

- Test case: open premium `'2.50'`, close price `'1.00'`, 1 contract → `finalPnl = '150.0000'`, `pnlPercentage = '60.0000'`
- Test case: open premium `'2.50'`, close price `'3.50'`, 1 contract → `finalPnl = '-100.0000'`, `pnlPercentage = '-40.0000'`
- Test case: open premium `'2.50'`, close price `'1.00'`, 2 contracts → `finalPnl = '300.0000'`, `pnlPercentage = '60.0000'` (percentage is per-contract, not affected by contracts count)
- Test case: open premium `'2.50'`, close price `'2.50'` (breakeven) → `finalPnl = '0.0000'`, `pnlPercentage = '0.0000'`
- Test case: rounding — open premium `'1.33'`, close price `'0.66'`, 1 contract → verify 4 dp rounding is ROUND_HALF_UP

**Green — implementation:**

- Add `CspCloseInput` interface: `openPremiumPerContract: string`, `closePricePerContract: string`, `contracts: number`
- Add `CspCloseResult` interface: `finalPnl: string`, `pnlPercentage: string`
- Add `calculateCspClose(input: CspCloseInput): CspCloseResult` function:
  1. `openPremium = new Decimal(input.openPremiumPerContract)`
  2. `closePrice = new Decimal(input.closePricePerContract)`
  3. `netPnlPerContract = openPremium.minus(closePrice)`
  4. `finalPnl = round4(netPnlPerContract.times(input.contracts).times(100))`
  5. `pnlPercentage = round4(netPnlPerContract.dividedBy(openPremium).times(100))`
  6. Return `{ finalPnl: finalPnl.toString(), pnlPercentage: pnlPercentage.toString() }`

**Refactor — cleanup:**

- Check that `round4` helper (already in the file) is reused consistently.

**Acceptance criteria covered:**

- "P&L preview displays: premium collected $2.50, cost to close $1.00, net P&L per contract $1.50, total P&L $150.00, % of premium captured 60%"
- "P&L preview for loss: net P&L per contract -$1.00, total P&L -$100.00, % of premium captured -40%"

---

### 3. Main process schemas: new types for close

**Files to create or modify:**

- `src/main/schemas.ts` — add `CloseCspPayloadSchema`, `CloseCspPayload`, `CloseCspPositionResult`, and `GetPositionResult`

**Red — tests to write:**

- No dedicated schema tests (schema parsing is exercised via service and IPC tests in later areas). Verify with `pnpm typecheck`.

**Green — implementation:**

- Add `CloseCspPayloadSchema`:
  ```typescript
  z.object({
    positionId: z.string().uuid(),
    closePricePerContract: z.number().positive(),
    fillDate: z.string().optional()
  })
  ```
- Add `type CloseCspPayload = z.infer<typeof CloseCspPayloadSchema>`
- Add `CloseCspPositionResult` interface (IPC success return):
  ```typescript
  {
    position: {
      ;(id, ticker, phase, status, closedDate)
    }
    leg: LegRecord
    costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
  }
  ```
- Add `GetPositionResult` interface:
  ```typescript
  {
    position: PositionRecord
    activeLeg: LegRecord | null
    costBasisSnapshot: (CostBasisSnapshotRecord & { finalPnl: string | null }) | null
  }
  ```
  Reuse `PositionRecord` and `LegRecord` already in `schemas.ts`.

**Refactor — cleanup:**

- Check that `CostBasisSnapshotRecord` can be extended to include `finalPnl` without duplication. If `CostBasisSnapshotRecord` doesn't have `finalPnl`, add it as `finalPnl: string | null`.

**Acceptance criteria covered:**

- (Structural prerequisite for areas 4–6; no direct AC.)

---

### 4. Service: `getPosition(db, positionId)`

**Files to create or modify:**

- `src/main/services/get-position.ts` — new file with `getPosition()` function
- `src/main/services/positions.ts` — add `export { getPosition } from './get-position'`

**Red — tests to write** (in `src/main/services/get-position.test.ts`):

- Setup: use `makeTestDb()` + `createPosition()` to create a test CSP_OPEN position.
- Test case: `getPosition(db, positionId)` returns `{ position: { id, ticker, phase: 'CSP_OPEN', status: 'ACTIVE', openedDate, closedDate: null }, activeLeg: { legRole: 'CSP_OPEN', premiumPerContract: '2.5000', ... }, costBasisSnapshot: { finalPnl: null, ... } }`
- Test case: `getPosition(db, unknownId)` returns `null`
- Test case: activeLeg is `null` if no open leg exists (insert a position row directly with no leg)

**Green — implementation:**

- Query: join `positions` with the most recent `CSP_OPEN` or `CC_OPEN` leg (same pattern as `listPositions`), plus the latest `cost_basis_snapshots` row.
- Map DB snake_case columns to camelCase `GetPositionResult` shape.
- Return `null` if no position row found.
- Log `DEBUG` at start, `INFO` for `'position_fetched'` event with positionId.

**Refactor — cleanup:**

- Verify the subquery pattern for latest leg/snapshot matches `list-positions.ts` to avoid drift.

**Acceptance criteria covered:**

- (Prerequisite for area 5 and the frontend close form.)

---

### 5. Service: `closeCspPosition(db, positionId, payload)`

**Files to create or modify:**

- `src/main/services/close-csp-position.ts` — new file with `closeCspPosition()` function
- `src/main/services/positions.ts` — add `export { closeCspPosition } from './close-csp-position'`

**Red — tests to write** (in `src/main/services/close-csp-position.test.ts`):

- Setup: `makeTestDb()` + `createPosition()` for AAPL, strike 180, premium 2.50, 1 contract, fill_date `isoDate(0)`, expiration `isoDate(30)`.
- Test case: close at profit (`closePricePerContract: 1.0`, `fillDate: isoDate(5)`) →
  - Returns `{ position: { phase: 'CSP_CLOSED_PROFIT', status: 'CLOSED', closedDate: isoDate(5) }, leg: { legRole: 'CSP_CLOSE', action: 'BUY', fillDate: isoDate(5), premiumPerContract: '1.0000' }, costBasisSnapshot: { finalPnl: '150.0000' } }`
  - DB: position row has `phase='CSP_CLOSED_PROFIT'`, `status='CLOSED'`, `closed_date=isoDate(5)`
  - DB: new legs row with `leg_role='CSP_CLOSE'`, `action='BUY'`, `fill_price='1.0000'`
  - DB: new `cost_basis_snapshots` row with `final_pnl='150.0000'`
- Test case: close at loss (`closePricePerContract: 3.5`) → `phase: 'CSP_CLOSED_LOSS'`, `finalPnl: '-100.0000'`
- Test case: `closeCspPosition` with `closePricePerContract: 0` throws `ValidationError` with `field='closePricePerContract'`
- Test case: `closeCspPosition` with `fillDate` before open leg's fill date throws `ValidationError` with `field='fillDate'`, `code='close_date_before_open'`
- Test case: `closeCspPosition` with `fillDate` after expiration throws `ValidationError` with `field='fillDate'`, `code='close_date_after_expiration'`
- Test case: position not found → throws `ValidationError` with `field='__root__'`, `code='not_found'`
- Test case: `fillDate` defaults to today when omitted

**Green — implementation** (in `src/main/services/close-csp-position.ts`):

1. `const today = new Date().toISOString().slice(0, 10)`
2. `const fillDate = payload.fillDate ?? today`
3. `const positionDetail = getPosition(db, positionId)` — if null, throw `ValidationError('__root__', 'not_found', 'Position not found')`
4. `const openLeg = positionDetail.activeLeg` — must exist (CSP_OPEN positions always have an active leg)
5. `const closePriceStr = String(payload.closePricePerContract)`
6. Call `closeCsp({ currentPhase: positionDetail.position.phase, closePricePerContract: closePriceStr, openPremiumPerContract: openLeg.premiumPerContract, closeFillDate: fillDate, openFillDate: openLeg.fillDate, expiration: openLeg.expiration })` — throws on validation failure
7. Call `calculateCspClose({ openPremiumPerContract: openLeg.premiumPerContract, closePricePerContract: closePriceStr, contracts: openLeg.contracts })`
8. Format decimals to 4 dp.
9. DB transaction:
   a. `INSERT INTO legs` (close leg: leg_role=CSP_CLOSE, action=BUY, option_type=PUT, strike/expiration/contracts from openLeg, premium_per_contract=closePriceFormatted, fill_price=closePriceFormatted, fill_date=fillDate)
   b. `UPDATE positions SET phase=?, status='CLOSED', closed_date=?, updated_at=? WHERE id=?`
   c. `INSERT INTO cost_basis_snapshots` (basis_per_share and total_premium_collected from opening snapshot, final_pnl=finalPnlFormatted)
10. Log `INFO` for `'position_closed'` with positionId, phase, finalPnl.
11. Return `CloseCspPositionResult`.

**Refactor — cleanup:**

- Verify transaction pattern matches `createPosition` (wrapped in `db.transaction(() => { ... })()`).
- Check for duplication with `createPosition` on the snapshot insert shape.

**Acceptance criteria covered:**

- "Successfully close a CSP at a profit → CSP_CLOSED_PROFIT, status closed, close leg recorded, cost basis snapshot shows final_pnl $150.00"
- "Successfully close a CSP at a loss → CSP_CLOSED_LOSS"
- All validation rejection scenarios (phase, price, dates)

---

### 6. IPC handlers: `positions:get` and `positions:close-csp`

**Files to create or modify:**

- `src/main/ipc/positions.ts` — add two new `ipcMain.handle` registrations inside `registerPositionsHandlers()`

**Red — tests to write:**

- IPC handler behaviour is covered by service-layer integration tests (area 5) and E2E tests. No isolated IPC unit tests needed here — follow the existing pattern (`ping.test.ts` is the only IPC unit test and it's trivial).
- Add E2E test scenario to `e2e/electron.spec.ts`: open a position, navigate to detail page, close it, verify position no longer shown as active.

**Green — implementation:**

- Add import of `getPosition` and `closeCspPosition` from `'../services/positions'`.
- Add import of `CloseCspPayloadSchema` from `'../schemas'`.
- Register `positions:get`:
  ```typescript
  ipcMain.handle('positions:get', (_, payload: { positionId: string }) => {
    try {
      const result = getPosition(db, payload.positionId)
      if (!result)
        return {
          ok: false,
          errors: [{ field: '__root__', code: 'not_found', message: 'Position not found' }]
        }
      return { ok: true, ...result }
    } catch (err) {
      logger.error({ err }, 'positions_get_unhandled_error')
      return {
        ok: false,
        errors: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    }
  })
  ```
- Register `positions:close-csp` (same try/catch/ValidationError pattern as `positions:create`):
  - Parse `payload` with `CloseCspPayloadSchema.parse(payload)` before calling service.
  - Call `closeCspPosition(db, payload.positionId, payload)`.
  - Return `{ ok: true, ...result }` on success.

**Refactor — cleanup:**

- Extract the try/catch/ValidationError wrapper into a shared helper if three or more handlers repeat it. (At two it's tolerable; at three it warrants extraction.)

**Acceptance criteria covered:**

- (Wires area 5 to the renderer; all AC satisfied by the service layer.)

---

### 7. Preload + Renderer API adapter

**Files to create or modify:**

- `src/preload/index.ts` — add `getPosition` and `closePosition` to the `api` object
- `src/renderer/src/api/positions.ts` — add `PositionDetail`, `CloseCspPayload`, `CloseCspResponse` types and `getPosition()` / `closePosition()` functions

**Red — tests to write:**

- No unit tests for the thin adapter layer (tested via component/hook tests in area 9). Verify with `pnpm typecheck`.

**Green — implementation** (`src/preload/index.ts`):

```typescript
getPosition: (positionId: string) => ipcRenderer.invoke('positions:get', { positionId }),
closePosition: (payload: unknown) => ipcRenderer.invoke('positions:close-csp', payload)
```

**Green — implementation** (`src/renderer/src/api/positions.ts`):

- Add `PositionDetail` type matching `GetPositionResult` with snake_case fields.
- Add `CloseCspPayload` type: `{ position_id: string, close_price_per_contract: number, fill_date?: string }`.
- Add `CloseCspResponse` type: `{ position: { id, ticker, phase, status, closed_date }, leg: LegData & { fill_price: string }, cost_basis_snapshot: CostBasisSnapshotData & { final_pnl: string } }`.
- Add `IPC_TO_FORM_FIELD` entries: `closePricePerContract → close_price_per_contract`, `fillDate → fill_date`.
- Add `getPosition(positionId: string): Promise<PositionDetail>` — calls `window.api.getPosition(positionId)`, maps camelCase → snake_case, throws `apiError(404, ...)` if `!result.ok`.
- Add `closePosition(payload: CloseCspPayload): Promise<CloseCspResponse>` — translates snake_case → camelCase for IPC, handles `!result.ok` with `apiError(400, ...)`, maps response back to snake_case.

**Refactor — cleanup:**

- Check that `IPC_TO_FORM_FIELD` mapping covers all new validation error fields (`closePricePerContract`, `fillDate`).

**Acceptance criteria covered:**

- (Bridge layer; AC satisfied by service + frontend.)

---

### 8. Renderer hooks: `usePosition(id)` and `useClosePosition()`

**Files to create or modify:**

- `src/renderer/src/hooks/usePosition.ts` — new file
- `src/renderer/src/hooks/useClosePosition.ts` — new file

**Red — tests to write:**

- Hooks are exercised via component tests in area 9. No isolated hook unit tests (consistent with existing hooks pattern — `usePositions` and `useCreatePosition` have no separate unit tests).

**Green — implementation** (`usePosition.ts`):

```typescript
export function usePosition(id: string) {
  return useQuery<PositionDetail, ApiError>({
    queryKey: ['positions', id],
    queryFn: () => getPosition(id)
  })
}
```

**Green — implementation** (`useClosePosition.ts`):

```typescript
export function useClosePosition() {
  const queryClient = useQueryClient()
  return useMutation<CloseCspResponse, ApiError, CloseCspPayload>({
    mutationFn: closePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
    }
  })
}
```

**Refactor — cleanup:**

- Verify `queryKey` structure for `usePosition` (`['positions', id]`) is consistent with TanStack Query best practices and won't clash with `['positions']` list key.

**Acceptance criteria covered:**

- (Data plumbing; AC satisfied by the full close flow in area 9.)

---

### 9. Frontend: PositionDetailPage + CloseCspForm

**Files to create or modify:**

- `src/renderer/src/components/CloseCspForm.tsx` — new file
- `src/renderer/src/components/CloseCspForm.test.tsx` — new test file
- `src/renderer/src/pages/PositionDetailPage.tsx` — replace stub with real implementation
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — new test file (or add alongside existing if any)

**Red — tests to write** (`CloseCspForm.test.tsx`):

- Render `CloseCspForm` with props `openPremiumPerContract="2.50"`, `contracts={1}`, `expiration="2026-04-17"` — verify the form renders `close_price_per_contract` input and a submit button.
- Enter `close_price_per_contract = 1.00` → verify P&L preview shows "Net P&L: $1.50", "Total P&L: $150.00", "% Captured: 60%".
- Enter `close_price_per_contract = 3.50` → verify preview shows "Net P&L: -$1.00", "Total P&L: -$100.00", "% Captured: -40%".
- Submit with empty `close_price_per_contract` → verify client-side validation error displayed (no mutation called).
- Submit with `close_price_per_contract = 0` → verify client-side validation error.
- Mock `useClosePosition` mutation returning `isPending=true` → verify button shows loading state.
- Mock mutation returning a server validation error on `close_price_per_contract` → verify error displayed next to field.

**Red — tests to write** (`PositionDetailPage.test.tsx`):

- Mock `usePosition(id)` returning a CSP_OPEN position with an active leg → verify ticker, phase, strike, expiration, premium displayed, and `CloseCspForm` rendered.
- Mock `usePosition(id)` returning `isLoading=true` → verify loading spinner shown.
- Mock `usePosition(id)` returning `isError=true` → verify error message shown.
- Mock `usePosition(id)` returning a `CSP_CLOSED_PROFIT` position → verify `CloseCspForm` is NOT rendered.

**Green — implementation** (`CloseCspForm.tsx`):

- Accept props: `positionId: string`, `openPremiumPerContract: string`, `contracts: number`, `expiration: string`, `openFillDate: string`
- Zod schema (`closeCspSchema`):
  ```typescript
  z.object({
    close_price_per_contract: z.coerce
      .number()
      .positive({ message: 'Close price must be positive' }),
    fill_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
  })
  ```
- Form managed by React Hook Form + Zod resolver.
- Watch `close_price_per_contract` value to compute P&L preview:
  - `netPnlPerContract = parseFloat(openPremiumPerContract) - closePrice`
  - `totalPnl = netPnlPerContract * contracts * 100`
  - `pnlPct = (netPnlPerContract / parseFloat(openPremiumPerContract)) * 100`
  - Render in a preview panel; only show when `close_price_per_contract` is a valid positive number.
- On submit: call `closePosition({ position_id: positionId, close_price_per_contract, fill_date })`.
- On success: navigate to `/` (positions list) using `useLocation` from wouter.
- Map server errors from `useClosePosition` back to form fields using React Hook Form `setError`.

**Green — implementation** (`PositionDetailPage.tsx`):

- Call `usePosition(id)` from `useParams`.
- Loading state: spinner.
- Error state: error message.
- Data state:
  - Show ticker, phase badge, strike, expiration, DTE (if computable), premium collected, cost basis.
  - If `position.phase === 'CSP_OPEN'` and `activeLeg` is not null: render `<CloseCspForm>` with props from `activeLeg`.
  - If phase is not `CSP_OPEN`: show "Position is closed" or the closed phase badge.

**Refactor — cleanup:**

- Verify the P&L preview number formatting is consistent with the rest of the app (2 decimal places for display).
- Check that the `CloseCspForm` Zod schema reuses existing schema primitives (`positiveMoneySchema`, `isoDateSchema`) from `NewWheelForm.tsx` if they are exported — or inline them if not.
- Keep `PositionDetailPage.tsx` under ~200 lines; extract a `PositionDetailCard` if it grows.

**Acceptance criteria covered:**

- "P&L preview shows profit when closing below premium collected (60%)"
- "P&L preview for loss (-40%)"
- "Trader submitted a close → returned to position detail page (then redirected to list)"
- "Reject close with invalid fill date / price → validation error displayed"
