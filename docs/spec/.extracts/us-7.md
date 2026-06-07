---
plan: us-7
source: plans/us-7/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-7

## Summary

This story adds the ability to sell a covered call against shares held after CSP assignment, introducing the new lifecycle transition `HOLDING_SHARES → CC_OPEN`. A new `openCoveredCall()` lifecycle function validates phase, strike, premium, contracts (≤ shares held), and fill-date bounds (≥ assignment date, ≤ today); a new `calculateCcOpenBasis()` cost-basis function reduces `basis_per_share` by the CC premium and adds `premium × contracts × 100` to `total_premium_collected`. A new `positions:open-cc` IPC channel backed by `openCoveredCallPosition()` service writes a CC_OPEN/SELL/CALL leg, updates the position phase, and inserts a fresh cost-basis snapshot — all in one transaction. The renderer ships an `OpenCoveredCallSheet` right-side panel with an inline cost-basis guardrail that warns when strike ≤ basis (non-blocking, client-side only) and shows a profit preview when strike > basis. No DB migration is required. (Source: `plans/us-7/plan.md`)

## Architecture Decisions

### ADR: New lifecycle function `openCoveredCall()` instead of overloading an existing one

- **Decision:** Add a dedicated `openCoveredCall()` to `src/main/core/lifecycle.ts` following the `recordAssignment()` pattern — a pure state-machine function that validates phase + input constraints and returns `{ phase: 'CC_OPEN' }`.
- **Why:** The lifecycle engine is a pure state machine; each transition deserves its own named function. Consistent with the established pattern.
- **Alternatives considered:** None — the pattern is established.
- **Source:** `plans/us-7/research.md`

### ADR: Cost basis after CC open — separate function

- **Decision:** Add a dedicated `calculateCcOpenBasis()` to `src/main/core/costbasis.ts`. Formula: `newBasisPerShare = prevBasisPerShare − ccPremiumPerContract`; `newTotalPremium = prevTotal + (ccPremium × contracts × 100)`.
- **Why:** CC premium reduces basis because the trader receives a credit. A separate function keeps the engine open/closed — folding into `calculateAssignmentBasis()` would conflate two distinct events.
- **Alternatives considered:** Fold into `calculateAssignmentBasis()` — rejected as it conflates two distinct events.
- **Source:** `plans/us-7/research.md`

### ADR: Contracts validation lives in the service layer (not the lifecycle engine)

- **Decision:** Validate `contracts ≤ position.contracts` in the service layer by querying the ASSIGN leg's `contracts` from leg history. The lifecycle engine validates phase and date bounds only.
- **Why:** The ASSIGN leg is the source of truth for shares held. Putting contract-count validation in the engine would require passing position contract count as input, coupling the pure engine to DB query results. _(Note: the implemented plan in §1 actually passes `positionContracts` into `openCoveredCall()` and the engine throws `exceeds_shares` itself — the contract-count check moved into the engine while the assignment-leg lookup stayed in the service.)_
- **Alternatives considered:** Validate in the lifecycle engine directly.
- **Source:** `plans/us-7/research.md`, `plans/us-7/plan.md` §1

### ADR: Fill date validation in the lifecycle engine

