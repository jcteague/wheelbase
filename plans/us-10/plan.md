# Implementation Plan: US-10 — Record Shares Called Away

## Summary

Implements the "shares called away" action that completes the wheel cycle. When a trader's covered call is exercised at expiration, this records a `CC_CLOSE` (EXERCISE) leg, transitions the position to `WHEEL_COMPLETE / CLOSED`, and computes the final P&L as `(ccStrike − basisPerShare) × sharesHeld`. The feature adds a "Record Call-Away →" button to the `CC_OPEN` position detail header and presents a right-side sheet with a P&L waterfall confirmation screen followed by a "WHEEL COMPLETE" success summary.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/02-stories/US-10-record-shares-called-away.md`
- **Research & Design Decisions:** `plans/us-10/research.md`
- **Data Model & Selection Logic:** `plans/us-10/data-model.md`
- **API Contract:** `plans/us-10/contracts/positions-record-call-away.md`
- **Quickstart & Verification:** `plans/us-10/quickstart.md`

## Prerequisites

- US-7 complete: positions can reach `CC_OPEN` phase with a valid `CC_OPEN` leg.
- `src/main/core/lifecycle.ts` contains `closeCoveredCall()` — the new `recordCallAway()` function follows the same pure-function pattern.
- `src/main/core/costbasis.ts` contains `calculateCcClose()` — the new `calculateCallAway()` function adds call-away P&L math.
- `src/main/services/close-covered-call-position.ts` — the new `recordCallAwayPosition` service follows this pattern exactly.
- `src/renderer/src/components/CloseCcEarlySheet.tsx` — the new `CallAwaySheet` follows this component pattern.

---

## Implementation Areas

### 1. `LegAction` Enum Extension

**Files to create or modify:**
- `src/main/core/types.ts` — add `'EXERCISE'` to the `LegAction` z.enum

**Red — tests to write:**
- In `src/main/core/types.test.ts` (create if not present): assert `LegAction.parse('EXERCISE')` succeeds without throwing.
- Assert `LegAction.parse('INVALID')` throws a ZodError.

**Green — implementation:**
- In `src/main/core/types.ts`, extend `LegAction` from `z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN'])` to `z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE'])`.

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency.

**Acceptance criteria covered:**
- Supports the `LegAction: EXERCISE` requirement from Technical Notes ("LegRole: CC_CLOSE, LegAction: EXERCISE").

---

### 2. Core Lifecycle Engine — `recordCallAway()`

**Files to create or modify:**
- `src/main/core/lifecycle.ts` — add `RecordCallAwayInput`, `RecordCallAwayResult` interfaces and `recordCallAway()` function
- `src/main/core/lifecycle.test.ts` — new describe block

**Red — tests to write:**
- In `src/main/core/lifecycle.test.ts`, `describe('recordCallAway')`:
  - `returns { phase: 'WHEEL_COMPLETE' } when currentPhase is CC_OPEN and fillDate equals ccOpenFillDate` — assert result.phase === 'WHEEL_COMPLETE'
  - `throws ValidationError (invalid_phase) when currentPhase is HOLDING_SHARES` — assert ValidationError with field='__phase__', code='invalid_phase', message='No open covered call on this position'
  - `throws ValidationError (invalid_phase) when currentPhase is CSP_OPEN` — same shape
  - `throws ValidationError (multi_contract_unsupported) when contracts > 1` — assert field='contracts', code='multi_contract_unsupported', message='Multi-contract call-away is not yet supported'
  - `throws ValidationError (close_date_before_open) when fillDate is before ccOpenFillDate` — assert field='fillDate', code='close_date_before_open', message='Fill date cannot be before the CC open date'
  - `returns WHEEL_COMPLETE when fillDate is after ccOpenFillDate` — happy path with future fill date

