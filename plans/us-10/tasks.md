# US-10 — Record Shares Called Away — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — Foundation (no dependencies)

> All four areas can be started immediately and run in parallel.

### Area 1: LegAction Enum Extension

- [x] **[Red]** Write failing tests — `src/main/core/types.test.ts`
  - Test cases:
    - `LegAction.parse('EXERCISE')` succeeds without throwing
    - `LegAction.parse('INVALID')` throws a ZodError
  - Run `pnpm test src/main/core/types.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/types.ts` _(depends on: Area 1 Red ✓)_
  - Extend `LegAction` from `z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN'])` to `z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE'])`
  - Run `pnpm test src/main/core/types.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up — `src/main/core/types.ts` _(depends on: Area 1 Green ✓)_
  - Check for duplication and naming consistency
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 2: Core Lifecycle Engine — `recordCallAway()`

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts`
  - Test cases (`describe('recordCallAway')`):
    - `returns { phase: 'WHEEL_COMPLETE' } when currentPhase is CC_OPEN and fillDate equals ccOpenFillDate`
    - `throws ValidationError (invalid_phase) when currentPhase is HOLDING_SHARES` — field='**phase**', code='invalid_phase', message='No open covered call on this position'
    - `throws ValidationError (invalid_phase) when currentPhase is CSP_OPEN` — same shape
    - `throws ValidationError (multi_contract_unsupported) when contracts > 1` — field='contracts', code='multi_contract_unsupported', message='Multi-contract call-away is not yet supported'
    - `throws ValidationError (close_date_before_open) when fillDate is before ccOpenFillDate` — field='fillDate', code='close_date_before_open', message='Fill date cannot be before the CC open date'
    - `returns WHEEL_COMPLETE when fillDate is after ccOpenFillDate`
  - Run `pnpm test src/main/core/lifecycle.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Area 2 Red ✓)_
  - Add interfaces `RecordCallAwayInput` and `RecordCallAwayResult`
  - Add `export function recordCallAway(input: RecordCallAwayInput): RecordCallAwayResult`
  - Validate `currentPhase === 'CC_OPEN'` → throw `ValidationError('__phase__', 'invalid_phase', 'No open covered call on this position')`
  - Validate `input.contracts <= 1` → throw `ValidationError('contracts', 'multi_contract_unsupported', 'Multi-contract call-away is not yet supported')`
  - Validate `input.fillDate >= input.ccOpenFillDate` → throw `ValidationError('fillDate', 'close_date_before_open', 'Fill date cannot be before the CC open date')`
  - Return `{ phase: 'WHEEL_COMPLETE' }`
  - Run `pnpm test src/main/core/lifecycle.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up — `src/main/core/lifecycle.ts` _(depends on: Area 2 Green ✓)_
  - Ensure error messages exactly match strings in acceptance criteria and technical notes
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 3: Core Costbasis Engine — `calculateCallAway()`