- **Decision:** Validate `fillDate ≥ assignmentDate` (sourced from the ASSIGN leg's `fill_date`) and `fillDate ≤ referenceDate` (today). Both checks happen in the lifecycle engine as pure date string comparisons.
- **Why:** Follows the pattern of `openWheel()` (validates `fillDate ≤ referenceDate`) and `recordAssignment()` (validates `assignmentDate ≥ openFillDate`).
- **Alternatives considered:** None — consistent with existing patterns.
- **Source:** `plans/us-7/research.md`

### ADR: Cost basis guardrail is client-side only and non-blocking

- **Decision:** Implement the strike-vs-basis guardrail as a pure function (`computeGuardrail`) in the renderer. The Confirm button stays enabled regardless of warning state. No server-side validation.
- **Why:** The story explicitly states the guardrail is client-side and informational. This is a UX aid, not a business rule — the trader may have a deliberate reason to sell below basis.
- **Alternatives considered:** Shared utility / server validation — both rejected; it's a 10-line UI helper.
- **Source:** `plans/us-7/research.md`, `plans/us-7/data-model.md`

### ADR: No schema migration

- **Decision:** No migration. Reuse existing `legs`, `cost_basis_snapshots`, and `positions` tables. The schema was designed generically to support all leg types.
- **Why:** All required fields already exist (`leg_role`, `action`, `instrument_type`, `strike`, `expiration`, `contracts`, `premium_per_contract`, `fill_date`).
- **Alternatives considered:** None needed.
- **Source:** `plans/us-7/research.md`, `plans/us-7/data-model.md`, `plans/us-7/quickstart.md`

### ADR: Sheet component pattern — mirror `AssignmentSheet`

- **Decision:** Create `OpenCoveredCallSheet.tsx` as a portal-based right-side panel with a form-state → success-state transition, mirroring `AssignmentSheet.tsx`.
- **Why:** The mockup shows the same sheet pattern (right-side panel, header/body/footer, form fields, guardrail alert, success hero card).
- **Alternatives considered:** Modal — rejected; mockup explicitly shows a sheet.
- **Source:** `plans/us-7/research.md`

### ADR: Position detail page hosts the entry point

- **Decision:** Add a conditional "Open Covered Call →" button to `PositionDetailPage` header, visible only when `phase === 'HOLDING_SHARES'`. The page owns `openCcCtx` state populated from the position's basis-per-share, total-premium-collected, contracts, and assignment date.
- **Why:** Consistent with US-6 assignment entry point and the story's Technical Notes ("CC form appears in position detail header when phase = HOLDING_SHARES").
- **Source:** `plans/us-7/plan.md` §9

## Contracts

### `positions:open-cc`

- **Type:** IPC handler (renderer → main, invoke / request-response)
- **Shape:**

  ```typescript
  // Request payload (validated by OpenCcPayloadSchema)
  {
    positionId: string            // UUID
    strike: number                // positive
    expiration: string            // ISO date
    contracts: number             // positive integer
    premiumPerContract: number    // positive
    fillDate?: string             // ISO date; defaults to today
  }

  // Success response
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'CC_OPEN'
      status: 'ACTIVE'
      closedDate: null
    },
    leg: {
      id: string
      positionId: string
      legRole: 'CC_OPEN'
      action: 'SELL'
      instrumentType: 'CALL'
      strike: string               // e.g. "182.0000"
      expiration: string           // ISO date
      contracts: number
      premiumPerContract: string   // e.g. "2.3000"
      fillPrice: null
      fillDate: string             // ISO date
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string        // e.g. "174.2000"
      totalPremiumCollected: string // e.g. "460.0000"
      finalPnl: null
      snapshotAt: string
      createdAt: string
    }
  }

  // Error response
  { ok: false, errors: [{ field: string, code: string, message: string }] }
  ```

  Known error codes:
  | field | code | message |
  | -------------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
  | `__phase__` | `invalid_phase` | "Position is not in HOLDING_SHARES phase" or "A covered call is already open on this position" |
  | `contracts` | `exceeds_shares` | "Contracts cannot exceed shares held ({n})" |
  | `fillDate` | `before_assignment` | "Fill date cannot be before the assignment date" |
  | `fillDate` | `cannot_be_future` | "Fill date cannot be in the future" |
  | `strike` | `must_be_positive` | "Strike must be positive" |
  | `premiumPerContract` | `must_be_positive` | "Premium per contract must be positive" |

- **Source:** `plans/us-7/contracts/open-cc.md`, `plans/us-7/plan.md` §5
- **Implementation:** `src/main/ipc/positions.ts`, `src/main/services/open-covered-call-position.ts`

### `OpenCcPayloadSchema`

- **Type:** Zod schema
- **Shape:**
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
  ```
- **Source:** `plans/us-7/plan.md` §3, `plans/us-7/contracts/open-cc.md`
- **Implementation:** `src/main/schemas.ts`

### `OpenCcPositionResult`

- **Type:** other (IPC return type definition)
- **Shape:**
  ```typescript
  export interface OpenCcPositionResult {
    position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE'; closedDate: null }
    leg: LegRecord
    costBasisSnapshot: CostBasisSnapshotRecord
  }
  ```
- **Source:** `plans/us-7/plan.md` §3
- **Implementation:** `src/main/schemas.ts`

### `OpenCoveredCallInput` / `OpenCoveredCallResult` (lifecycle engine)

- **Type:** other (core lifecycle function signature)
- **Shape:**

  ```typescript
  OpenCoveredCallInput {
    currentPhase: WheelPhase
    strike: string
    contracts: number
    positionContracts: number
    premiumPerContract: string
    fillDate: string
    assignmentDate: string
    referenceDate: string
    expiration: string
  }

  OpenCoveredCallResult {
    phase: 'CC_OPEN'
  }
  ```

  Engine throws `ValidationError` with one of: `__phase__` / `invalid_phase`, `contracts` / `exceeds_shares`, `fillDate` / `before_assignment`, `fillDate` / `cannot_be_future`, `strike` / `must_be_positive`, `premiumPerContract` / `must_be_positive`.

- **Source:** `plans/us-7/plan.md` §1, `plans/us-7/data-model.md`
- **Implementation:** `src/main/core/lifecycle.ts`

### `CcOpenBasisInput` / `CcOpenBasisResult` (cost basis engine)

- **Type:** other (core cost basis function signature)
- **Shape:**

  ```typescript
  CcOpenBasisInput {
    prevBasisPerShare: string
    prevTotalPremiumCollected: string
    ccPremiumPerContract: string
    contracts: number
  }

  CcOpenBasisResult {
    basisPerShare: string           // 4 dp
    totalPremiumCollected: string   // 4 dp
  }
  ```

  Formula: `basisPerShare = round4(prevBasisPerShare − ccPremiumPerContract)`; `totalPremiumCollected = round4(prevTotal + ccPremium × contracts × 100)`. Uses `decimal.js` with `ROUND_HALF_UP` via existing `round4` helper.

- **Source:** `plans/us-7/plan.md` §2, `plans/us-7/data-model.md`
- **Implementation:** `src/main/core/costbasis.ts`

### Preload bridge addition

- **Type:** other (preload contextBridge API)
- **Shape:**
  ```typescript
  openCoveredCall: (payload: unknown) => ipcRenderer.invoke('positions:open-cc', payload)
  ```
- **Source:** `plans/us-7/plan.md` §6, `plans/us-7/contracts/open-cc.md`
- **Implementation:** `src/preload/index.ts`

### Renderer `OpenCcPayload` / `OpenCcResponse`

- **Type:** other (renderer adapter types — snake_case payload)
- **Shape:**

  ```typescript
  export type OpenCcPayload = {
    position_id: string
    strike: number
    expiration: string
    contracts: number
    premium_per_contract: number
    fill_date?: string
  }

  export type OpenCcResponse = {
    position: PositionData
    leg: LegData & {
      positionId: string
      legRole: string
      action: string
      instrumentType: string
      premiumPerContract: string
      fillPrice: null
      fillDate: string
      createdAt: string
      updatedAt: string
    }
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: null
      snapshotAt: string
      createdAt: string
    }
  }
  ```

- **Source:** `plans/us-7/contracts/open-cc.md`, `plans/us-7/plan.md` §6
- **Implementation:** `src/renderer/src/api/positions.ts`

### Renderer API adapter snake_case ↔ camelCase mapping

- **Type:** other (renderer adapter mapping)
- **Shape:**

  ```
  openCoveredCall payload (renderer snake_case -> IPC camelCase):
    position_id           -> positionId
    strike                -> strike
    expiration            -> expiration
    contracts             -> contracts
    premium_per_contract  -> premiumPerContract
    fill_date             -> fillDate

  Error field mapping (IPC -> form):
    strike                -> strike
    premiumPerContract    -> premium_per_contract
    fillDate              -> fill_date
  ```

- **Source:** `plans/us-7/plan.md` §6
- **Implementation:** `src/renderer/src/api/positions.ts` (`IPC_TO_FORM_FIELD`)

### `useOpenCoveredCall` mutation hook

- **Type:** other (renderer TanStack Query mutation hook)
- **Shape:**
  ```typescript
  useOpenCoveredCall(options?: { onSuccess?: (data: OpenCcResponse) => void }):
    useMutation<OpenCcResponse, ApiError, OpenCcPayload>
  ```
  Invalidates `positionQueryKeys.all` on success; forwards optional `onSuccess` callback (used by the sheet to transition to its success state).
- **Source:** `plans/us-7/plan.md` §7
- **Implementation:** `src/renderer/src/hooks/useOpenCoveredCall.ts`

### Guardrail pure function (renderer)

- **Type:** other (renderer pure helper)
- **Shape:**
  ```typescript
  function computeGuardrail(
    strike: string,
    basis: string
  ): { type: 'below' | 'at' | 'above'; message: string } | null
  ```
  Returns:
  - `strike > basis` → `type: 'above'`, info message "Shares called away at ${strike} → profit of ${diff}/share" (info AlertBox)
  - `strike == basis` → `type: 'at'`, warning "This strike is at your cost basis — you would break even if called away"
  - `strike < basis` → `type: 'below'`, warning "This strike is below your cost basis — you would lock in a loss of ${diff}/share if called away"
    Confirm button stays enabled in all three cases.
- **Source:** `plans/us-7/plan.md` §8, `plans/us-7/data-model.md`, `plans/us-7/refactor-phase-results.md` §2
- **Implementation:** `src/renderer/src/components/openCcGuardrail.ts` (extracted during refactor)

## Schema Changes

### No new tables, columns, or migrations

- **Change:** none — existing schema fully supports CC open. No migration required. Reuses `legs`, `cost_basis_snapshots`, and `positions` as designed.
- **Source:** `plans/us-7/data-model.md`, `plans/us-7/research.md`, `plans/us-7/quickstart.md`

### `legs` row INSERT — CC open leg

- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field | Value |
  | ---------------------- | ------------------------------------------------ |
  | `id` | new UUID |
  | `position_id` | FK → parent HOLDING_SHARES position |
  | `leg_role` | `'CC_OPEN'` |
  | `action` | `'SELL'` |
  | `instrument_type` | `'CALL'` |
  | `strike` | CC strike price (4 dp TEXT) |
  | `expiration` | CC expiration date (ISO string) |
  | `contracts` | Integer, must be ≤ ASSIGN leg's contracts |
  | `premium_per_contract` | Credit received per share (4 dp TEXT) |
  | `fill_price` | `null` (manual entry) |
  | `fill_date` | CC fill date (ISO string) |
- **Source:** `plans/us-7/data-model.md`
- **Migration file:** none

### `cost_basis_snapshots` row INSERT — post-CC-open snapshot

- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field | Value |
  | ------------------------- | -------------------------------------------------------------- |
  | `id` | new UUID |
  | `position_id` | FK → parent position |
  | `basis_per_share` | `prevBasisPerShare − ccPremiumPerContract` (4 dp TEXT) |
  | `total_premium_collected` | `prevTotal + (ccPremium × contracts × 100)` (4 dp TEXT) |
  | `final_pnl` | `null` (position still open) |
  | `snapshot_at` | now (ISO timestamp) |
- **Source:** `plans/us-7/data-model.md`
- **Migration file:** none

### `positions` row UPDATE on CC open

- **Change:** altered row (no schema change)
- **Columns / fields:**
  | Field | Before CC open | After CC open |
  | ------------ | ----------------- | ----------------- |
  | `phase` | `HOLDING_SHARES` | `CC_OPEN` |
  | `updated_at` | prior timestamp | now |
- **Source:** `plans/us-7/data-model.md`
- **Migration file:** none

## Acceptance Criteria

- Scenario: Successfully open a covered call above cost basis
  - Given the trader has a HOLDING_SHARES position on AAPL with effective cost basis $176.50 per share and holds 100 shares (1 contract assigned)
  - When the trader enters strike $182.00, expiration 2026-02-21, premium $2.30, 1 contract, fill date 2026-01-20 and submits
  - Then the position phase changes to CC_OPEN
  - And a CC_OPEN leg is recorded with strike $182.00 and premium $2.30
  - And the effective cost basis updates to $174.20 per share ($176.50 − $2.30)
  - And the total premium collected increases by $230.00
- Scenario: Strike above cost basis shows no warning
  - Given the trader enters strike $182.00 (above the $176.50 cost basis)
  - Then no warning is shown
  - And a note reads "Shares called away at $182.00 → profit of $5.50/share"
- Scenario: Strike at or below cost basis shows guardrail warning
  - Given the trader enters strike $174.00 (below the $176.50 cost basis)
  - Then a gold warning appears: "This strike is below your cost basis — you would lock in a loss of $2.50/share if called away"
  - And the Confirm button remains enabled (warning is non-blocking)
- Scenario: Strike exactly at cost basis shows guardrail warning
  - Given the trader enters strike $176.50 (equal to the $176.50 cost basis)
  - Then a gold warning appears: "This strike is at your cost basis — you would break even if called away"
- Scenario: Reject open CC when not in HOLDING_SHARES phase
  - Given the position is in CC_OPEN phase
  - When the trader attempts to open a new covered call
  - Then the action is rejected with message "A covered call is already open on this position"
- Scenario: Reject open CC when position is WHEEL_COMPLETE
  - Given the position is in WHEEL_COMPLETE phase
  - When the trader attempts to open a new covered call
  - Then the action is rejected with message "This position is closed"
- Scenario: Reject open CC with missing required fields
  - Given the open CC form is submitted without a strike
  - Then a validation error appears: "Strike is required"
  - And no leg is created
- Scenario: Reject CC with contracts exceeding shares held
  - Given the trader holds 100 shares (assigned from 1 CSP contract)
  - When the trader enters contracts as 2
  - Then a validation error appears: "Contracts cannot exceed shares held (1)"
- Scenario: Open CC covering fewer contracts than shares held (intentional partial coverage)
  - Given the trader holds 200 shares (assigned from 2 CSP contracts)
  - When the trader enters contracts as 1
  - Then the leg is accepted and the position transitions to CC_OPEN
  - And a notice reads: "1 of 2 contracts covered — 100 shares uncovered"
- Scenario: Reject fill date before assignment date
  - Given the position was assigned on 2026-01-17 (the ASSIGN leg's fillDate)
  - When the trader enters fill date 2026-01-16
  - Then a validation error appears: "Fill date cannot be before the assignment date"
- Scenario: Fill date in the future shows soft warning but does not block submission
  - Given the trader enters a fill date of tomorrow
  - Then a gold warning appears: "This date is in the future — are you sure?"
  - And the Confirm button remains enabled
- Scenario: Expiration date in the past is rejected
  - Given the trader enters an expiration date that has already passed
  - Then a validation error appears: "Expiration date must be in the future"
  - And the Confirm button is disabled
- Scenario: Zero premium shows soft warning but does not block submission
  - Given the trader enters premium as $0.00
  - Then a gold warning appears: "Premium is $0.00 — are you sure?"
  - And the Confirm button remains enabled

(Source: `docs/epics/02-stories/US-7-open-covered-call.md`)

## Decisions & Tradeoffs

- The ASSIGN leg's `fill_date` is the source of truth for "assignment date" used in fill-date validation — not the position record. (Source: `plans/us-7/research.md`, `docs/epics/02-stories/US-7-open-covered-call.md` Technical Notes)
- The ASSIGN leg's `contracts` is the source of truth for shares held when validating CC contracts. (Source: `plans/us-7/research.md`, `docs/epics/02-stories/US-7-open-covered-call.md` Technical Notes)
- Partial coverage (`ccContracts < assignLeg.contracts`) is allowed with a UI notice — not blocked. (Source: `docs/epics/02-stories/US-7-open-covered-call.md` Technical Notes)
- Future fill dates are a soft warning only, mirroring US-6 assignment-date behaviour. (Source: `docs/epics/02-stories/US-7-open-covered-call.md` Technical Notes)
- Cost basis math uses `decimal.js` with `ROUND_HALF_UP` and 4 dp precision via the existing `round4` helper. (Source: `plans/us-7/research.md`)
- `fillDate` defaults to today when omitted from the IPC payload (handled by the service). (Source: `plans/us-7/plan.md` §4)
- The CC_OPEN leg sets `fill_price: null` because manual entry has no separate fill-price-vs-premium distinction. (Source: `plans/us-7/data-model.md`)
- The new cost-basis snapshot's `final_pnl` is `null` — the position is still open. (Source: `plans/us-7/data-model.md`)
- `LegRole: CC_OPEN`, `LegAction: SELL`, `InstrumentType: CALL` enum values already exist in `src/main/core/types.ts` — no new types needed. (Source: `plans/us-7/research.md`, `plans/us-7/plan.md` Prerequisites)
- Guardrail variant mapping: `type === 'above'` → `AlertBox variant="info"`; `type === 'at' | 'below'` → `AlertBox variant="warning"`. (Source: `plans/us-7/plan.md` §8)
- Profit-preview formula (success-state hero): `(strike − basisPerShare) × sharesHeld` shown per-share and total (e.g. "$5.50/share · $550 total"). (Source: `docs/epics/02-stories/US-7-open-covered-call.md` Technical Notes)
- The IPC handler uses the shared `handleIpcCall('positions_open_cc_unhandled_error', ...)` wrapper introduced by earlier stories — consistent with `positions:create`, `positions:close-csp`, etc. (Source: `plans/us-7/plan.md` §5)
- No isolated IPC, preload, hook, or component unit tests for the sheet flow — coverage is provided by service-layer integration tests + e2e tests, mirroring the US-4 testing strategy. (Source: `plans/us-7/plan.md` §5–§8)
- E2E spec includes 8 scenarios mapped 1:1 to ACs; reuses `launchFreshApp()`, `openPosition()`, `selectDate()`, `openDetailFor()` helpers, and adds an `assignPosition()` plus `openCcSheet()` helper. (Source: `plans/us-7/plan.md` §10)

Refactor-phase decisions (authoritative; `plans/us-7/refactor-phase-results.md`):

- **Extracted shared validators in `lifecycle.ts`** — `requirePositiveStrike(strike)` and `requirePositivePremium(premiumPerContract)` extracted as private helpers used by both `openWheel()` and `openCoveredCall()` to remove duplicated 4-line validation blocks.
- **Split oversized `OpenCoveredCallSheet.tsx`** (was 649 lines, far exceeding the ~200-line file size limit) into four files plus a guardrail module:
  - `OpenCoveredCallSheet.tsx` — 104 lines, orchestrator only (state, submit handler, portal render)
  - `OpenCcSheetHeader.tsx` — 65 lines, reusable panel header with eyebrow/title/close button
  - `OpenCcForm.tsx` — 205 lines, form component (imports from guardrail module)
  - `OpenCcSuccess.tsx` — 175 lines, success state with `StatBox` private sub-component
  - `openCcGuardrail.ts` — 27 lines, pure `computeGuardrail` function and `GuardrailResult` type (extracted to satisfy `react-refresh/only-export-components` lint rule)
- **Investigated `calculateInitialCspBasis()` `.toString()` vs `.toFixed(4)` inconsistency** — confirmed intentional: tests expect compact output (`'146.5'`, `'350'`) while downstream assignment/CC functions explicitly test for 4dp precision. No change made.
- **Test execution after refactor:** 37 test files, 308 tests passing; `pnpm test`, `pnpm lint`, `pnpm typecheck` all clean.
- **Automated `code-simplifier` run failed** (rate limit) — reverted to manual refactoring above.

## Source Code References

Files this plan introduced or modified (verified to exist on disk; one path from the refactor results — `src/renderer/src/components/OpenCcSheetHeader.tsx` — was not found at the filesystem check time and appears to have been consolidated or renamed in a later commit):

- `src/main/core/lifecycle.ts` — added `OpenCoveredCallInput`, `OpenCoveredCallResult`, `openCoveredCall()`; added `requirePositiveStrike` / `requirePositivePremium` helpers (refactor).
- `src/main/core/lifecycle.test.ts` — added `describe('openCoveredCall')` test suite.
- `src/main/core/costbasis.ts` — added `CcOpenBasisInput`, `CcOpenBasisResult`, `calculateCcOpenBasis()`.
- `src/main/core/costbasis.test.ts` — added `describe('calculateCcOpenBasis')` test suite.
- `src/main/schemas.ts` — added `OpenCcPayloadSchema`, `OpenCcPayload`, `OpenCcPositionResult`.
- `src/main/services/open-covered-call-position.ts` — new service following `assign-csp-position.ts` pattern.
- `src/main/services/open-covered-call-position.test.ts` — new integration test file.
- `src/main/services/positions.ts` — re-exports `openCoveredCallPosition`.
- `src/main/ipc/positions.ts` — added `positions:open-cc` handler using shared `handleIpcCall` wrapper.
- `src/preload/index.ts` — added `openCoveredCall` to `window.api`.
- `src/renderer/src/api/positions.ts` — added `OpenCcPayload`, `OpenCcResponse` types, `openCoveredCall()` adapter; extended `IPC_TO_FORM_FIELD` map.
- `src/renderer/src/hooks/useOpenCoveredCall.ts` — new TanStack Query mutation hook.
- `src/renderer/src/components/OpenCoveredCallSheet.tsx` — orchestrator (post-refactor, 104 lines).
- `src/renderer/src/components/OpenCcForm.tsx` — form sub-component (post-refactor).
- `src/renderer/src/components/OpenCcForm.test.tsx`.
- `src/renderer/src/components/OpenCcSuccess.tsx` — success-state sub-component (post-refactor).
- `src/renderer/src/components/OpenCcSuccess.test.tsx`.
- `src/renderer/src/components/openCcGuardrail.ts` — pure `computeGuardrail` + `GuardrailResult` type (post-refactor).
- `src/renderer/src/components/openCcGuardrail.test.ts`.
- `src/renderer/src/pages/PositionDetailPage.tsx` — added HOLDING_SHARES "Open Covered Call →" button, `openCcCtx` state, sheet render.
- `e2e/open-covered-call.spec.ts` — 8 e2e tests, one per AC.

Plan-mentioned path not present at filesystem check (likely consolidated by a later commit; not verified beyond the check):

- `src/renderer/src/components/OpenCcSheetHeader.tsx` (named in `plans/us-7/refactor-phase-results.md` §2 as a 65-line extracted file).

## Open Questions

None recorded. The refactor-phase results report all 308 tests passing with clean lint/typecheck. (Source: `plans/us-7/refactor-phase-results.md`)

Deferred / out of scope (noted in story, not unresolved): selling CCs against shares acquired through purchase (Phase 2+), live bid/ask price feed via Alpaca (Epic 06), strike/expiration suggestions via Greeks (Epic 07), rolling the CC (Epic 03 / US-14), PMCC short call entry (Epic 09). (Source: `docs/epics/02-stories/US-7-open-covered-call.md`)