**Green — implementation:**
- In `src/main/core/lifecycle.ts`, add:
  ```ts
  export interface RecordCallAwayInput {
    currentPhase: WheelPhase
    contracts: number
    fillDate: string         // CC_OPEN leg expiration (derived by service)
    ccOpenFillDate: string   // CC_OPEN leg fill_date
  }
  export interface RecordCallAwayResult { phase: 'WHEEL_COMPLETE' }

  export function recordCallAway(input: RecordCallAwayInput): RecordCallAwayResult
  ```
- Validate `currentPhase === 'CC_OPEN'` → throw `ValidationError('__phase__', 'invalid_phase', 'No open covered call on this position')`
- Validate `input.contracts <= 1` → throw `ValidationError('contracts', 'multi_contract_unsupported', 'Multi-contract call-away is not yet supported')`
- Validate `input.fillDate >= input.ccOpenFillDate` → throw `ValidationError('fillDate', 'close_date_before_open', 'Fill date cannot be before the CC open date')`
- Return `{ phase: 'WHEEL_COMPLETE' }`

**Refactor — cleanup to consider:**
- Ensure error messages exactly match strings in acceptance criteria and technical notes.

**Acceptance criteria covered:**
- "Reject call-away when not in CC_OPEN phase" → `invalid_phase` error
- "Reject fill date before CC open date" → `close_date_before_open` error
- Multi-contract guard from Technical Notes

---

### 3. Core Costbasis Engine — `calculateCallAway()`

**Files to create or modify:**
- `src/main/core/costbasis.ts` — add `CallAwayInput`, `CallAwayResult` interfaces and `calculateCallAway()` function
- `src/main/core/costbasis.test.ts` — new describe block

**Red — tests to write:**
- In `src/main/core/costbasis.test.ts`, `describe('calculateCallAway')`:
  - `returns +$780.00 when ccStrike=182, basisPerShare=174.20, contracts=1` — assert finalPnl === '780.0000'
  - `returns −$250.00 when ccStrike=174.00, basisPerShare=176.50, contracts=1` — assert finalPnl === '-250.0000'
  - `annualizedReturn is correct for 99 cycle days, $780 gain on $17420 capital` — assert annualizedReturn ≈ '16.7500' (verify formula: (780/17420)×(365/99)×100)
  - `annualizedReturn returns "0.0000" when cycleDays is 0` — guard against division by zero
  - `sets capitalDeployed correctly as basisPerShare × sharesHeld` — assert capitalDeployed === '17420.0000'

**Green — implementation:**
- In `src/main/core/costbasis.ts`, add:
  ```ts
  export interface CallAwayInput {
    ccStrike: string         // from CC_OPEN leg
    basisPerShare: string    // from latest cost_basis_snapshot
    contracts: number        // from CC_OPEN leg
    positionOpenedDate: string  // position.openedDate
    fillDate: string            // CC expiration date
  }
  export interface CallAwayResult {
    finalPnl: string          // 4 dp, signed
    sharesHeld: number        // contracts × 100
    capitalDeployed: string   // basisPerShare × sharesHeld, 4 dp
    cycleDays: number
    annualizedReturn: string  // 4 dp; "0.0000" if cycleDays <= 0
  }

  export function calculateCallAway(input: CallAwayInput): CallAwayResult
  ```
- `sharesHeld = contracts × 100`
- `finalPnl = round4((ccStrike − basisPerShare) × sharesHeld)`
- `capitalDeployed = round4(basisPerShare × sharesHeld)`
- `cycleDays` = days from `positionOpenedDate` to `fillDate` (inclusive endpoint: `fillDate - openedDate` in calendar days)
- `annualizedReturn = cycleDays <= 0 ? '0.0000' : round4((finalPnl / capitalDeployed) × (365 / cycleDays) × 100)`
- All math via `decimal.js` with `ROUND_HALF_UP`.

**Refactor — cleanup to consider:**
- Extract `cycleDays` calculation into a small helper if repeated elsewhere. Check for duplication.

