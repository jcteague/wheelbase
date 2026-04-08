# Implementation Plan: US-12 — Roll Open CSP Out

## Summary

Implements the ability to roll an open CSP to a new expiration (same strike). The backend records an atomic ROLL_FROM/ROLL_TO leg pair linked by a shared `roll_chain_id`, recalculates cost basis, and keeps the position in `CSP_OPEN`. The frontend adds a right-side sheet with a live net credit/debit preview, form validation, and a success state.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/03-stories/US-12-roll-open-csp-out.md`
- **Research & Design Decisions:** `plans/us-12/research.md`
- **Data Model & Selection Logic:** `plans/us-12/data-model.md`
- **API Contract:** `plans/us-12/contracts/roll-csp.md`
- **Quickstart & Verification:** `plans/us-12/quickstart.md`
- **Mockup:** `mockups/us-12-13-roll-csp-form.mdx`

## Prerequisites

- US-1 through US-5: CSP lifecycle implemented (phase `CSP_OPEN`, cost basis snapshots, leg records)
- `roll_chain_id` column already exists in `legs` table (`migrations/001_initial_schema.sql`)
- `ROLL_FROM` and `ROLL_TO` values already exist in `LegRole` enum (`src/main/core/types.ts`)
- `calculateAssignmentBasis` in `costbasis.ts` already handles `ROLL_TO` in `LEG_ROLE_LABEL`

---

## Implementation Areas

### 1. Lifecycle Engine: `rollCsp`

**Files to create or modify:**
- `src/main/core/lifecycle.ts` — add `RollCspInput`, `RollCspResult`, `rollCsp` function
- `src/main/core/lifecycle.test.ts` — add test suite for `rollCsp`

**Red — tests to write:**
- `rollCsp` returns `{ phase: 'CSP_OPEN' }` when given a valid input (CSP_OPEN phase, new expiration later, positive amounts)
- `rollCsp` throws `ValidationError` with field `__phase__` / code `invalid_phase` when `currentPhase` is not `CSP_OPEN`
- `rollCsp` throws `ValidationError` with field `newExpiration` / code `must_be_after_current` when `newExpiration <= currentExpiration` (same date rejected, earlier date rejected)
- `rollCsp` throws `ValidationError` with field `costToClosePerContract` / code `must_be_positive` when value is `0`
- `rollCsp` throws `ValidationError` with field `newPremiumPerContract` / code `must_be_positive` when value is `0`

**Green — implementation:**
- Add `RollCspInput` interface: `{ currentPhase, currentExpiration, newExpiration, costToClosePerContract, newPremiumPerContract }`
- Add `RollCspResult` interface: `{ phase: 'CSP_OPEN' }`
- Add `rollCsp(input: RollCspInput): RollCspResult` — validates phase, expiration ordering, and positive amounts using existing `requirePositiveClosePrice` (renamed internal helper) and `requirePositivePremium` helpers
- For expiration: `if (input.newExpiration <= input.currentExpiration)` throw ValidationError

**Refactor — cleanup to consider:**
- Check if `requirePositiveClosePrice` should be renamed `requirePositiveAmount` to be reused; only refactor if it removes duplication cleanly

**Acceptance criteria covered:**
- "Roll form validates new expiration is later than current" (validation-error AC)
- "Roll form validates positive cost to close" (validation AC)
- "Roll form validates positive new premium" (validation AC)

---

### 2. Cost Basis Engine: `calculateRollBasis`

**Files to create or modify:**
- `src/main/core/costbasis.ts` — add `RollBasisInput`, `RollBasisResult`, `calculateRollBasis` function
- `src/main/core/costbasis.test.ts` — add test suite for `calculateRollBasis`

**Red — tests to write:**
- Net credit ($2.80 premium - $1.20 cost = $1.60): `basisPerShare` decreases by $1.60 from prev basis; `totalPremiumCollected` increases by $160.00 (1 contract)
- Net debit ($2.50 premium - $3.00 cost = -$0.50): `basisPerShare` increases by $0.50 from prev basis; `totalPremiumCollected` decreases by $50.00 (1 contract)
- Exact-match (premium equals cost, net zero): `basisPerShare` unchanged, `totalPremiumCollected` unchanged
- Multi-contract (2 contracts, $1.60 net credit): `basisPerShare` decreases by $1.60 (net is per-contract = per-share), `totalPremiumCollected` increases by $320.00

**Green — implementation:**
- Add `RollBasisInput`: `{ prevBasisPerShare: string; prevTotalPremiumCollected: string; costToClosePerContract: string; newPremiumPerContract: string; contracts: number }`
- Add `RollBasisResult`: `{ basisPerShare: string; totalPremiumCollected: string }`
- Add `calculateRollBasis(input: RollBasisInput): RollBasisResult`
  - `net = new Decimal(input.newPremiumPerContract).minus(input.costToClosePerContract)` (positive = credit)
  - `basisPerShare = round4(new Decimal(input.prevBasisPerShare).minus(net))`
  - `netTotal = net.times(sharesFromContracts(input.contracts))`
  - `totalPremiumCollected = round4(new Decimal(input.prevTotalPremiumCollected).plus(netTotal))`
  - Return both values `.toFixed(4)`

**Refactor — cleanup to consider:**
- Check for duplication with `calculateCcOpenBasis` — both reduce basis by a premium; extract shared pattern only if it produces genuinely cleaner code

**Acceptance criteria covered:**
- "Net credit/debit preview" — formula is validated here
- "New cost basis snapshot is created reflecting the roll's net credit"

---

### 3. Schema: `RollCspPayloadSchema`

**Files to create or modify:**
- `src/main/schemas.ts` — add `RollCspPayloadSchema`, `RollCspPayload` type, `RollCspResult` interface

**Red — tests to write:**
- (Schema validation is covered by service tests in area 4; no dedicated schema test file is needed)

**Green — implementation:**
- Add `RollCspPayloadSchema`:
  ```typescript
  z.object({
    positionId: PositionIdSchema,
    costToClosePerContract: z.number().positive(),
    newPremiumPerContract: z.number().positive(),
    newExpiration: z.string(),
    newStrike: z.number().positive().optional(),
    fillDate: z.string().optional()
  })
  ```
- Add `export type RollCspPayload = z.infer<typeof RollCspPayloadSchema>`
- Add `RollCspResult` interface with `position`, `rollFromLeg`, `rollToLeg`, `rollChainId`, `costBasisSnapshot` fields (see `plans/us-12/contracts/roll-csp.md`)

**Refactor — cleanup to consider:**
- Ensure field naming is consistent with existing payload schemas (camelCase throughout)

**Acceptance criteria covered:**
- All roll validation ACs (schema enforces positive numbers)

---

### 4. Service: `rollCspPosition`

**Files to create or modify:**
- `src/main/services/roll-csp-position.ts` — new file, standalone service
- `src/main/services/roll-csp-position.test.ts` — new test file, integration tests with in-memory SQLite

**Red — tests to write:**
- Happy path (net credit): creates ROLL_FROM leg (action=BUY, role=ROLL_FROM, same strike/expiration as current), creates ROLL_TO leg (action=SELL, role=ROLL_TO, new expiration, new premium), both share the same `roll_chain_id` UUID, new cost basis snapshot has lower `basisPerShare`, position phase stays `CSP_OPEN`
- Happy path (net debit): cost basis snapshot has higher `basisPerShare` than prev
- `rollCspPosition` throws `ValidationError` when position is not found
- `rollCspPosition` throws `ValidationError` when position has no active leg
- `rollCspPosition` throws `ValidationError` (from lifecycle) when new expiration is not after current expiration
- Returned `rollFromLeg` has: `legRole='ROLL_FROM'`, `action='BUY'`, `strike` = current CSP strike, `expiration` = current CSP expiration, `premiumPerContract` = costToClosePerContract formatted to 4dp
- Returned `rollToLeg` has: `legRole='ROLL_TO'`, `action='SELL'`, `strike` = newStrike (or current if omitted), `expiration` = newExpiration, `premiumPerContract` = newPremiumPerContract formatted to 4dp

**Green — implementation:**
- New file `src/main/services/roll-csp-position.ts`:
  1. `getPosition(db, positionId)` — throws if null or no active leg
  2. `rollCsp(...)` lifecycle call — throws on validation failure
  3. `calculateRollBasis(...)` — compute new basis
  4. `db.transaction(() => { ... })()` containing:
     - `INSERT INTO legs` for ROLL_FROM (BUY, strike=currentStrike, expiration=currentExpiration, roll_chain_id=shared UUID)
     - `INSERT INTO legs` for ROLL_TO (SELL, strike=newStrike??currentStrike, expiration=newExpiration, roll_chain_id=same UUID)
     - `INSERT INTO cost_basis_snapshots` with new basis values, `final_pnl=NULL`
     - Note: position row is NOT updated (phase stays CSP_OPEN, no closed_date)
  5. Return `{ position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }`
- `newStrike` defaults to current strike if omitted: `payload.newStrike ?? parseFloat(activeLeg.strike)`

**Refactor — cleanup to consider:**
- Compare INSERT statement structure to `close-csp-position.ts` — ensure consistent column ordering and formatting helpers

**Acceptance criteria covered:**
- "Successful CSP roll out creates linked leg pair" (linked ROLL_FROM/ROLL_TO, shared roll_chain_id, new snapshot, phase stays CSP_OPEN)

---

### 5. IPC Handler and Preload

**Files to create or modify:**
- `src/main/ipc/positions.ts` — register `positions:roll-csp` using `registerParsedPositionHandler`
- `src/preload/index.ts` — expose `rollCsp` method on `window.api`
- `src/main/ipc/positions.test.ts` — add test for `positions:roll-csp` handler

**Red — tests to write:**
- IPC handler returns `{ ok: true, position, rollFromLeg, rollToLeg, rollChainId, costBasisSnapshot }` on success
- IPC handler returns `{ ok: false, errors }` when service throws `ValidationError`
- IPC handler returns `{ ok: false, errors }` when Zod rejects malformed payload (e.g., missing `positionId`)

**Green — implementation:**
- In `positions.ts`, import `RollCspPayloadSchema` and `rollCspPosition`, then add:
  ```typescript
  registerParsedPositionHandler(
    db,
    'positions:roll-csp',
    'positions_roll_csp_unhandled_error',
    RollCspPayloadSchema,
    rollCspPosition
  )
  ```
- In `preload/index.ts`, add:
  ```typescript
  rollCsp: (payload: unknown) => invoke('positions:roll-csp', payload)
  ```

**Refactor — cleanup to consider:**
- Naming consistency with log label — follow `positions_{verb}_{noun}_unhandled_error` pattern

**Acceptance criteria covered:**
- All ACs (IPC is the transport for all backend ACs)

---

### 6. Renderer API Adapter

**Files to create or modify:**
- `src/renderer/src/api/positions.ts` — add `RollCspPayload`, `RollCspResponse` types, `rollCsp` adapter function
- Update `IPC_TO_FORM_FIELD` map with new field names

**Red — tests to write:**
- (Covered by RollCspSheet component tests in area 8 — no dedicated api.ts test needed)

**Green — implementation:**
- Add `RollCspPayload` type (snake_case fields: `position_id`, `cost_to_close_per_contract`, `new_premium_per_contract`, `new_expiration`, `new_strike?`, `fill_date?`)
- Add `RollCspResponse` type matching the IPC success response shape (see `plans/us-12/contracts/roll-csp.md`)
- Add `rollCsp(payload: RollCspPayload): Promise<RollCspResponse>` — maps snake_case to camelCase for IPC call, throws `apiError(400, ...)` on `ok: false`
- Extend `IPC_TO_FORM_FIELD` with: `costToClosePerContract: 'cost_to_close_per_contract'`, `newPremiumPerContract: 'new_premium_per_contract'`, `newExpiration: 'new_expiration'`

**Refactor — cleanup to consider:**
- Check for naming duplication with similar close/open payload adapters

**Acceptance criteria covered:**
- All ACs (adapter is the renderer↔IPC boundary)

---

### 7. React Hook: `useRollCsp`

**Files to create or modify:**
- `src/renderer/src/hooks/useRollCsp.ts` — new hook
- `src/renderer/src/hooks/useRollCsp.test.ts` — optional; pattern is identical to other hooks

**Red — tests to write:**
- (Pattern is covered by `useCloseCoveredCallEarly.test.ts` and similar; write a test only if the hook deviates from `usePositionMutation` pattern)

**Green — implementation:**
- New file `src/renderer/src/hooks/useRollCsp.ts`:
  ```typescript
  import type { RollCspPayload, RollCspResponse } from '../api/positions'
  import { rollCsp } from '../api/positions'
  import { usePositionMutation } from './usePositionMutation'

  export function useRollCsp(options?: {
    onSuccess?: (data: RollCspResponse) => void
  }): ReturnType<typeof usePositionMutation<RollCspResponse, RollCspPayload>> {
    return usePositionMutation<RollCspResponse, RollCspPayload>(rollCsp, options)
  }
  ```

**Refactor — cleanup to consider:**
- None expected; pattern is identical to existing hooks

**Acceptance criteria covered:**
- Enables the sheet to mutate and handle success/error

---

### 8. `RollCspSheet` Component

**Files to create or modify:**
- `src/renderer/src/components/RollCspSheet.tsx` — new component
- `src/renderer/src/components/RollCspSheet.test.tsx` — new test file

**Red — tests to write:**
- When `open=false`, renders nothing
- When `open=true`, renders "Roll Cash-Secured Put" title and "Roll Out" eyebrow label
- Current Leg section shows: ticker, strike, expiration, DTE, premium collected ($350.00 total), cost basis
- New Leg section shows fields: New Strike (pre-filled with current strike, editable), New Expiration (date picker), Cost to Close, New Premium (two-column grid), Fill Date
- Net credit preview appears (green) when cost to close $1.20, new premium $2.80 are entered: shows "+$1.60/contract ($160.00 total)"
- Net debit preview appears (amber) when cost to close $3.00, new premium $2.50 are entered: shows "-$0.50/contract ($50.00 total)" and warning text "This roll costs more to close than the new premium provides"
- Inline validation error "New expiration must be after the current expiration" appears on submit when new expiration is before current expiration
- Inline validation error "Cost to close must be greater than zero" on submit with $0.00
- Inline validation error "New premium must be greater than zero" on submit with $0.00
- On successful submit, success state shows green header "Roll Complete", net credit hero "+$1.60", summary card with ROLL_FROM/ROLL_TO leg details, cost basis before/after

**Green — implementation:**

Build `RollCspSheet.tsx` following the `ExpirationSheet` portal pattern (width 420px per mockup, `createPortal` to `document.body`):

- **Props**: `{ open, positionId, ticker, strike, expiration, contracts, premiumPerContract, basisPerShare, totalPremiumCollected, onClose }`
- **Form fields** (React Hook Form + inline Zod schema):
  - `newStrike`: number, pre-filled with current strike, editable
  - `newExpiration`: string (date), required; validated `> currentExpiration`
  - `costToClosePerContract`: number, positive
  - `newPremiumPerContract`: number, positive
  - `fillDate`: string (date), optional
- **NetCreditDebitPreview** (inline calculation, no IPC):
  - `net = newPremium - costToClose`
  - If `net >= 0`: green card, label "Net Credit", `+$N.NN/contract ($NNN.NN total)`
  - If `net < 0`: amber card, label "Net Debit", `-$N.NN/contract ($NNN.NN total)`, warning row "⚠ This roll costs more to close than the new premium provides"
  - Preview only appears when both values are entered and > 0
- **Roll type indicator badge**: below form, dynamic label `getRollTypeLabel(currentStrike, newStrike)` — "Roll Out" (same strike) or "Roll Down & Out" (lower) or "Roll Up & Out" (higher)
- **Irrevocable warning box**: amber, "This cannot be undone. A ROLL_FROM leg (buy-to-close) and ROLL_TO leg (sell-to-open) will be recorded as a linked pair. The position remains in CSP_OPEN phase."
- **Footer**: Cancel + Confirm Roll buttons
- **Success state** (set via `useRollCsp` `onSuccess`):
  - Header: green eyebrow "Roll Complete", title "CSP Rolled Successfully", subtitle shows old strike → new strike · new expiration
  - Green hero card: net credit/debit amount large font
  - Summary card: roll type badge, old leg (ROLL_FROM · BUY PUT $X @ $Y), new leg (ROLL_TO · SELL PUT $X @ $Y), new expiration with DTE, roll chain ID (truncated), phase (CSP_OPEN · unchanged), cost basis (before → after)
  - Info box: "New CSP expires {date} ({DTE} DTE). Your cost basis improved/changed by ${amount}/share."
  - No footer buttons in success state (user closes via × button or clicking scrim)

**Refactor — cleanup to consider:**
- Extract `NetCreditDebitPreview` as a separate component if over ~30 lines
- Check naming of sub-components against mockup conventions

**Acceptance criteria covered:**
- "Roll form shows current leg summary and new leg inputs" (form rendering AC)
- "Net credit/debit preview updates as trader enters values" (live preview AC)
- "Net debit preview shown with warning" (debit AC)
- "Roll form validates new expiration is later than current" (validation-error AC)
- "Roll form validates positive cost to close" (validation AC)
- "Roll form validates positive new premium" (validation AC)

---

### 9. Wire Up to Position Detail

**Files to create or modify:**
- `src/renderer/src/components/PositionDetailActions.tsx` — add "Roll CSP →" button for `CSP_OPEN` phase; add `onRollCsp` prop
- `src/renderer/src/components/PositionDetailActions.test.tsx` — add test for Roll CSP button
- `src/renderer/src/pages/PositionDetailPage.tsx` — add `rollCspOpen` state, import `RollCspSheet`, pass position data as props

**Red — tests to write:**
- `PositionDetailActions`: when `phase='CSP_OPEN'`, renders a button with `data-testid="roll-csp-btn"` and label "Roll CSP →"; clicking it calls `onRollCsp`
- `PositionDetailActions`: when `phase='HOLDING_SHARES'`, "Roll CSP →" button is not rendered

**Green — implementation:**
- In `PositionDetailActions.tsx`:
  - Add `onRollCsp: () => void` to `PositionDetailActionsProps`
  - Inside the `phase === 'CSP_OPEN'` block, add:
    ```tsx
    <ActionButton testId="roll-csp-btn" label="Roll CSP →" onClick={onRollCsp} />
    ```
- In `PositionDetailPage.tsx`:
  - Add `const [rollCspOpen, setRollCspOpen] = useState(false)`
  - Pass `onRollCsp={() => setRollCspOpen(true)}` to `PositionDetailActions`
  - Render `<RollCspSheet>` with all required props from `detail.activeLeg` and `detail.costBasisSnapshot`, `open={rollCspOpen}`, `onClose={() => setRollCspOpen(false)}`

**Refactor — cleanup to consider:**
- Check that the `overlayOpen` prop passed to `PositionDetailContent` includes `rollCspOpen` (to blur the background when the sheet is open)

**Acceptance criteria covered:**
- "When the trader opens the roll form for this position" (sheet accessible from position detail)
- "The trader is returned to the position detail page" (sheet closes on cancel/after success)

---

### 10. E2E Tests

**Files to create or modify:**
- `e2e/csp-roll.spec.ts` — new E2E spec

**Red — tests to write (one test per AC):**

- **AC: Roll form shows current leg summary and new leg inputs**
  Open a CSP_OPEN position, click "Roll CSP →", assert the sheet shows the current leg section (strike, expiration, premium) and new leg input fields (New Strike, New Expiration, Cost to Close, New Premium, Fill Date)

- **AC: Net credit/debit preview updates as trader enters values**
  Open roll form, enter cost to close $1.20 and new premium $2.80, assert the preview shows "Net Credit" text and "+$1.60/contract"

- **AC: Net debit preview shown with warning**
  Enter cost to close $3.00 and new premium $2.50, assert the preview shows "Net Debit" and the warning text "This roll costs more to close than the new premium provides" in amber

- **AC: Successful CSP roll out creates linked leg pair**
  Complete a roll with cost to close $1.20, new premium $2.80, new expiration 2026-05-16; assert success state appears with "CSP Rolled Successfully"; assert position detail still shows CSP_OPEN phase

- **AC: Roll form validates new expiration is later than current**
  Enter a new expiration earlier than the current expiration (e.g. 2026-04-11 vs current 2026-04-18), click Confirm Roll, assert validation error "New expiration must be after the current expiration" appears and roll is not submitted

- **AC: Roll form validates positive cost to close**
  Leave cost to close at $0.00 (or enter 0), click Confirm Roll, assert validation error "Cost to close must be greater than zero"

- **AC: Roll form validates positive new premium**
  Leave new premium at $0.00, click Confirm Roll, assert validation error "New premium must be greater than zero"

**Green — implementation:**
- Follow the pattern from `e2e/csp-flow.spec.ts` — launch Electron with a temp DB, create a CSP_OPEN position, navigate to position detail, interact with the roll sheet

**Refactor — cleanup to consider:**
- Extract shared "create a CSP_OPEN position" helper into `e2e/helpers.ts` if not already there

**Acceptance criteria covered:**
- All 7 Gherkin scenarios from US-12