- [x] **[Red]** Write failing tests — `src/main/core/costbasis.test.ts`
  - Test cases (`describe('calculateCallAway')`):
    - `returns +$780.00 when ccStrike=182, basisPerShare=174.20, contracts=1` — assert finalPnl === '780.0000'
    - `returns −$250.00 when ccStrike=174.00, basisPerShare=176.50, contracts=1` — assert finalPnl === '-250.0000'
    - `annualizedReturn is correct for 99 cycle days, $780 gain on $17420 capital` — assert annualizedReturn ≈ '16.5084' (formula: (780/17420)×(365/99)×100, ROUND_HALF_UP)
    - `annualizedReturn returns "0.0000" when cycleDays is 0` — guard against division by zero
    - `sets capitalDeployed correctly as basisPerShare × sharesHeld` — assert capitalDeployed === '17420.0000'
  - Run `pnpm test src/main/core/costbasis.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/costbasis.ts` _(depends on: Area 3 Red ✓)_
  - Add interfaces `CallAwayInput` and `CallAwayResult`
  - Add `export function calculateCallAway(input: CallAwayInput): CallAwayResult`
  - `sharesHeld = contracts × 100`
  - `finalPnl = round4((ccStrike − basisPerShare) × sharesHeld)`
  - `capitalDeployed = round4(basisPerShare × sharesHeld)`
  - `cycleDays` = calendar days from `positionOpenedDate` to `fillDate`
  - `annualizedReturn = cycleDays <= 0 ? '0.0000' : round4((finalPnl / capitalDeployed) × (365 / cycleDays) × 100)`
  - All math via `decimal.js` with `ROUND_HALF_UP`
  - Run `pnpm test src/main/core/costbasis.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up — `src/main/core/costbasis.ts` _(depends on: Area 3 Green ✓)_
  - Extract `cycleDays` calculation into a small helper if repeated elsewhere
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 4: Schemas + Response Types

- [x] **[Red]** Write failing tests — `src/main/schemas.test.ts`
  - Test cases:
    - `RecordCallAwayPayloadSchema.parse({ positionId: 'valid-uuid' })` succeeds
    - `RecordCallAwayPayloadSchema.parse({ positionId: 'not-a-uuid' })` throws ZodError with field `positionId`
    - `RecordCallAwayPayloadSchema.parse({})` throws ZodError with field `positionId`
  - Run `pnpm test src/main/schemas.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 4 Red ✓)_
  - Add `RecordCallAwayPayloadSchema = z.object({ positionId: z.string().uuid() })`
  - Add `RecordCallAwayPayload` type (inferred)
  - Add `RecordCallAwayResult` interface with `position`, `leg`, `costBasisSnapshot`, `finalPnl`, `cycleDays`, `annualizedReturn`, `basisPerShare`
  - Run `pnpm test src/main/schemas.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up — `src/main/schemas.ts` _(depends on: Area 4 Green ✓)_
  - Check for duplication and naming consistency with existing schemas
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service Layer (depends on Layer 1)

> Start after all Layer 1 Green tasks are complete.

### Area 5: Service Layer — `recordCallAwayPosition()`

**Requires:** Areas 1, 2, 3, 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/record-call-away-position.test.ts` _(depends on: Areas 1–4 Green ✓)_
  - Uses real in-memory SQLite DB (follow pattern of `close-covered-call-position.test.ts`)
  - Test cases:
    - `records CC_CLOSE (EXERCISE) leg with fill_price=ccStrike, fill_date=ccExpiration on valid CC_OPEN position` — assert legRole='CC_CLOSE', action='EXERCISE', fillPrice=ccStrike, fillDate=ccExpiration
    - `sets position phase=WHEEL_COMPLETE, status=CLOSED, closed_date=fill_date`
    - `creates cost_basis_snapshot with finalPnl set`
    - `returns finalPnl, cycleDays, annualizedReturn in result` — ccStrike=182, basis=174.20 → finalPnl=780
    - `throws ValidationError (invalid_phase) when position is in HOLDING_SHARES` — before any DB writes
    - `throws ValidationError (multi_contract_unsupported) when contracts=2`
    - `throws ValidationError (not_found) when positionId does not exist`
    - `throws ValidationError (no_cc_open_leg) when position is CC_OPEN but no CC_OPEN leg exists`
  - Run `pnpm test src/main/services/record-call-away-position.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/record-call-away-position.ts` _(depends on: Area 5 Red ✓)_
  - Imports: `Database`, `randomUUID`, `Decimal`, `calculateCallAway`, `recordCallAway`, `ValidationError`, `logger`, `RecordCallAwayPayload`, `RecordCallAwayResult`, `getPosition`
  - Derive `fillDate = ccOpenLeg.expiration`
  - Call `recordCallAway({ currentPhase, contracts, fillDate, ccOpenFillDate })`
  - Call `calculateCallAway({ ccStrike, basisPerShare, contracts, positionOpenedDate, fillDate })`
  - In `db.transaction()`:
    1. `INSERT INTO legs` — CC_CLOSE, EXERCISE, CALL, fill_price=ccStrike, fill_date=ccExpiration, premium_per_contract='0.0000'
    2. `UPDATE positions SET phase='WHEEL_COMPLETE', status='CLOSED', closed_date=fillDate, updated_at=now WHERE id=positionId`
    3. `INSERT INTO cost_basis_snapshots` — basisPerShare, totalPremiumCollected from existing snapshot, finalPnl from calculation
  - Log `logger.info({ positionId, phase: 'WHEEL_COMPLETE', finalPnl }, 'call_away_recorded')`
  - Return `RecordCallAwayResult`
  - Run `pnpm test src/main/services/record-call-away-position.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up — `src/main/services/record-call-away-position.ts` _(depends on: Area 5 Green ✓)_
  - Ensure `db.transaction()` is the exclusive DB-write boundary
  - Check for duplication with `closeCoveredCallPosition`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IPC + Preload/API (depends on Layer 2)

> Both areas can run in parallel after Area 5 Green is complete.

### Area 6: IPC Handler

**Requires:** Areas 4, 5 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/positions.test.ts` _(depends on: Areas 4, 5 Green ✓)_
  - Following the `close-cc-early` test pattern:
    - `registers a positions:record-call-away handler` — assert `ipcMain.handle` called with channel name
    - `returns ok:true with WHEEL_COMPLETE position and finalPnl for valid positionId` — mock returns fixture; assert `ok: true`, `position.phase === 'WHEEL_COMPLETE'`, `finalPnl`
    - `returns ok:false when positionId is not a UUID` — assert `ok: false`, errors contain `positionId` field
    - `returns ok:false for invalid_phase (not in CC_OPEN)` — mock throws `ValidationError('__phase__', 'invalid_phase', ...)`
    - `returns ok:false for multi_contract_unsupported` — mock throws `ValidationError('contracts', 'multi_contract_unsupported', ...)`
  - Run `pnpm test src/main/ipc/positions.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/positions.ts` _(depends on: Area 6 Red ✓)_
  - Import `RecordCallAwayPayloadSchema` from `'../schemas'`
  - Import `recordCallAwayPosition` from `'../services/record-call-away-position'`
  - Add inside `registerPositionsHandlers`:
    ```ts
    ipcMain.handle('positions:record-call-away', (_, payload: unknown) =>
      handleIpcCall('positions_record_call_away_unhandled_error', () => {
        const parsed = RecordCallAwayPayloadSchema.parse(payload)
        return recordCallAwayPosition(db, parsed.positionId, parsed)
      })
    )
    ```
  - Run `pnpm test src/main/ipc/positions.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up — `src/main/ipc/positions.ts` _(depends on: Area 6 Green ✓)_
  - Check for duplication and naming consistency
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

### Area 7: Preload + API Adapter

**Requires:** Areas 4, 5 Green ✓

- [x] **[Green]** Implement — `src/preload/index.ts` + `src/renderer/src/api/positions.ts` _(depends on: Areas 4, 5 Green ✓)_
  - No dedicated unit test (consistent with existing adapters like `openCoveredCall`, `closeCoveredCallEarly`)
  - In `src/preload/index.ts`, add to `api`:
    ```ts
    recordCallAway: (payload: unknown) => ipcRenderer.invoke('positions:record-call-away', payload)
    ```
  - In `src/renderer/src/api/positions.ts`, add:
    - `RecordCallAwayPayload` type (`{ position_id: string }`)
    - `RecordCallAwayResponse` type (full shape per contract)
    - `export async function recordCallAway(payload: RecordCallAwayPayload): Promise<RecordCallAwayResponse>`
  - Run `pnpm test && pnpm typecheck`
- [x] **[Refactor]** Clean up _(depends on: Area 7 Green ✓)_
  - Check for duplication and naming consistency with existing adapters
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — React Hook (depends on Layer 3)

> Start after Area 7 Green is complete.

### Area 8: React Hook — `useRecordCallAway`

**Requires:** Area 7 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/hooks/useRecordCallAway.test.ts` _(depends on: Area 7 Green ✓)_
  - Following `useCloseCoveredCallEarly.test.ts` pattern:
    - `calls recordCallAway with positionId and invokes onSuccess with response data` — mock `recordCallAway` API; render hook; call mutate; assert onSuccess called with response
    - `invalidates positionQueryKeys.all on success` — assert `queryClient.invalidateQueries` called with `{ queryKey: positionQueryKeys.all }`
  - Run `pnpm test src/renderer/src/hooks/useRecordCallAway.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/hooks/useRecordCallAway.ts` _(depends on: Area 8 Red ✓)_
  - `useMutation` wrapping `recordCallAway` with `onSuccess` that invalidates `positionQueryKeys.all` and calls `options?.onSuccess?.(data)`
  - Run `pnpm test src/renderer/src/hooks/useRecordCallAway.test.ts` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 8 Green ✓)_
  - Check for duplication with `useCloseCoveredCallEarly`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Frontend Components (depends on Layer 4)