**Acceptance criteria covered:**
- "final P&L shows +$780.00" (AC 1)
- "final P&L shows −$250.00" (AC 2)
- "annualized return percentage is displayed" (AC 6)
- "cycle duration in calendar days" (AC 6)

---

### 4. Schemas + Response Types

**Files to create or modify:**
- `src/main/schemas.ts` — add `RecordCallAwayPayloadSchema`, `RecordCallAwayPayload` type, `RecordCallAwayResult` interface

**Red — tests to write:**
- In `src/main/schemas.test.ts` (or at top of IPC handler test): `RecordCallAwayPayloadSchema.parse({ positionId: 'valid-uuid' })` succeeds.
- `RecordCallAwayPayloadSchema.parse({ positionId: 'not-a-uuid' })` throws ZodError with field `positionId`.
- `RecordCallAwayPayloadSchema.parse({})` throws ZodError with field `positionId`.

**Green — implementation:**
- In `src/main/schemas.ts`, add after the `CloseCcPayloadSchema` section:
  ```ts
  export const RecordCallAwayPayloadSchema = z.object({
    positionId: z.string().uuid()
  })
  export type RecordCallAwayPayload = z.infer<typeof RecordCallAwayPayloadSchema>

  export interface RecordCallAwayResult {
    position: {
      id: string
      ticker: string
      phase: 'WHEEL_COMPLETE'
      status: 'CLOSED'
      closedDate: string
    }
    leg: LegRecord
    costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
    finalPnl: string
    cycleDays: number
    annualizedReturn: string
    basisPerShare: string
  }
  ```

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency with existing schemas.

**Acceptance criteria covered:**
- Enables IPC payload validation for all call-away requests.

---

### 5. Service Layer — `recordCallAwayPosition()`

**Files to create or modify:**
- `src/main/services/record-call-away-position.ts` — new file
- `src/main/services/record-call-away-position.test.ts` — new test file

**Red — tests to write:**
- In `src/main/services/record-call-away-position.test.ts` (uses a real in-memory SQLite DB, following the pattern of `close-covered-call-position.test.ts`):
  - `records CC_CLOSE (EXERCISE) leg with fill_price=ccStrike, fill_date=ccExpiration on valid CC_OPEN position` — assert leg in DB has legRole='CC_CLOSE', action='EXERCISE', fillPrice=ccStrike, fillDate=ccExpiration
  - `sets position phase=WHEEL_COMPLETE, status=CLOSED, closed_date=fill_date` — assert position row updated
  - `creates cost_basis_snapshot with finalPnl set` — assert snapshot row with finalPnl != null
  - `returns finalPnl, cycleDays, annualizedReturn in result` — assert result has expected values (ccStrike=182, basis=174.20 → finalPnl=780)
  - `throws ValidationError (invalid_phase) when position is in HOLDING_SHARES` — assert ValidationError thrown before DB writes
  - `throws ValidationError (multi_contract_unsupported) when contracts=2` — assert ValidationError
  - `throws ValidationError (not_found) when positionId does not exist` — assert ValidationError with code='not_found'
  - `throws ValidationError (no_cc_open_leg) when position is CC_OPEN but no CC_OPEN leg exists` — edge case guard

**Green — implementation:**
- `src/main/services/record-call-away-position.ts`:
  - Import: `Database`, `randomUUID`, `Decimal`, `calculateCallAway` (costbasis), `recordCallAway` (lifecycle), `ValidationError`, `logger`, `RecordCallAwayPayload`, `RecordCallAwayResult`, `getPosition`
  - Derive `fillDate = ccOpenLeg.expiration`
  - Call `recordCallAway({ currentPhase, contracts: ccOpenLeg.contracts, fillDate, ccOpenFillDate: ccOpenLeg.fillDate })`
  - Call `calculateCallAway({ ccStrike: ccOpenLeg.strike, basisPerShare: snapshot.basisPerShare, contracts: ccOpenLeg.contracts, positionOpenedDate: position.openedDate, fillDate })`
  - In a `db.transaction()`:
    1. `INSERT INTO legs` — CC_CLOSE, EXERCISE, CALL, fill_price=ccStrike, fill_date=ccExpiration
    2. `UPDATE positions SET phase='WHEEL_COMPLETE', status='CLOSED', closed_date=fillDate, updated_at=now WHERE id=positionId`
    3. `INSERT INTO cost_basis_snapshots` — basisPerShare, totalPremiumCollected from existing snapshot, finalPnl from calculation
  - Log `logger.info({ positionId, phase: 'WHEEL_COMPLETE', finalPnl }, 'call_away_recorded')`
  - Return `RecordCallAwayResult` with position, leg, costBasisSnapshot, finalPnl, cycleDays, annualizedReturn, basisPerShare

