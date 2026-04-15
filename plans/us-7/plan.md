# Implementation Plan: US-7 — Open a Covered Call

## Summary

Add the ability to sell a covered call against shares held after CSP assignment. This adds a new lifecycle transition (`HOLDING_SHARES → CC_OPEN`), a cost basis update (reduced by CC premium), a new service/IPC channel, and a right-side sheet UI with a cost basis guardrail that warns when the strike is at or below cost basis. Done state: a trader on the position detail page in `HOLDING_SHARES` can click "Open Covered Call →", fill in strike/premium/contracts/expiration/fill date, see the guardrail inline, submit, and see the success confirmation with updated cost basis.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/02-stories/US-7-open-covered-call.md`
- **Mockup:** `mockups/us-7-open-covered-call.mdx`
- **Research & Design Decisions:** `plans/us-7/research.md`
- **Data Model & Cost Basis Logic:** `plans/us-7/data-model.md`
- **API Contract:** `plans/us-7/contracts/open-cc.md`
- **Quickstart & Verification:** `plans/us-7/quickstart.md`

## Prerequisites

- US-6 complete: assignment recording, `HOLDING_SHARES` phase, cost basis snapshot after assignment
- Existing types: `CC_OPEN` phase, `CC_OPEN` leg role, `SELL` action, `CALL` instrument type (all in `src/main/core/types.ts`)
- Existing DB schema: `legs`, `cost_basis_snapshots`, `positions` tables support all required fields
- Existing UI components: `AlertBox`, `Badge`, `Caption`, `Field`, `FormButton`, `SectionCard`, `DatePicker`, `Input`
- Existing sheet pattern: `AssignmentSheet.tsx` as reference

## Implementation Areas

### 1. Lifecycle Engine — `openCoveredCall()` function

**Files to create or modify:**

- `src/main/core/lifecycle.ts` — add `OpenCoveredCallInput`, `OpenCoveredCallResult`, `openCoveredCall()` function
- `src/main/core/lifecycle.test.ts` — add test cases for the new function

**Red — tests to write:**

- `src/main/core/lifecycle.test.ts`: `describe('openCoveredCall')`:
  - `it('returns CC_OPEN when current phase is HOLDING_SHARES')` — input with valid phase, strike, contracts, dates → returns `{ phase: 'CC_OPEN' }`
  - `it('throws ValidationError when phase is CC_OPEN')` — currentPhase `CC_OPEN` → field `__phase__`, message "A covered call is already open on this position"
  - `it('throws ValidationError when phase is CSP_OPEN')` — currentPhase `CSP_OPEN` → field `__phase__`, message "Position is not in HOLDING_SHARES phase"
  - `it('throws ValidationError when contracts exceed position contracts')` — contracts 2, positionContracts 1 → field `contracts`, code `exceeds_shares`
  - `it('throws ValidationError when fill date is before assignment date')` — fillDate `2026-01-16`, assignmentDate `2026-01-17` → field `fillDate`, code `before_assignment`
  - `it('throws ValidationError when fill date is in the future')` — fillDate after referenceDate → field `fillDate`, code `cannot_be_future`
  - `it('throws ValidationError when strike is not positive')` — strike `0` → field `strike`, code `must_be_positive`
  - `it('throws ValidationError when premium is not positive')` — premiumPerContract `0` → field `premiumPerContract`, code `must_be_positive`

**Green — implementation:**

- Add `OpenCoveredCallInput` interface to `src/main/core/lifecycle.ts`: `{ currentPhase: WheelPhase, strike: string, contracts: number, positionContracts: number, premiumPerContract: string, fillDate: string, assignmentDate: string, referenceDate: string, expiration: string }`
- Add `OpenCoveredCallResult` interface: `{ phase: 'CC_OPEN' }`
- Add `openCoveredCall(input: OpenCoveredCallInput): OpenCoveredCallResult` function:
  1. If `currentPhase === 'CC_OPEN'` → throw ValidationError(`__phase__`, `invalid_phase`, "A covered call is already open on this position")
  2. If `currentPhase !== 'HOLDING_SHARES'` → throw ValidationError(`__phase__`, `invalid_phase`, "Position is not in HOLDING_SHARES phase")
  3. Validate strike > 0 using Decimal
  4. Validate premiumPerContract > 0 using Decimal
  5. Validate contracts ≤ positionContracts → throw with field `contracts`, code `exceeds_shares`, message "Contracts cannot exceed shares held ({positionContracts})"
  6. Validate fillDate ≥ assignmentDate → throw with field `fillDate`, code `before_assignment`
  7. Validate fillDate ≤ referenceDate → throw with field `fillDate`, code `cannot_be_future`
  8. Return `{ phase: 'CC_OPEN' }`

**Refactor — cleanup to consider:**

- Check for duplication with `openWheel()` validation (strike/premium checks). Extract shared validators if patterns are identical.

**Acceptance criteria covered:**

- "Reject open CC when not in HOLDING_SHARES phase" (phase guard)
- "Reject CC with contracts exceeding shares held" (contracts validation)
- "Reject fill date before assignment date" (date validation)

---

### 2. Cost Basis Engine — `calculateCcOpenBasis()` function

**Files to create or modify:**

- `src/main/core/costbasis.ts` — add `CcOpenBasisInput`, `CcOpenBasisResult`, `calculateCcOpenBasis()` function
- `src/main/core/costbasis.test.ts` — add test cases

**Red — tests to write:**

- `src/main/core/costbasis.test.ts`: `describe('calculateCcOpenBasis')`:
  - `it('reduces basis per share by CC premium')` — prevBasisPerShare `176.5000`, ccPremiumPerContract `2.3000`, contracts 1 → basisPerShare `174.2000`
  - `it('adds CC premium to total premium collected')` — prevTotalPremium `350.0000`, ccPremium `2.3000`, contracts 1 → totalPremiumCollected `580.0000` (350 + 2.30 × 1 × 100)
  - `it('handles multi-contract CC')` — prevBasisPerShare `176.5000`, ccPremium `2.3000`, contracts 2 → basisPerShare `174.2000` (per-share is same), totalPremiumCollected increases by 460.00
  - `it('returns 4dp precision')` — ccPremium `1.1111` → result has 4 decimal places

**Green — implementation:**

- Add `CcOpenBasisInput` to `src/main/core/costbasis.ts`: `{ prevBasisPerShare: string, prevTotalPremiumCollected: string, ccPremiumPerContract: string, contracts: number }`
- Add `CcOpenBasisResult`: `{ basisPerShare: string, totalPremiumCollected: string }`
- Add `calculateCcOpenBasis(input: CcOpenBasisInput): CcOpenBasisResult`:
  1. `basisPerShare = round4(Decimal(prevBasisPerShare).minus(ccPremiumPerContract)).toFixed(4)`
  2. `totalPremiumCollected = round4(Decimal(prevTotalPremiumCollected).plus(Decimal(ccPremiumPerContract).times(contracts).times(100))).toFixed(4)`
  3. Return both

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency with existing cost basis functions.

**Acceptance criteria covered:**

- "The effective cost basis updates to $174.20 per share ($176.50 − $2.30)"
- "The total premium collected increases by $230.00"

---

### 3. Schema & IPC Contract — `OpenCcPayloadSchema`

**Files to create or modify:**

- `src/main/schemas.ts` — add `OpenCcPayloadSchema`, `OpenCcPayload` type, `OpenCcPositionResult` interface

**Red — tests to write:**

- `src/main/schemas.test.ts` (create if needed): `describe('OpenCcPayloadSchema')`:
  - `it('parses valid payload')` — `{ positionId: uuid, strike: 182, expiration: '2026-02-21', contracts: 1, premiumPerContract: 2.3 }` → success
  - `it('rejects missing positionId')` — omit positionId → ZodError
  - `it('rejects non-positive strike')` — strike 0 → ZodError
  - `it('rejects non-integer contracts')` — contracts 1.5 → ZodError
  - `it('accepts optional fillDate')` — with and without fillDate both parse

**Green — implementation:**

- Add to `src/main/schemas.ts`:
  ```typescript
  export const OpenCcPayloadSchema = z.object({
    positionId: z.string().uuid(),
    strike: z.number().positive(),
    expiration: z.string(),
    contracts: z.number().int().positive(),
    premiumPerContract: z.number().positive(),
    fillDate: z.string().optional()
  })
  export type OpenCcPayload = z.infer<typeof OpenCcPayloadSchema>
  export interface OpenCcPositionResult {
    position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE'; closedDate: null }
    leg: LegRecord
    costBasisSnapshot: CostBasisSnapshotRecord
  }
  ```

**Refactor — cleanup to consider:**

- Ensure consistent naming with other schemas (e.g., `OpenCcPayloadSchema` parallels `AssignCspPayloadSchema`).

**Acceptance criteria covered:**

- "Reject open CC with missing required fields" (Zod validation)

---

### 4. Service Layer — `openCoveredCallPosition()` function

**Files to create or modify:**

- `src/main/services/open-covered-call-position.ts` — new file
- `src/main/services/positions.ts` — re-export the new function
- `src/main/services/open-covered-call-position.test.ts` — new test file

**Red — tests to write:**

- `src/main/services/open-covered-call-position.test.ts`: `describe('openCoveredCallPosition')`:
  - `it('creates CC_OPEN leg, updates phase, creates cost basis snapshot')` — set up DB with CSP_OPEN → assign → call `openCoveredCallPosition()` with valid payload → verify: position.phase is `CC_OPEN`, new leg with role `CC_OPEN`/action `SELL`/instrumentType `CALL`, new snapshot with reduced basis
  - `it('returns correct cost basis after CC open')` — CSP strike 180, CSP premium 3.50, CC premium 2.30 → basisPerShare `174.2000`, totalPremiumCollected `580.0000`
  - `it('throws ValidationError when position not found')` — invalid positionId → error "Position not found"
  - `it('throws ValidationError when no active assignment leg')` — position exists but no ASSIGN leg → appropriate error
  - `it('throws ValidationError when phase is not HOLDING_SHARES')` — CSP_OPEN position → phase error
  - `it('throws ValidationError when contracts exceed position contracts')` — 1-contract position, CC with 2 contracts → contracts error
  - `it('throws ValidationError when fill date before assignment date')` — fill date before ASSIGN leg's fill_date → date error
  - `it('defaults fill date to today when not provided')` — omit fillDate → leg.fillDate is today's ISO date

**Green — implementation:**

- Create `src/main/services/open-covered-call-position.ts` following `assign-csp-position.ts` pattern:
  1. `getPosition(db, positionId)` — get current position detail
  2. Find assignment leg: `positionDetail.legs.find(l => l.legRole === 'ASSIGN')` — needed for assignment date and contracts
  3. Find latest cost basis snapshot: `positionDetail.costBasisSnapshot`
  4. Call `openCoveredCall()` from lifecycle engine with: `currentPhase`, `strike` (as string), `contracts`, `positionContracts` (from ASSIGN leg), `premiumPerContract` (as string), `fillDate`, `assignmentDate` (from ASSIGN leg), `referenceDate` (today), `expiration`
  5. Call `calculateCcOpenBasis()` with: `prevBasisPerShare`, `prevTotalPremiumCollected`, `ccPremiumPerContract`, `contracts`
  6. Transaction: insert CC_OPEN leg, update position phase, insert cost basis snapshot
  7. Log and return `OpenCcPositionResult`
- Add re-export to `src/main/services/positions.ts`: `export { openCoveredCallPosition } from './open-covered-call-position'`

**Refactor — cleanup to consider:**

- Check for duplication with `assignCspPosition()` transaction pattern. Consider extracting shared helpers if the pattern is identical in 3+ services.

**Acceptance criteria covered:**

- "A CC_OPEN leg is recorded with strike $182.00 and premium $2.30"
- "The position phase changes to CC_OPEN"
- "The effective cost basis updates to $174.20 per share"

---

### 5. IPC Handler — `positions:open-cc`

**Files to create or modify:**

- `src/main/ipc/positions.ts` — add `positions:open-cc` handler, import `OpenCcPayloadSchema` and `openCoveredCallPosition`

**Red — tests to write:**

- `src/main/ipc/positions.test.ts` (create or extend): `describe('positions:open-cc')`:
  - `it('returns ok: true with position, leg, and snapshot on success')` — integration test calling the handler through the IPC layer
  - `it('returns ok: false with validation errors on invalid payload')` — missing required fields → Zod errors mapped correctly
  - `it('returns ok: false when phase is wrong')` — CSP_OPEN position → lifecycle ValidationError mapped to error response

**Green — implementation:**

- Add to `registerPositionsHandlers()` in `src/main/ipc/positions.ts`:
  ```typescript
  ipcMain.handle('positions:open-cc', (_, payload: unknown) =>
    handleIpcCall('positions_open_cc_unhandled_error', () => {
      const parsed = OpenCcPayloadSchema.parse(payload)
      return openCoveredCallPosition(db, parsed.positionId, parsed)
    })
  )
  ```

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency with other handlers.

**Acceptance criteria covered:**

- Enables all IPC communication for the CC form (indirect — required by frontend).

---

### 6. Preload & Renderer API — Wire up `openCoveredCall`

**Files to create or modify:**

- `src/preload/index.ts` — add `openCoveredCall` to the `api` object
- `src/preload/index.d.ts` — add type declaration (if it exists)
- `src/renderer/src/api/positions.ts` — add `OpenCcPayload`, `OpenCcResponse` types, `openCoveredCall()` function, update `IPC_TO_FORM_FIELD` map

**Red — tests to write:**

- No unit tests for the preload binding (thin pass-through, covered by e2e).
- `src/renderer/src/api/positions.test.ts` (if exists): Test that `openCoveredCall()` maps snake_case payload to camelCase IPC call. If no renderer API tests exist, skip — covered by e2e.

**Green — implementation:**

- `src/preload/index.ts`: add `openCoveredCall: (payload: unknown) => ipcRenderer.invoke('positions:open-cc', payload)` to the `api` object
- `src/renderer/src/api/positions.ts`:
  - Add types `OpenCcPayload` and `OpenCcResponse` per `plans/us-7/contracts/open-cc.md`
  - Add `IPC_TO_FORM_FIELD` entries: `strike: 'strike'`, `premiumPerContract: 'premium_per_contract'`, `fillDate: 'fill_date'`
  - Add `openCoveredCall(payload: OpenCcPayload): Promise<OpenCcResponse>` function following `assignPosition()` pattern: map snake_case fields to camelCase, call `window.api.openCoveredCall()`, map errors

**Refactor — cleanup to consider:**

- Naming consistency with other API functions.

**Acceptance criteria covered:**

- Enables frontend communication (indirect — required by the sheet component).

---

### 7. Mutation Hook — `useOpenCoveredCall()`

**Files to create or modify:**

- `src/renderer/src/hooks/useOpenCoveredCall.ts` — new file

**Red — tests to write:**

- No unit tests for hooks (thin TanStack Query wrapper). Covered by e2e tests.

**Green — implementation:**

- Create `src/renderer/src/hooks/useOpenCoveredCall.ts` following `useAssignPosition.ts` pattern:
  ```typescript
  export function useOpenCoveredCall(options?: { onSuccess?: (data: OpenCcResponse) => void }) {
    const queryClient = useQueryClient()
    return useMutation<OpenCcResponse, ApiError, OpenCcPayload>({
      mutationFn: openCoveredCall,
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })
        options?.onSuccess?.(data)
      }
    })
  }
  ```

**Refactor — cleanup to consider:**

- Check consistency with other mutation hooks.

**Acceptance criteria covered:**

- Enables the sheet component to submit (indirect).

---

### 8. OpenCoveredCallSheet Component

**Files to create or modify:**

- `src/renderer/src/components/OpenCoveredCallSheet.tsx` — new file

**Red — tests to write:**

- No isolated component unit tests (the mockup-matching UI is validated by e2e tests). If component tests exist for AssignmentSheet, mirror them. Otherwise, e2e covers this.

**Green — implementation:**

- Create `src/renderer/src/components/OpenCoveredCallSheet.tsx` following `AssignmentSheet.tsx` pattern and the mockup in `mockups/us-7-open-covered-call.mdx`:
  - **Props:** `{ open, positionId, ticker, basisPerShare, totalPremiumCollected, contracts (position contracts), assignmentDate, onClose }`
  - **State:** `strike`, `premium`, `contracts`, `expiration`, `fillDate`, field errors, `successState`
  - **Mutation:** `useOpenCoveredCall({ onSuccess: setSuccessState })`
  - **Form layout** (from mockup):
    - Position summary `SectionCard` with header "Position": rows for Ticker, Shares held (blue), Assignment strike, Effective cost basis (gold, highlighted)
    - Strike `Field` + `Input` with `$` prefix
    - **Guardrail AlertBox** (conditional, inline below strike): `computeGuardrail(strike, basisPerShare)` → if `type === 'above'` → `AlertBox variant="info"` with profit message; if `type === 'below'` or `type === 'at'` → `AlertBox variant="warning"` with loss/break-even message
    - Premium/share + Contracts in 2-column grid (from mockup: `gridTemplateColumns: '1fr 1fr'`). Contracts field has hint "Max {positionContracts}"
    - Expiration `Field` + `DatePicker`
    - Fill Date `Field` + `DatePicker`
    - Irrevocable `AlertBox variant="warning"`: "**This cannot be undone.** The position will transition to CC Open. Full leg history is preserved."
  - **Footer:** Cancel (secondary `FormButton`) + "Open Covered Call" (primary `FormButton` with `pendingLabel="Opening…"`)
  - **Success state** (from mockup):
    - Header: eyebrow "Complete" (purple), title "AAPL CC Opened", subtitle "CALL $182.00 · Feb 21, 2026"
    - Purple hero card: "Call Open" caption, "HOLDING 100 SHARES" headline, "CC OPEN · CALL $182.00 · Feb 21, 2026" subline
    - Two stat boxes: Updated Cost Basis (purple) and Total Premium (green)
    - Result summary `SectionCard`: Leg recorded, Phase transition (HOLDING_SHARES → CC_OPEN badges), Strike, Expiration, Premium collected, Updated cost basis (highlighted)
    - Profit preview `AlertBox variant="info"`: "If shares are called away at $182.00, you profit $5.50/share ($550.00 total) above cost basis."
    - "What's next?" caption + "View full position history" link
  - **Guardrail pure function** (inline in component):
    ```typescript
    function computeGuardrail(
      strike: string,
      basis: string
    ): { type: 'below' | 'at' | 'above'; message: string } | null
    ```
    Same logic as mockup's `computeGuardrail()`.

**Refactor — cleanup to consider:**

- Extract shared sheet chrome (header, panel styles) into a `SheetLayout` component if AssignmentSheet and OpenCoveredCallSheet have identical wrappers. Only if duplication is clear.

**Acceptance criteria covered:**

- "Strike above cost basis shows no warning" (info note with profit preview)
- "Strike at or below cost basis shows guardrail warning" (gold warning, button enabled)
- "Strike exactly at cost basis shows guardrail warning" (break-even message)
- "Reject open CC with missing required fields" (client-side validation)

---

### 9. Position Detail Page — "Open Covered Call →" button + sheet integration

**Files to create or modify:**

- `src/renderer/src/pages/PositionDetailPage.tsx` — add HOLDING_SHARES button, openCcCtx state, render `OpenCoveredCallSheet`

**Red — tests to write:**

- Covered by e2e tests. No isolated page tests unless existing pattern includes them.

**Green — implementation:**

- Import `OpenCoveredCallSheet` in `PositionDetailPage.tsx`
- Add state: `const [openCcCtx, setOpenCcCtx] = useState<{ ... } | null>(null)` with basisPerShare, totalPremiumCollected, contracts, assignmentDate from the position detail data
- Add conditional button in the header `right` area:
  ```tsx
  {position.phase === 'HOLDING_SHARES' && (
    <button
      data-testid="open-covered-call-btn"
      className="wb-teal-button"
      onClick={() => {
        if (costBasisSnapshot) {
          const assignLeg = legs.find(l => l.legRole === 'ASSIGN')
          if (assignLeg) setOpenCcCtx({ ... })
        }
      }}
      style={actionButtonStyle}
    >
      Open Covered Call →
    </button>
  )}
  ```
- Add blur effect: include `openCcCtx` in the blur condition alongside `expirationCtx` and `assignmentCtx`
- Render `OpenCoveredCallSheet` at the bottom of the component:
  ```tsx
  {
    openCcCtx && (
      <OpenCoveredCallSheet
        open
        positionId={position.id}
        ticker={position.ticker}
        basisPerShare={openCcCtx.basisPerShare}
        totalPremiumCollected={openCcCtx.totalPremiumCollected}
        contracts={openCcCtx.contracts}
        assignmentDate={openCcCtx.assignmentDate}
        onClose={() => setOpenCcCtx(null)}
      />
    )
  }
  ```

**Refactor — cleanup to consider:**

- The blur condition is getting long with three context states. Consider a computed `isSheetOpen` variable.

**Acceptance criteria covered:**

- "CC form appears in position detail header when phase = HOLDING_SHARES" (Technical Notes)

---

### 10. E2E Tests

**Files to create or modify:**

- `e2e/open-covered-call.spec.ts` — new file

**Red — tests to write (one per AC):**

Each test sets up a position via the UI: open CSP (AAPL, strike $180, premium $3.50, 1 contract) → assign → then test the CC flow.

- `it('AC1: successfully opens a covered call — phase transitions to CC_OPEN, leg recorded, cost basis updated, total premium increased')` — open CC sheet, enter strike $182, premium $2.30, 1 contract, select expiration, select fill date, submit → verify success screen shows "HOLDING 100 SHARES", "CC OPEN", cost basis "$174.20", phase badge changes. Maps to AC: "Successfully open a covered call above cost basis".

- `it('AC2: strike above cost basis shows profit preview and no warning')` — open CC sheet, enter strike $182 (above $176.50 basis) → verify info note contains "Shares called away at $182.00 → profit of $5.50/share", verify no gold warning present. Maps to AC: "Strike above cost basis shows no warning".

- `it('AC3: strike below cost basis shows gold guardrail warning with loss amount')` — open CC sheet, enter strike $174 → verify gold warning "This strike is below your cost basis — you would lock in a loss of $2.50/share if called away", verify Confirm/submit button is still enabled. Maps to AC: "Strike at or below cost basis shows guardrail warning".

- `it('AC4: strike at cost basis shows gold guardrail warning with break-even message')` — open CC sheet, enter strike $176.50 → verify gold warning "This strike is at your cost basis — you would break even if called away". Maps to AC: "Strike exactly at cost basis shows guardrail warning".

- `it('AC5: rejects open CC when position is in CC_OPEN phase')` — open CC successfully first, close sheet, verify "Open Covered Call →" button is no longer visible (position is now CC_OPEN, not HOLDING_SHARES). Maps to AC: "Reject open CC when not in HOLDING_SHARES phase".

- `it('AC6: rejects open CC with missing strike field')` — open CC sheet, leave strike empty, attempt submit → verify validation error "Strike is required". Maps to AC: "Reject open CC with missing required fields".

- `it('AC7: rejects CC with contracts exceeding shares held')` — open CC sheet, enter contracts 2 (only 1 contract/100 shares held) → verify validation error "Contracts cannot exceed shares held (1)". Maps to AC: "Reject CC with contracts exceeding shares held".

- `it('AC8: rejects fill date before assignment date')` — open CC sheet, enter fill date before the assignment date → verify validation error "Fill date cannot be before the assignment date". Maps to AC: "Reject fill date before assignment date".

**Green — implementation:**

- Create `e2e/open-covered-call.spec.ts` following `e2e/csp-assignment.spec.ts` pattern:
  - Reuse `launchFreshApp()`, `openPosition()`, `selectDate()`, `openDetailFor()` helpers
  - Add `assignPosition()` helper that opens assignment sheet and confirms
  - Add `openCcSheet()` helper that clicks `[data-testid="open-covered-call-btn"]` and waits for sheet
  - Each test: launch app → create CSP → assign → exercise the specific AC

**Refactor — cleanup to consider:**

- Extract shared e2e helpers (openPosition, selectDate, openDetailFor, assignPosition) into a shared utils file if duplication across e2e files is growing.

**Acceptance criteria covered:**

- AC1: Successfully open a covered call above cost basis
- AC2: Strike above cost basis shows no warning
- AC3: Strike at or below cost basis shows guardrail warning
- AC4: Strike exactly at cost basis shows guardrail warning
- AC5: Reject open CC when not in HOLDING_SHARES phase
- AC6: Reject open CC with missing required fields
- AC7: Reject CC with contracts exceeding shares held
- AC8: Reject fill date before assignment date