> Start after Area 8 Green is complete.

### Area 9: `CallAwaySheet`, `CallAwayForm`, `CallAwaySuccess`

**Requires:** Areas 7, 8 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/CallAwaySheet.test.tsx` _(depends on: Areas 7, 8 Green ✓)_
  - Test cases:
    - `renders null when open=false` — assert container not in DOM
    - `renders "Record Call-Away" header and P&L waterfall when open=true` — assert "Record Call-Away", "Shares Called Away", "P&L Breakdown", CC strike value, cost basis value, final P&L value
    - `shows irrevocable warning text "This cannot be undone."`
    - `transitions to success state after successful mutation` — mock `useRecordCallAway` onSuccess; click "Confirm Call-Away"; assert "WHEEL COMPLETE" visible
    - `calls onClose when Cancel is clicked`
    - `success state shows WHEEL COMPLETE, finalPnl, cycleDays, annualizedReturn, Start New Wheel button`
    - `P&L is displayed in red (negative color) when finalPnl is negative`
  - Run `pnpm test src/renderer/src/components/CallAwaySheet.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `CallAwayForm.tsx` + `CallAwaySuccess.tsx` + `CallAwaySheet.tsx` _(depends on: Area 9 Red ✓)_
  - **`CallAwayForm.tsx`**: confirmation screen with P&L waterfall, read-only fill date field, irrevocable warning, Cancel + Confirm footer
  - **`CallAwaySuccess.tsx`**: hero card with "WHEEL COMPLETE" heading, cycle summary table, "Start New Wheel" CTA
  - **`CallAwaySheet.tsx`**: `createPortal` container, state machine (`successState: RecordCallAwayResponse | null`), renders form or success screen, uses `useRecordCallAway`
  - Add `data-testid` attributes: `record-call-away-btn`, `call-away-submit`
  - Run `pnpm test src/renderer/src/components/CallAwaySheet.test.tsx` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 9 Green ✓)_
  - Verify P&L sign rendering: negative finalPnl shows red (`var(--wb-red)`)
  - Ensure `pnlColor` utility from `lib/format` used consistently
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Wire-Up (depends on Layer 5)