**Refactor — cleanup to consider:**
- Ensure `db.transaction()` is the exclusive DB-write boundary. Check for duplication with `closeCoveredCallPosition`.

**Acceptance criteria covered:**
- AC 1: "position phase changes to WHEEL_COMPLETE, status changes to CLOSED, CC_CLOSE leg recorded, final P&L shows +$780.00"
- AC 2: "called-away below cost basis shows a loss"
- AC 4: "reject call-away when not in CC_OPEN phase"
- AC 5: "reject fill date before CC open date"

---

### 6. IPC Handler

**Files to create or modify:**
- `src/main/ipc/positions.ts` — add `positions:record-call-away` handler registration; import `recordCallAwayPosition` and `RecordCallAwayPayloadSchema`
- `src/main/ipc/positions.test.ts` — add test cases for the new channel

**Red — tests to write:**
- In `src/main/ipc/positions.test.ts`, following the `close-cc-early` test pattern:
  - `registers a positions:record-call-away handler` — assert `ipcMain.handle` called with channel name
  - `positions:record-call-away returns ok:true with WHEEL_COMPLETE position and finalPnl for valid positionId` — mock `recordCallAwayPosition` to return fixture; assert result has `ok: true`, `position.phase === 'WHEEL_COMPLETE'`, `finalPnl`
  - `positions:record-call-away returns ok:false when positionId is not a UUID` — assert `ok: false`, errors contain `positionId` field
  - `positions:record-call-away returns ok:false for invalid_phase (not in CC_OPEN)` — mock `recordCallAwayPosition` to throw `ValidationError('__phase__', 'invalid_phase', ...)`, assert `ok: false`
  - `positions:record-call-away returns ok:false for multi_contract_unsupported` — mock throws `ValidationError('contracts', 'multi_contract_unsupported', ...)`

**Green — implementation:**
- In `src/main/ipc/positions.ts`:
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

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency.

**Acceptance criteria covered:**
- IPC surface is the gateway for all call-away AC validation.

---

### 7. Preload + API Adapter

**Files to create or modify:**
- `src/preload/index.ts` — add `recordCallAway` to the `api` object
- `src/renderer/src/api/positions.ts` — add `RecordCallAwayPayload`, `RecordCallAwayResponse` types and `recordCallAway()` async function

**Red — tests to write:**
- No dedicated unit test for the API adapter (consistent with existing adapters like `openCoveredCall`, `closeCoveredCallEarly`). IPC round-trip is covered by service tests and E2E.

**Green — implementation:**
- In `src/preload/index.ts`, add to `api`:
  ```ts
  recordCallAway: (payload: unknown) =>
    ipcRenderer.invoke('positions:record-call-away', payload)
  ```
