# Implementation Plan: US-8 — Close Covered Call Early

## Summary

Adds buy-to-close functionality for open covered calls. When a trader closes their CC early, a `CC_CLOSE` leg is recorded, the position transitions from `CC_OPEN` → `HOLDING_SHARES`, and the cost basis snapshot is left unchanged. The renderer shows a right-side sheet with a live P&L preview while filling out the form, then a success card with the CC leg P&L and a "Sell New Covered Call" CTA.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/02-stories/US-8-close-covered-call-early.md`
- **Research & Design Decisions:** `plans/us-8/research.md`
- **Data Model & Selection Logic:** `plans/us-8/data-model.md`
- **API Contract:** `plans/us-8/contracts/positions-close-cc.md`
- **Quickstart & Verification:** `plans/us-8/quickstart.md`
- **Mockup:** `mockups/us-8-close-covered-call-early.mdx`

## Prerequisites

- US-7 must be complete: a `CC_OPEN` position with a `CC_OPEN` leg must exist. This story reads the active CC_OPEN leg to extract the open premium, strike, expiration, contracts, and fill date for validation and P&L calculation.
- All existing tests pass on the `us-8-close-cc_early` branch before starting.

---

## Implementation Areas

### 1. Lifecycle Engine: `closeCoveredCall`

**Files to create or modify:**
- `src/main/core/lifecycle.ts` — add `CloseCoveredCallInput`, `CloseCoveredCallResult`, and `closeCoveredCall` function

**Red — tests to write** (`src/main/core/lifecycle.test.ts`):
- `closeCoveredCall: throws ValidationError(field='__phase__', code='invalid_phase') when currentPhase is HOLDING_SHARES`
- `closeCoveredCall: throws ValidationError(field='__phase__', code='invalid_phase') when currentPhase is CSP_OPEN`
- `closeCoveredCall: throws ValidationError(field='closePricePerContract', code='must_be_positive') when closePricePerContract is 0`
- `closeCoveredCall: throws ValidationError(field='closePricePerContract', code='must_be_positive') when closePricePerContract is negative`
- `closeCoveredCall: throws ValidationError(field='fillDate', code='close_date_before_open') when fillDate is before openFillDate`
- `closeCoveredCall: throws ValidationError(field='fillDate', code='close_date_after_expiration') when fillDate is after expiration`
- `closeCoveredCall: returns { phase: HOLDING_SHARES } when all inputs are valid (profit close)`
- `closeCoveredCall: returns { phase: HOLDING_SHARES } when all inputs are valid (loss close — closePrice > openPremium)`
- `closeCoveredCall: returns { phase: HOLDING_SHARES } when fillDate equals openFillDate (boundary)`
- `closeCoveredCall: returns { phase: HOLDING_SHARES } when fillDate equals expiration (boundary)`

**Green — implementation:**
- Add `CloseCoveredCallInput` interface: `{ currentPhase: WheelPhase, closePricePerContract: string, openFillDate: string, fillDate: string, expiration: string }`
- Add `CloseCoveredCallResult` interface: `{ phase: 'HOLDING_SHARES' }`
- Add `closeCoveredCall(input: CloseCoveredCallInput): CloseCoveredCallResult`:
  - Guard: `currentPhase !== 'CC_OPEN'` → throw `ValidationError('__phase__', 'invalid_phase', 'No open covered call on this position')`
  - Guard: `new Decimal(closePricePerContract).lte(0)` → throw `ValidationError('closePricePerContract', 'must_be_positive', 'Close price must be greater than zero')`
  - Guard: `fillDate < openFillDate` → throw `ValidationError('fillDate', 'close_date_before_open', 'Fill date cannot be before the CC open date')`
  - Guard: `fillDate > expiration` → throw `ValidationError('fillDate', 'close_date_after_expiration', 'Fill date cannot be after the CC expiration date — use Record Expiry instead')`
  - Return `{ phase: 'HOLDING_SHARES' }`

**Refactor — cleanup to consider:**
- The close-price guard is identical to `closeCsp`. Consider extracting a shared `requirePositiveClosePrice` helper, or note the duplication and leave it — check consistency with existing guards.

**Acceptance criteria covered:**
- "Reject close when not in CC_OPEN phase"
- "Reject close price of zero or negative"
- "Reject fill date before CC open date"
- "Reject fill date after CC expiration date"

---

### 2. Cost Basis Engine: `calculateCcClose`

**Files to create or modify:**
- `src/main/core/costbasis.ts` — add `CcCloseInput`, `CcCloseResult`, and `calculateCcClose` function

**Red — tests to write** (`src/main/core/costbasis.test.ts`):
- `calculateCcClose: returns ccLegPnl="+120.0000" for openPremium=2.30, closePrice=1.10, contracts=1`
- `calculateCcClose: returns ccLegPnl="-120.0000" for openPremium=2.30, closePrice=3.50, contracts=1`
- `calculateCcClose: returns ccLegPnl="0.0000" for openPremium=2.30, closePrice=2.30, contracts=1 (break-even)`
- `calculateCcClose: scales correctly for contracts=2 (ccLegPnl="+240.0000" for openPremium=2.30, closePrice=1.10)`
- `calculateCcClose: applies ROUND_HALF_UP to fractional result`

**Green — implementation:**
- Add `CcCloseInput` interface: `{ openPremiumPerContract: string, closePricePerContract: string, contracts: number }`
- Add `CcCloseResult` interface: `{ ccLegPnl: string }`
- Add `calculateCcClose(input: CcCloseInput): CcCloseResult`:
  - `pnl = (openPremium - closePrice) × contracts × 100` using Decimal.js with ROUND_HALF_UP
  - Return `{ ccLegPnl: pnl.toFixed(4) }`

**Refactor — cleanup to consider:**
- `calculateCcClose` and `calculateCspClose` have nearly identical formulas. Check whether a shared helper is appropriate or whether the semantic difference (CC vs CSP) justifies separate functions.

**Acceptance criteria covered:**
- "CC leg P&L shows +$120.00 (($2.30 − $1.10) × 1 × 100)" (profit scenario)
- "CC leg P&L shows −$120.00 (($2.30 − $3.50) × 1 × 100)" (loss scenario)

---

### 3. IPC Schemas: `CloseCcPayloadSchema` and `CloseCcPositionResult`

**Files to create or modify:**
- `src/main/schemas.ts` — add schema, payload type, and result interface per `plans/us-8/contracts/positions-close-cc.md`

**Red — tests to write** (no dedicated schema test file; schema is exercised via IPC and service tests):
- Covered by Area 4 (service tests) and Area 5 (IPC handler tests). No additional schema-only tests required.

**Green — implementation:**
- Add `CloseCcPayloadSchema` Zod object: `{ positionId: z.string().uuid(), closePricePerContract: z.number().positive(), fillDate: z.string().optional() }`
- Add `export type CloseCcPayload = z.infer<typeof CloseCcPayloadSchema>`
- Add `CloseCcPositionResult` interface:
  ```ts
  export interface CloseCcPositionResult {
    position: { id: string; ticker: string; phase: 'HOLDING_SHARES'; status: 'ACTIVE'; closedDate: null }
    leg: LegRecord
    ccLegPnl: string
  }
  ```

**Refactor — cleanup to consider:**
- Verify naming consistency with existing schemas (e.g. `CloseCspPayloadSchema` → `CloseCcPayloadSchema`).

**Acceptance criteria covered:**
- Prerequisite for all other areas.

---

### 4. Service Layer: `closeCoveredCallPosition`

**Files to create or modify:**
- `src/main/services/close-covered-call-position.ts` — new file
- `src/main/services/positions.ts` — export the new function

**Red — tests to write** (`src/main/services/close-covered-call-position.test.ts`):
- Setup helper: reach `CC_OPEN` state (createPosition → assignCsp → openCoveredCall)
- `closeCoveredCallPosition: returns { position.phase: HOLDING_SHARES, leg.legRole: CC_CLOSE, ccLegPnl: "120.0000" } for profit close`
- `closeCoveredCallPosition: returns { position.phase: HOLDING_SHARES, leg.legRole: CC_CLOSE, ccLegPnl: "-120.0000" } for loss close (closePrice > openPremium)`
- `closeCoveredCallPosition: inserts a CC_CLOSE leg with action=BUY and instrumentType=CALL`
- `closeCoveredCallPosition: updates position phase to HOLDING_SHARES in the database`
- `closeCoveredCallPosition: does NOT create a new cost_basis_snapshot row`
- `closeCoveredCallPosition: leg fillDate defaults to today when not provided in payload`
- `closeCoveredCallPosition: leg fillDate uses payload.fillDate when provided`
- `closeCoveredCallPosition: throws ValidationError(not_found) when positionId does not exist`
- `closeCoveredCallPosition: throws ValidationError(invalid_phase) when position is in HOLDING_SHARES`
- `closeCoveredCallPosition: throws ValidationError(must_be_positive) when closePricePerContract is 0`
- `closeCoveredCallPosition: throws ValidationError(close_date_before_open) when fillDate is before CC open fillDate`
- `closeCoveredCallPosition: throws ValidationError(close_date_after_expiration) when fillDate is after CC expiration`

**Green — implementation:**
- Create `close-covered-call-position.ts` following the pattern of `open-covered-call-position.ts`:
  - `import { getPosition }` from `./get-position`
  - `import { closeCoveredCall }` from `../core/lifecycle`
  - `import { calculateCcClose }` from `../core/costbasis`
  - Get position; throw `ValidationError('__root__', 'not_found', ...)` if missing
  - Find the active `CC_OPEN` leg (`legRole === 'CC_OPEN'`); throw `ValidationError('__root__', 'no_cc_open_leg', ...)` if missing (after lifecycle engine validates phase)
  - Call `closeCoveredCall({ currentPhase, closePricePerContract: String(payload.closePricePerContract), openFillDate: ccOpenLeg.fillDate, fillDate, expiration: ccOpenLeg.expiration })`
  - Call `calculateCcClose({ openPremiumPerContract: ccOpenLeg.premiumPerContract, closePricePerContract: String(payload.closePricePerContract), contracts: ccOpenLeg.contracts })`
  - DB transaction: insert `CC_CLOSE` leg (copy strike/expiration/contracts from CC_OPEN leg, set action=BUY, instrumentType=CALL, premiumPerContract=fillPrice=closePriceFormatted); update position phase to `HOLDING_SHARES`
  - Log INFO: `{ positionId, phase: 'HOLDING_SHARES' }, 'covered_call_closed_early'`
  - Return `CloseCcPositionResult`
- Export from `positions.ts` barrel

**Refactor — cleanup to consider:**
- Check duplication with `close-csp-position.ts` patterns; extract any shared DB helpers if warranted.

**Acceptance criteria covered:**
- "Successfully close a covered call early at a profit" (phase transition, leg recorded, P&L)
- "Close at a loss shows negative P&L"
- "Reject close when not in CC_OPEN phase"
- "Position cost basis snapshot remains $174.20 per share (unchanged)"

---

### 5. IPC Handler: `positions:close-cc-early`

**Files to create or modify:**
- `src/main/ipc/positions.ts` — add `positions:close-cc-early` handler inside `registerPositionsHandlers`

**Red — tests to write** (`src/main/ipc/positions.test.ts`):
- `positions:close-cc-early: returns { ok: true, position.phase: HOLDING_SHARES, ccLegPnl } for valid profit payload`
- `positions:close-cc-early: returns { ok: false, errors } for invalid phase`
- `positions:close-cc-early: returns { ok: false, errors } for zero closePrice (Zod validation)`
- `positions:close-cc-early: returns { ok: false, errors } for invalid UUID positionId (Zod validation)`

**Green — implementation:**
- Inside `registerPositionsHandlers`, add:
  ```ts
  ipcMain.handle('positions:close-cc-early', (_, payload: unknown) =>
    handleIpcCall('positions_close_cc_early_unhandled_error', () => {
      const parsed = CloseCcPayloadSchema.parse(payload)
      return closeCoveredCallPosition(db, parsed.positionId, parsed)
    })
  )
  ```
- Import `CloseCcPayloadSchema` from `../schemas` and `closeCoveredCallPosition` from `../services/positions`

**Refactor — cleanup to consider:**
- Check naming consistency of all handler labels.

**Acceptance criteria covered:**
- Prerequisite for renderer integration.

---

### 6. Preload Bridge

**Files to create or modify:**
- `src/preload/index.ts` — add `closeCoveredCallEarly` method to the `api` object

**Red — tests to write:**
- No unit test for preload (tested via E2E).

**Green — implementation:**
- Add to `api`:
  ```ts
  closeCoveredCallEarly: (payload: unknown) => ipcRenderer.invoke('positions:close-cc-early', payload)
  ```

**Refactor — cleanup to consider:**
- Verify method name follows camelCase convention consistent with `openCoveredCall`.

**Acceptance criteria covered:**
- Enables renderer to invoke the IPC channel.

---

### 7. API Adapter: `closeCoveredCallEarly`

**Files to create or modify:**
- `src/renderer/src/api/positions.ts` — add types and `closeCoveredCallEarly` function

**Red — tests to write:**
- No dedicated adapter test (tested via hook tests and E2E).

**Green — implementation:**
- Add `IPC_TO_FORM_FIELD` entries: `closePricePerContract: 'close_price_per_contract'` (already mapped per existing `fillDate`)
- Add payload type:
  ```ts
  export type CloseCcPayload = {
    position_id: string
    close_price_per_contract: number
    fill_date?: string
  }
  ```
- Add response type:
  ```ts
  export type CloseCcResponse = {
    position: { id: string; ticker: string; phase: 'HOLDING_SHARES'; status: 'ACTIVE'; closedDate: null }
    leg: LegData & { positionId: string; legRole: string; action: string; instrumentType: string; premiumPerContract: string; fillPrice: string; fillDate: string; createdAt: string; updatedAt: string }
    ccLegPnl: string
  }
  ```
- Add function:
  ```ts
  export async function closeCoveredCallEarly(payload: CloseCcPayload): Promise<CloseCcResponse> {
    const result = await window.api.closeCoveredCallEarly({
      positionId: payload.position_id,
      closePricePerContract: payload.close_price_per_contract,
      fillDate: payload.fill_date
    })
    if (!result.ok) throw apiError(400, { detail: mapIpcErrors(result.errors) })
    return result as unknown as CloseCcResponse
  }
  ```

**Refactor — cleanup to consider:**
- Consistent naming with `openCoveredCall`.

**Acceptance criteria covered:**
- Bridge layer for renderer.

---

### 8. TanStack Mutation Hook: `useCloseCoveredCallEarly`

**Files to create or modify:**
- `src/renderer/src/hooks/useCloseCoveredCallEarly.ts` — new file

**Red — tests to write** (`src/renderer/src/hooks/useCloseCoveredCallEarly.test.ts`):
- `useCloseCoveredCallEarly: calls closeCoveredCallEarly API and invokes onSuccess with response on success`
- `useCloseCoveredCallEarly: invalidates positions query key on success`
- `useCloseCoveredCallEarly: propagates error when API returns { ok: false }`

**Green — implementation:**
- Follow the pattern of `useOpenCoveredCall.ts`:
  ```ts
  import { useMutation, useQueryClient } from '@tanstack/react-query'
  import { closeCoveredCallEarly, type CloseCcPayload, type CloseCcResponse } from '../api/positions'
  import { positionQueryKeys } from './positionQueryKeys'

  export function useCloseCoveredCallEarly({ onSuccess }: { onSuccess: (data: CloseCcResponse) => void }) {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: (payload: CloseCcPayload) => closeCoveredCallEarly(payload),
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
        onSuccess(data)
      }
    })
  }
  ```

**Refactor — cleanup to consider:**
- Check for duplication with other mutation hooks; consider a generic factory if warranted.

**Acceptance criteria covered:**
- Prerequisite for `CloseCcEarlySheet`.

---

### 9. P&L Preview Component: `CcPnlPreview`

**Files to create or modify:**
- `src/renderer/src/components/ui/CcPnlPreview.tsx` — new file

**Red — tests to write** (`src/renderer/src/components/ui/CcPnlPreview.test.tsx` or snapshot test):
- `CcPnlPreview: renders "+$120.00 profit · 47.8% of max" for openPremium=2.30, closePrice=1.10, contracts=1`
- `CcPnlPreview: renders "−$120.00 loss · 52.2% above open" for openPremium=2.30, closePrice=3.50, contracts=1`
- `CcPnlPreview: renders break-even text for openPremium=2.30, closePrice=2.30`
- `CcPnlPreview: renders nothing when closePrice is empty or zero`
- `CcPnlPreview: updates when closePrice prop changes`

**Green — implementation:**
- Props: `{ openPremium: string, closePrice: string, contracts: number }`
- Compute P&L using `decimal.js`: `pnl = (open - close) × contracts × 100`; `pct = (open - close) / open × 100`
- Profit (`pnl > 0`): green, show `+$X.XX profit · Y.Y% of max`
- Loss (`pnl < 0`): red, show `−$X.XX loss · Y.Y% above open`
- Break-even (`pnl === 0`): neutral, show `$0.00 break-even`
- Return `null` for invalid/empty inputs
- Visual style: follows `MockPnlPreview` in the mockup — colored banner with `P&L preview` label on left and dollar/percent on right

**Refactor — cleanup to consider:**
- Check duplication with any existing P&L display helpers in `src/renderer/src/lib/format.ts`.

**Acceptance criteria covered:**
- "P&L preview shown on the form before submission — profit close"
- "P&L preview shown on the form before submission — loss close"

---

### 10. Sheet Components: `CloseCcEarlySheet`, `CloseCcEarlyForm`, `CloseCcEarlySuccess`

**Files to create or modify:**
- `src/renderer/src/components/CloseCcEarlySheet.tsx` — orchestrator portal (new)
- `src/renderer/src/components/CloseCcEarlyForm.tsx` — form body (new)
- `src/renderer/src/components/CloseCcEarlySuccess.tsx` — success state (new)

**Red — tests to write** (`src/renderer/src/components/CloseCcEarlySheet.test.tsx`):
- `CloseCcEarlySheet: does not render when open=false`
- `CloseCcEarlySheet: renders form header "Close Covered Call Early" when open=true`
- `CloseCcEarlySheet: renders position summary card with ticker, contracts, open premium, phase transition CC_OPEN→HOLDING_SHARES, and cost basis (unchanged)`
- `CloseCcEarlySheet: renders close price input and fill date picker`
- `CloseCcEarlySheet: renders live P&L preview that updates when close price changes`
- `CloseCcEarlySheet: shows profit P&L preview (+$120.00) when closePrice=1.10 and openPremium=2.30`
- `CloseCcEarlySheet: shows loss P&L preview (−$120.00) when closePrice=3.50 and openPremium=2.30`
- `CloseCcEarlySheet: shows inline error "Close price must be greater than zero" when submitted with empty price`
- `CloseCcEarlySheet: shows inline error "Fill date cannot be before the CC open date" for invalid date`
- `CloseCcEarlySheet: shows irrevocable warning AlertBox`
- `CloseCcEarlySheet: renders success state with hero card "+$120.00" after successful profit close`
- `CloseCcEarlySheet: renders success state with hero card "−$120.00" after successful loss close`
- `CloseCcEarlySheet: renders "Sell New Covered Call on AAPL →" CTA in success state`
- `CloseCcEarlySheet: renders phase transition CC_OPEN→HOLDING_SHARES in success summary card`
- `CloseCcEarlySheet: renders cost basis "(unchanged)" in success summary card`
- `CloseCcEarlySheet: calls onClose when Cancel is clicked`
- `CloseCcEarlySheet: contracts field is read-only (displays value, not editable)`

**Green — implementation:**

`CloseCcEarlySheet` (follows `OpenCoveredCallSheet` pattern):
- Props: `{ open, positionId, ticker, contracts, openPremium, ccOpenFillDate, ccExpiration, strike, basisPerShare, onClose }`
- Uses `createPortal` with fixed right-panel overlay (400px, `SIDEBAR_WIDTH=200` left offset, scrim backdrop)
- Manages state: `closePrice`, `fillDate`, `fieldErrors`, `successState: CloseCcResponse | null`
- Uses `useCloseCoveredCallEarly({ onSuccess: setSuccessState })`
- Renders `CloseCcEarlyForm` or `CloseCcEarlySuccess` based on `successState`

`CloseCcEarlyForm` (references mockup form state):
- Header: `Caption` "Buy to Close" (secondary color) + title "Close Covered Call Early" + subtitle "CALL $strike · {expiration formatted}"
- Close button (×) in header top-right
- `SectionCard` position summary:
  - Position: `{ticker} CALL ${strike} · {exp}`
  - Contracts: read-only value
  - Open premium: `+${openPremium} / contract` (green)
  - Max profit: `+${openPremium × contracts × 100}` (green)
  - Phase transition: `PhaseBadge CC_OPEN` → `PhaseBadge HOLDING_SHARES`
  - Cost basis after close: `$${basisPerShare} / share (unchanged)` (highlighted row)
- `FormField` label "Close Price (Buy to Close)" + `NumberInput` with `$` prefix + error display
- `CcPnlPreview` component (live, updates on closePrice change)
- `FormField` label "Fill Date" + `DatePicker` + error display
- `AlertBox` variant="warning": "This cannot be undone. A CC_CLOSE leg will be recorded. The position returns to Holding Shares. Full leg history is preserved."
- Footer: `Button variant="outline"` Cancel + `FormButton` "Confirm Close" / "Closing…" (pending)

`CloseCcEarlySuccess` (references mockup success states):
- Header: `Caption` "Complete" (green if profit, red if loss) + title "AAPL CC Closed" + subtitle "CALL $strike · filled $closePrice"
- Hero card: large `+$X.XX` / `−$X.XX`, "CC Leg P&L" caption, "X% of max captured" / "X% above open premium" subtext
- `SectionCard` result summary: Leg recorded (CC_CLOSE · fill date), Fill price, Open premium, Phase transition, Cost basis (unchanged)
- `AlertBox` variant="info": "You're back in Holding Shares. Sell a new covered call to keep the wheel spinning..."
- "What's next?" caption
- `FormButton` "Sell New Covered Call on {ticker} →" (full width, gold) — calls `onClose` (the actual "Open CC" CTA is wired in the next US)
- "View full position history" link button — calls `onClose`

**Refactor — cleanup to consider:**
- Check naming, prop shape consistency with `OpenCoveredCallSheet`/`OpenCcSuccess`.
- Verify `CcPnlPreview` is not duplicating logic already in the form component.

**Acceptance criteria covered:**
- "P&L preview shown on the form before submission — profit close" and "— loss close"
- "Reject close price of zero or negative" (front-end validation)
- "Reject fill date before CC open date" (front-end validation)
- Post-close success display with phase transition badge

---

### 11. Position Detail Actions: "Close CC Early" Button

**Files to create or modify:**
- `src/renderer/src/components/PositionDetailActions.tsx` — add `onCloseCcEarly` prop and button for `phase === 'CC_OPEN'`

**Red — tests to write** (`src/renderer/src/components/PositionDetailActions.test.tsx` if exists, or add cases to existing component tests):
- `PositionDetailActions: renders "Close CC Early →" button when phase=CC_OPEN`
- `PositionDetailActions: does not render "Close CC Early →" button when phase=HOLDING_SHARES`
- `PositionDetailActions: calls onCloseCcEarly when "Close CC Early →" is clicked`

**Green — implementation:**
- Add `onCloseCcEarly: () => void` to `PositionDetailActionsProps`
- Add button for `phase === 'CC_OPEN'`:
  ```tsx
  {phase === 'CC_OPEN' && (
    <button
      data-testid="close-cc-early-btn"
      className="wb-teal-button"
      onClick={onCloseCcEarly}
      style={actionButtonStyle}
    >
      Close CC Early →
    </button>
  )}
  ```
- Pass `onCloseCcEarly` from all existing call sites (will be wired in Area 12)

**Refactor — cleanup to consider:**
- Check that `actionButtonStyle` is still consistent; no visual change needed.

**Acceptance criteria covered:**
- "Close button appears in position detail header when phase = CC_OPEN"

---

### 12. Position Detail Page: Wire Up `CloseCcEarlySheet`

**Files to create or modify:**
- `src/renderer/src/pages/PositionDetailPage.tsx` — add `closeCcCtx` state, `handleCloseCcEarly`, and `CloseCcEarlySheet`

**Red — tests to write** (`src/renderer/src/pages/PositionDetailPage.test.tsx`):
- `PositionDetailPage: shows "Close CC Early →" button when position phase is CC_OPEN`
- `PositionDetailPage: opens CloseCcEarlySheet when "Close CC Early →" is clicked`
- `PositionDetailPage: does not show "Close CC Early →" button when phase is HOLDING_SHARES`

**Green — implementation:**
- Add state: `const [closeCcCtx, setCloseCcCtx] = useState<{ contracts, openPremium, ccOpenFillDate, ccExpiration, strike, basisPerShare } | null>(null)`
- Add handler `handleCloseCcEarly`: finds the `CC_OPEN` leg from `data?.legs`, builds context from leg (strike, expiration, contracts, premiumPerContract, fillDate) and snapshot (basisPerShare); calls `setCloseCcCtx(...)`
- Add close handler: `const handleCloseCloseCcEarly = useCallback(() => setCloseCcCtx(null), [])`
- Pass `onCloseCcEarly={handleCloseCcEarly}` to `PositionDetailActions`
- Render `CloseCcEarlySheet`:
  ```tsx
  <CloseCcEarlySheet
    open={closeCcCtx !== null}
    positionId={position.id}
    ticker={position.ticker}
    contracts={closeCcCtx?.contracts ?? 0}
    openPremium={closeCcCtx?.openPremium ?? ''}
    ccOpenFillDate={closeCcCtx?.ccOpenFillDate ?? ''}
    ccExpiration={closeCcCtx?.ccExpiration ?? ''}
    strike={closeCcCtx?.strike ?? ''}
    basisPerShare={closeCcCtx?.basisPerShare ?? ''}
    onClose={handleCloseCloseCcEarly}
  />
  ```

**Refactor — cleanup to consider:**
- Check whether the sheet context type should be extracted to a named type for clarity.

**Acceptance criteria covered:**
- Provides the UI entry point for all CC close scenarios.

---

### 13. E2E Tests

**Files to create or modify:**
- `e2e/close-cc-early.spec.ts` — new E2E spec file

**Red — tests to write** (one test per AC, test names mirror AC language):
- `successfully close a covered call early at a profit — position phase changes to HOLDING_SHARES, CC_CLOSE leg recorded with fill price $1.10, P&L shows +$120.00`
- `close at a loss shows negative P&L — CC_CLOSE leg recorded with $3.50, P&L shows −$120.00, position remains in HOLDING_SHARES`
- `P&L preview shown on the form before submission — profit close — preview shows "+$115.00 profit (50% of max)" for closePrice $1.15`
- `P&L preview shown on the form before submission — loss close — preview shows "−$120.00 loss" for closePrice $3.50, no percentage-of-max label`
- `reject close when not in CC_OPEN phase — action rejected with "No open covered call on this position"`
- `reject close price of zero or negative — validation error "Close price must be greater than zero" appears, no leg created`
- `reject fill date before CC open date — validation error "Fill date cannot be before the CC open date" appears, no leg created`
- `reject fill date after CC expiration date — validation error "Fill date cannot be after the CC expiration date — use Record Expiry instead" appears, no leg created`

**Green — implementation:**
- Use Playwright `_electron` to launch the app
- Seed a position at `CC_OPEN` state by programmatically going through the UI flow (or by direct DB seeding via a test helper if available)
- Click "Close CC Early →" button (`data-testid="close-cc-early-btn"`) to open the sheet
- Fill close price and fill date fields
- Assert P&L preview text
- Click "Confirm Close"
- Assert success state: hero card amount, phase badge `HOLDING_SHARES`, "Sell New Covered Call" CTA visible
- For rejection scenarios: assert inline error text appears and no new leg is recorded

**Acceptance criteria covered:**
- All 8 ACs from the user story are covered one-to-one.