> Start after Area 9 Green is complete.

### Area 10: `PositionDetailActions` + `PositionDetailPage`

**Requires:** Area 9 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PositionDetailActions.test.tsx` _(depends on: Area 9 Green ✓)_
  - Test cases:
    - `renders "Record Call-Away →" button when phase is CC_OPEN` — assert `data-testid="record-call-away-btn"` visible
    - `does not render "Record Call-Away →" button when phase is HOLDING_SHARES`
    - `calls onRecordCallAway when the button is clicked`
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — all new tests must fail
- [x] **[Green]** Implement — `PositionDetailActions.tsx` + `PositionDetailPage.tsx` _(depends on: Area 10 Red ✓)_
  - **`PositionDetailActions.tsx`**: add `onRecordCallAway: () => void` prop; add `data-testid="record-call-away-btn"` button with `wb-teal-button` class in `CC_OPEN` block
  - **`PositionDetailPage.tsx`**:
    - Add `callAwayCtx` state: `{ ccStrike; ccExpiration; contracts; basisPerShare; positionOpenedDate } | null`
    - Add `handleRecordCallAway` callback finding `activeCcLeg` and snapshot, setting `callAwayCtx`
    - Pass `onRecordCallAway={handleRecordCallAway}` to `<PositionDetailActions>`
    - Add `callAwayCtx` to the blur condition
    - Render `<CallAwaySheet open={Boolean(callAwayCtx)} ... onClose={handleCloseCallAway} />`
  - Run `pnpm test src/renderer/src/components/PositionDetailActions.test.tsx` — all tests must pass
- [x] **[Refactor]** Clean up _(depends on: Area 10 Green ✓)_
  - Verify blur/overlay conditions include `callAwayCtx`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests (depends on all previous layers)

**Requires:** All Green tasks from Layers 1–6 ✓

### E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/call-away.spec.ts` _(depends on: all Green tasks ✓)_
  - One `it()` per AC — test names must mirror AC language
  - AC coverage:
    - AC-1: successfully record shares called away → `it('successfully records shares called away — position transitions to WHEEL_COMPLETE with +$780.00 P&L')`
    - AC-2: called-away below cost basis shows a loss → `it('called-away below cost basis shows a loss — P&L is −$250.00 displayed in red')`
    - AC-3: P&L breakdown shown on form before submission → `it('P&L breakdown waterfall is shown on the confirmation form before submission')`
    - AC-4: reject call-away when not in CC_OPEN phase → `it('Record Call-Away button is not visible when position is not in CC_OPEN phase')`
    - AC-5: fill date derived and displayed read-only → `it('fill date is derived from CC expiration and displayed as read-only')`
    - AC-6: success state shows complete wheel summary → `it('success state shows WHEEL COMPLETE, cycle P&L, cycle duration, annualized return, and Start New Wheel CTA')`
  - Use `reachCcOpenState()` helper (inline or from `e2e/helpers.ts`)
  - Selectors: `[data-testid="record-call-away-btn"]`, `text=Record Call-Away`, `[data-testid="call-away-submit"]`, `text=WHEEL COMPLETE`
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Add any missing `data-testid` attributes to components
  - Extract shared `reachCcOpenState()` helper to `e2e/helpers.ts` if not already done
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** Clean up e2e tests _(depends on: E2E Green ✓)_
  - Consolidate helpers; remove duplication with `close-cc-early.spec.ts`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (AC-1 through AC-6)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