- In `src/renderer/src/api/positions.ts`, add:
  ```ts
  export type RecordCallAwayPayload = {
    position_id: string
  }

  export type RecordCallAwayResponse = {
    position: {
      id: string
      ticker: string
      phase: 'WHEEL_COMPLETE'
      status: 'CLOSED'
      closedDate: string
    }
    leg: LegData & {
      positionId: string
      legRole: string
      action: string
      instrumentType: string
      premiumPerContract: string
      fillPrice: string
      fillDate: string
      createdAt: string
      updatedAt: string
    }
    costBasisSnapshot: ClosedSnapshotData
    finalPnl: string
    cycleDays: number
    annualizedReturn: string
    basisPerShare: string
  }

  export async function recordCallAway(payload: RecordCallAwayPayload): Promise<RecordCallAwayResponse> {
    const result = await window.api.recordCallAway({
      positionId: payload.position_id
    })
    if (!result.ok) {
      throw apiError(400, { detail: mapIpcErrors(result.errors) })
    }
    return result as unknown as RecordCallAwayResponse
  }
  ```
- Add `'__phase__' | 'contracts'` to `IPC_TO_FORM_FIELD` mapping if needed (or leave as-is since those map to themselves).

**Refactor — cleanup to consider:**
- Check for duplication and naming consistency with existing adapters.

**Acceptance criteria covered:**
- Bridges all renderer AC scenarios to the IPC layer.

---

### 8. React Hook — `useRecordCallAway`

**Files to create or modify:**
- `src/renderer/src/hooks/useRecordCallAway.ts` — new file
- `src/renderer/src/hooks/useRecordCallAway.test.ts` — new test file

**Red — tests to write:**
- In `src/renderer/src/hooks/useRecordCallAway.test.ts`, following the `useCloseCoveredCallEarly.test.ts` pattern:
  - `calls recordCallAway with positionId and invokes onSuccess with response data` — mock `recordCallAway` API function; render hook; call mutate; assert onSuccess called with response
  - `invalidates positionQueryKeys.all on success` — assert `queryClient.invalidateQueries` called with `{ queryKey: positionQueryKeys.all }`

**Green — implementation:**
- `src/renderer/src/hooks/useRecordCallAway.ts`:
  ```ts
  import { useMutation, useQueryClient } from '@tanstack/react-query'
  import type { ApiError, RecordCallAwayPayload, RecordCallAwayResponse } from '../api/positions'
  import { recordCallAway } from '../api/positions'
  import { positionQueryKeys } from './positionQueryKeys'

  export function useRecordCallAway(options?: {
    onSuccess?: (data: RecordCallAwayResponse) => void
  }): ReturnType<typeof useMutation<RecordCallAwayResponse, ApiError, RecordCallAwayPayload>> {
    const queryClient = useQueryClient()
    return useMutation<RecordCallAwayResponse, ApiError, RecordCallAwayPayload>({
      mutationFn: recordCallAway,
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
        options?.onSuccess?.(data)
      }
    })
  }
  ```

**Refactor — cleanup to consider:**
- Check for duplication with `useCloseCoveredCallEarly`.

**Acceptance criteria covered:**
- Provides the mutation hook used by the sheet component.

---

### 9. Frontend — `CallAwaySheet`, `CallAwayForm`, `CallAwaySuccess`

**Files to create or modify:**
- `src/renderer/src/components/CallAwaySheet.tsx` — new file: sheet container (createPortal, state machine: confirmation → success)
- `src/renderer/src/components/CallAwayForm.tsx` — new file: confirmation screen with P&L waterfall
- `src/renderer/src/components/CallAwaySuccess.tsx` — new file: success "WHEEL COMPLETE" screen
- `src/renderer/src/components/CallAwaySheet.test.tsx` — new test file

**Red — tests to write:**
- In `src/renderer/src/components/CallAwaySheet.test.tsx`:
  - `renders null when open=false` — assert container not in DOM
  - `renders "Record Call-Away" header and P&L waterfall when open=true` — assert text "Record Call-Away", "Shares Called Away", "P&L Breakdown", CC strike value, cost basis value, final P&L value
  - `shows irrevocable warning text "This cannot be undone."` — assert AlertBox warning text
  - `transitions to success state after successful mutation` — mock `useRecordCallAway`'s onSuccess; trigger click on "Confirm Call-Away"; assert "WHEEL COMPLETE" text visible
  - `calls onClose when Cancel is clicked` — assert onClose called
  - `success state shows WHEEL COMPLETE, finalPnl, cycleDays, annualizedReturn, Start New Wheel button` — assert success screen content
  - `P&L is displayed in red (negative color) when finalPnl is negative` — assert red color class/style on negative P&L value

**Green — implementation:**

**`CallAwayForm.tsx`** (Confirmation screen):
- Sheet header: `<Caption>Record Call-Away</Caption>`, title "Shares Called Away", subtitle `CALL $${strike} · ${expiration}`
- Close (×) button in header
- `<SectionCard>` with:
  - Position summary rows: ticker + CC strike + expiration, contracts, "Shares to deliver" (sharesHeld), phase transition badge (`CC_OPEN → WHEEL_COMPLETE`)
  - **P&L Waterfall subsection** (nested div inside SectionCard, matching mockup exactly):
    - Caption "P&L Breakdown"
    - Row: "CC strike (shares delivered)" → `$${ccStrike}` (white)
    - Row: "− Effective cost basis" → `$${basisPerShare}` (red: `var(--wb-red)`)
    - Row (indented): "= Appreciation per share" → `$${appreciationPerShare}` (muted)
    - Row (indented): `× ${sharesHeld} shares` → `$${appreciationTotal}` (green if positive)
    - Total row: "= Final cycle P&L" → `+$${finalPnl}` or `-$${|finalPnl|}` (green if positive, red if negative, `font-size: 16, fontWeight: 700`)
  - Cost basis summary row: `$${basisPerShare}/share · $${capitalDeployed} total`
- **Fill Date** read-only field: `<MockReadOnlyField label="Fill Date" value={ccExpiration} hint="Derived from your CC — the day shares are delivered to the buyer" />` — uses existing UI primitives (`FormField` + `Input readOnly`), with "auto" label
- **Irrevocable warning**: `<AlertBox variant="warning"><strong>This cannot be undone.</strong> The position will close as WHEEL_COMPLETE. Full leg history is preserved.</AlertBox>`
- Footer: `<Button variant="outline" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>` + `<FormButton label="Confirm Call-Away" pendingLabel="Confirming…" isPending={isPending} style={{ flex: 1 }} />`

**`CallAwaySuccess.tsx`** (Success screen):
- Header: Caption "Wheel Complete" (green), title "AAPL Cycle Closed", subtitle `CALL $${strike} · ${expiration}`, close (×) button
- **Hero card** (gradient green background):
  - Caption "Wheel Complete" (green, small)
  - "WHEEL COMPLETE" heading (large, bold, white)
  - Subtitle: `${ticker} · ${sharesHeld} shares called away at $${ccStrike}`
  - Inline P&L box: caption "Final Cycle P&L", value `+$${finalPnl}` (30px, green) or `-$${|finalPnl|}` (red), note "total realized gain"
- **Cycle Summary** `<SectionCard header="Cycle Summary">`:
  - Row: "Leg recorded" → `cc_close · ${fillDate}` (green)
  - Row: "Phase" → `<PhaseBadge phase="CC_OPEN" /> → <PhaseBadge phase="WHEEL_COMPLETE" />`
  - Row: "Shares delivered" → `${sharesHeld} @ $${ccStrike}`
  - Row: "Cycle duration" → `${cycleDays} days`
  - Row: "Annualized return" → `~${annualizedReturn}%` (green)
  - Highlighted row: "Final cycle P&L" → `+$${finalPnl}` (14px, bold, green or red)
- **"What's next?"** section:
  - `<FormButton label={`Start New Wheel on ${ticker} →`} style={{ width: '100%' }} onClick={() => { window.location.hash = '#/new?ticker=' + ticker; onClose() }}>`
  - "View full position history" text link (onClick → onClose)

**`CallAwaySheet.tsx`** (Container):
- Follows `CloseCcEarlySheet` pattern exactly: `createPortal`, scrim div, 400px right-side panel
- Props: `open`, `positionId`, `ticker`, `ccStrike`, `ccExpiration`, `contracts`, `basisPerShare`, `positionOpenedDate`, `onClose`
- Derive: `sharesHeld = contracts × 100`, `appreciationPerShare = ccStrike − basisPerShare`, `appreciationTotal = appreciationPerShare × sharesHeld`, `finalPnl = appreciationTotal`, `capitalDeployed = basisPerShare × sharesHeld`
- State: `successState: RecordCallAwayResponse | null`
- Use `useRecordCallAway({ onSuccess: setSuccessState })`
- On "Confirm Call-Away" click: call `mutate({ position_id: positionId })`
- Returns null if `!open`
- Renders `<CallAwaySuccess>` when `successState` is set, else `<CallAwayForm>`

**Refactor — cleanup to consider:**
- Verify P&L sign rendering: negative finalPnl (loss scenario) should show red color. Ensure `pnlColor` utility from `lib/format` is used consistently.
- Ensure `appreciationPerShare` can be negative and is styled correctly.

**Acceptance criteria covered:**
- AC 2: "P&L is displayed in red" when loss
- AC 3: "P&L breakdown shown on the form before submission" (waterfall)
- AC 6: "success screen shows WHEEL COMPLETE, total cycle P&L, cycle duration, annualized return, Start New Wheel CTA"

---

### 10. Wire-Up: `PositionDetailActions` + `PositionDetailPage`

**Files to create or modify:**
- `src/renderer/src/components/PositionDetailActions.tsx` — add `onRecordCallAway` prop and "Record Call-Away →" button for `CC_OPEN` phase
- `src/renderer/src/components/PositionDetailActions.test.tsx` — add test case for call-away button visibility
- `src/renderer/src/pages/PositionDetailPage.tsx` — add `callAwayCtx` state, `handleRecordCallAway` callback, `<CallAwaySheet>` render

**Red — tests to write:**
- In `src/renderer/src/components/PositionDetailActions.test.tsx`:
  - `renders "Record Call-Away →" button when phase is CC_OPEN` — assert `data-testid="record-call-away-btn"` visible
  - `does not render "Record Call-Away →" button when phase is HOLDING_SHARES` — assert button absent
  - `calls onRecordCallAway when the button is clicked` — assert callback called

**Green — implementation:**
- In `PositionDetailActions.tsx`:
  - Add `onRecordCallAway: () => void` to `PositionDetailActionsProps`
  - In the `phase === 'CC_OPEN'` block, add alongside the existing "Close CC Early →" button:
    ```tsx
    <button
      data-testid="record-call-away-btn"
      className="wb-teal-button"
      onClick={onRecordCallAway}
      style={actionButtonStyle}
    >
      Record Call-Away →
    </button>
    ```
  - The mockup background also shows a "Record Expiry →" button — this is for the CC expiry path (future story). Add it as a stub for now if an `onRecordExpiry` prop is being passed, otherwise add as a no-op for this story if needed for the mockup. **Only add if it doesn't break existing tests.**

- In `PositionDetailPage.tsx`:
  - Add `callAwayCtx` state: `{ ccStrike: string; ccExpiration: string; contracts: number; basisPerShare: string; positionOpenedDate: string } | null`
  - Add `handleRecordCallAway` callback: finds `activeCcLeg` and `snapshot`, sets `callAwayCtx`
  - Add `handleCloseCallAway = useCallback(() => setCallAwayCtx(null), [])`
  - Pass `onRecordCallAway={handleRecordCallAway}` to `<PositionDetailActions>`
  - Add `callAwayCtx` to the blur condition: `|| callAwayCtx`
  - Render `<CallAwaySheet open={Boolean(callAwayCtx)} ... onClose={handleCloseCallAway} />` after the existing sheets

**Refactor — cleanup to consider:**
- Verify blur/overlay conditions include `callAwayCtx`.
- Check for duplication and naming consistency.

**Acceptance criteria covered:**
- AC 4: "reject call-away when not in CC_OPEN phase" — button only visible in CC_OPEN phase
- All AC scenarios are accessible from the position detail

---

### 11. E2E Tests

**Files to create or modify:**
- `e2e/call-away.spec.ts` — new file

The `reachCcOpenState()` helper from `close-cc-early.spec.ts` should be extracted to a shared helper file (e.g., `e2e/helpers.ts`) or duplicated inline. Each E2E test launches a fresh Electron app with a temp SQLite DB.

**Red — tests to write (one per AC):**

- `AC-1: successfully record shares called away — position phase changes to WHEEL_COMPLETE, status CLOSED, CC_CLOSE leg recorded, final P&L shows +$780.00`
  - Seed to CC_OPEN (ccStrike=182, basisPerShare derived ~174.20)
  - Click `[data-testid="record-call-away-btn"]`
  - Wait for "Record Call-Away" header visible
  - Assert P&L waterfall shows "$182.00" and "$780.00"
  - Click "Confirm Call-Away"
  - Wait for `text=WHEEL COMPLETE` (in success header)
  - Assert body contains "CC_CLOSE", "+$780" or "780"

- `AC-2: called-away below cost basis shows a loss — final P&L shows −$250.00 and P&L is displayed in red`
  - Seed to CC_OPEN with ccStrike=174.00 and CSP/CC premiums that yield basisPerShare=176.50
  - Click record-call-away-btn
  - Assert confirmation screen shows negative P&L value (−$250.00 or "250")
  - Confirm; wait for success; assert body contains "−250" or "-250"

- `AC-3: P&L breakdown shown on the form before submission — waterfall shows all four rows`
  - Seed to CC_OPEN
  - Click record-call-away-btn
  - Assert page contains "CC strike (shares delivered)", "Effective cost basis", "Appreciation per share", "Final cycle P&L"

- `AC-4: reject call-away when not in CC_OPEN phase — button is not visible in HOLDING_SHARES`
  - Seed to HOLDING_SHARES (after CSP assignment, before open-CC)
  - Assert `[data-testid="record-call-away-btn"]` count === 0

- `AC-5: reject fill date before CC open date — validation guard prevents submission`
  - This AC is tested at the service/lifecycle level (fill date is derived, not user-entered); the E2E test confirms the service rejects a manipulated payload.
  - Alternatively: verify the read-only fill date field displays the CC expiration date — assert the field shows the expected date string.
  - Assert no "WHEEL COMPLETE" success state appears when service guard fires.

- `AC-6: success state shows complete wheel summary — WHEEL COMPLETE, cycle P&L, cycle duration, annualized return, Start New Wheel CTA`
  - Seed to CC_OPEN; click record-call-away-btn; confirm
  - Wait for `text=WHEEL COMPLETE` (success header)
  - Assert body contains: "Cycle Summary", "days", annualizedReturn % pattern `/\d+\.\d+%/`, "Start New Wheel on AAPL →"
  - Click "Start New Wheel on AAPL →"; assert URL hash changes to `#/new` (or `#/new?ticker=AAPL`)

**Green — implementation:**
- Write `e2e/call-away.spec.ts` with `reachCcOpenState()` helper (inline or imported from shared helper).
- Use `createPortal`-compatible selectors: `[data-testid="record-call-away-btn"]`, `text=Record Call-Away`, `[data-testid="call-away-submit"]`, `text=WHEEL COMPLETE`.
- Add `data-testid` attributes in `CallAwayForm.tsx` and `CallAwaySuccess.tsx` as needed for selectors.

**Refactor — cleanup to consider:**
- Extract shared `reachCcOpenState()` and `selectDate()` helpers to `e2e/helpers.ts` if not already done.

**Acceptance criteria covered:**
- AC 1, AC 2, AC 3, AC 4, AC 5, AC 6 — one E2E test per scenario.
