---
plan: us-8
source: plans/us-8/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-8

## Summary

This story adds buy-to-close functionality for an open covered call, introducing the lifecycle transition `CC_OPEN → HOLDING_SHARES`. A new `closeCoveredCall()` lifecycle function validates phase plus close-price positivity and fill-date bounds (`>=` CC open fill date, `<=` CC expiration); a new `calculateCcClose()` cost-basis function returns the CC leg P&L as `(openPremium − closePrice) × contracts × 100` to 4 dp. A new `positions:close-cc-early` IPC channel backed by `closeCoveredCallPosition()` service inserts a single `CC_CLOSE` / `BUY` / `CALL` leg (copying strike/expiration/contracts from the active `CC_OPEN` leg, premium set to the close price), updates the position phase to `HOLDING_SHARES`, and **does not** create a new cost-basis snapshot — the existing CC_OPEN snapshot is left unchanged. The renderer ships a `CloseCcEarlySheet` right-side panel that mirrors `OpenCoveredCallSheet`: a live `CcPnlPreview` ("X% of max" for profit, "X% above open" for loss, "$0.00 break-even" when equal), an irrevocable-warning `AlertBox`, and a success state with a `+$X.XX`/`−$X.XX`hero card and a "Sell New Covered Call on {ticker} →" CTA. No DB migration is required. (Source:`plans/us-8/plan.md`, `plans/us-8/research.md`)

## Architecture Decisions

### ADR: New lifecycle function `closeCoveredCall()` (own state-machine function)

- **Decision:** Add a dedicated `closeCoveredCall()` to `src/main/core/lifecycle.ts` that validates `currentPhase === 'CC_OPEN'`, positive close price, and fill-date bounds, and returns `{ phase: 'HOLDING_SHARES' }`.
- **Why:** The lifecycle engine is a pure state machine; each transition deserves its own named function. Consistent with `closeCsp()`, `recordAssignment()`, `openCoveredCall()`.
- **Alternatives considered:** None — established pattern.
- **Source:** `plans/us-8/research.md`, `plans/us-8/plan.md` §1

### ADR: No new cost-basis snapshot on CC close

- **Decision:** Do **not** insert a new `cost_basis_snapshots` row when closing the CC early. The existing CC_OPEN snapshot remains the current snapshot.
- **Why:** The CC_OPEN snapshot already reflects the CC premium reduction; closing the CC does not reverse that. The wheel is still ACTIVE and no final P&L exists for the position.
- **Alternatives considered:** Creating a snapshot with `final_pnl` for the CC leg (as in CSP close) — rejected; would be incorrect for a still-open wheel.
- **Source:** `plans/us-8/research.md`, `plans/us-8/data-model.md`, `docs/epics/02-stories/US-8-close-covered-call-early.md` Technical Notes

### ADR: Dedicated `calculateCcClose()` instead of reusing `calculateCspClose()`

- **Decision:** Add a separate `calculateCcClose()` to `src/main/core/costbasis.ts`. Formula: `(openPremium − closePrice) × contracts × 100`, 4 dp, `ROUND_HALF_UP`.
- **Why:** The formula is identical to `calculateCspClose()`, but a named `calculateCcClose` clearly communicates domain intent. Keeps the engine open/closed.
- **Alternatives considered:** Reuse `calculateCspClose` directly — rejected for domain clarity.
- **Source:** `plans/us-8/research.md`, `plans/us-8/plan.md` §2

### ADR: `ccLegPnl` returned in IPC response, not persisted

- **Decision:** Compute `ccLegPnl` in the service and return it on the IPC envelope. Do not add a column to any table.
- **Why:** P&L is derivable from leg data at any time; the renderer needs it for the success hero card. Avoids schema bloat.
- **Alternatives considered:** Add a `cc_leg_pnl` column — rejected; redundant with leg history.
- **Source:** `plans/us-8/research.md`, `plans/us-8/data-model.md`

### ADR: Fill-date validation bounds (lifecycle engine)

- **Decision:** Validate `fillDate >= CC_OPEN leg fillDate` AND `fillDate <= CC expiration` in `closeCoveredCall()`. Both are pure date-string comparisons.
- **Why:** The story specifies exactly these two date error cases. Future dates are implicitly rejected via referenceDate consistency with other lifecycle functions (story Technical Notes also list `<= today` as a requirement, though the engine itself enforces only the two named bounds).
- **Alternatives considered:** Bounding only one side — insufficient per ACs.
- **Source:** `plans/us-8/research.md`, `plans/us-8/data-model.md`, `docs/epics/02-stories/US-8-close-covered-call-early.md`

### ADR: P&L preview display logic (renderer)

- **Decision:** Show `+$X.XX profit · Y.Y% of max` (green) when `closePrice < openPremium`; `−$X.XX loss · Y.Y% above open` (red) when `closePrice > openPremium`; `$0.00 break-even` (neutral) when equal; render nothing when close price is empty or `<= 0`.
- **Why:** Directly from the story Technical Notes; the mockup `MockPnlPreview` confirms the pattern.
- **Alternatives considered:** Always show percentage — not aligned with story spec.
- **Source:** `plans/us-8/research.md`, `plans/us-8/data-model.md`

### ADR: No schema migration

- **Decision:** No migration. Reuse existing `legs` and `positions` tables.
- **Why:** `legs` already supports `CC_CLOSE` leg role and `BUY` action; `positions` already supports `HOLDING_SHARES` phase.
- **Alternatives considered:** None needed.
- **Source:** `plans/us-8/research.md`, `plans/us-8/data-model.md`, `plans/us-8/quickstart.md`

### ADR: Sheet component pattern — mirror `OpenCoveredCallSheet`

- **Decision:** Build the renderer flow as `CloseCcEarlySheet` (portal orchestrator) + `CloseCcEarlyForm` (form body) + `CloseCcEarlySuccess` (success state), plus a dedicated `CcPnlPreview` UI component.
- **Why:** Existing sheets (`OpenCoveredCallSheet`, `AssignmentSheet`, `ExpirationSheet`) all use `createPortal` with a fixed right-panel overlay; the mockup uses the same layout.
- **Alternatives considered:** shadcn Sheet primitive — rejected as inconsistent with the established custom portal pattern.
- **Source:** `plans/us-8/research.md`, `plans/us-8/plan.md` §10

### ADR: Reuse existing `CC_CLOSE` LegRole

- **Decision:** Use the existing `'CC_CLOSE'` value already in the `LegRole` enum (`src/main/core/types.ts`).
- **Why:** The enum already contains the value — no schema or migration change needed.
- **Alternatives considered:** Adding a new role — not needed.
- **Source:** `plans/us-8/research.md`

## Contracts

### `positions:close-cc-early`

- **Type:** IPC handler (renderer → main, invoke / request-response)
- **Shape:**

  ```typescript
  // Request payload (validated by CloseCcPayloadSchema)
  {
    positionId: string             // UUID
    closePricePerContract: number  // positive
    fillDate?: string              // YYYY-MM-DD; defaults to today
  }

  // Success response
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
    },
    leg: {                        // the new CC_CLOSE leg
      id: string
      positionId: string
      legRole: 'CC_CLOSE'
      action: 'BUY'
      instrumentType: 'CALL'
      strike: string              // copied from CC_OPEN leg, e.g. "182.0000"
      expiration: string          // copied from CC_OPEN leg
      contracts: number           // copied from CC_OPEN leg
      premiumPerContract: string  // closePricePerContract (4 dp), e.g. "1.1000"
      fillPrice: string           // same as premiumPerContract
      fillDate: string            // payload.fillDate or today
      createdAt: string
      updatedAt: string
    },
    ccLegPnl: string              // Decimal string, 4 dp, e.g. "120.0000" or "-120.0000"
  }

  // Error response
  { ok: false, errors: [{ field: string, code: string, message: string }] }
  ```

  Known error codes:
  | field | code | message |
  | ----------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
  | `__phase__` | `invalid_phase` | "No open covered call on this position" |
  | `closePricePerContract` | `must_be_positive` | "Close price must be greater than zero" |
  | `fillDate` | `close_date_before_open` | "Fill date cannot be before the CC open date" |
  | `fillDate` | `close_date_after_expiration` | "Fill date cannot be after the CC expiration date — use Record Expiry instead" |
  | `__root__` | `not_found` | "Position not found" |
  | `__root__` | `internal_error` | "An unexpected error occurred" |

- **Source:** `plans/us-8/contracts/positions-close-cc.md`, `plans/us-8/plan.md` §5
- **Implementation:** `src/main/ipc/positions.ts`, `src/main/services/close-covered-call-position.ts`

### `CloseCcPayloadSchema`

- **Type:** Zod schema
- **Shape:**
  ```typescript
  export const CloseCcPayloadSchema = z.object({
    positionId: z.string().uuid(),
    closePricePerContract: z.number().positive(),
    fillDate: z.string().optional() // YYYY-MM-DD; defaults to today
  })
  export type CloseCcPayload = z.infer<typeof CloseCcPayloadSchema>
  ```
- **Source:** `plans/us-8/plan.md` §3, `plans/us-8/contracts/positions-close-cc.md`
- **Implementation:** `src/main/schemas.ts`

### `CloseCcPositionResult`

- **Type:** other (IPC return type definition)
- **Shape:**
  ```typescript
  export interface CloseCcPositionResult {
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
    }
    leg: LegRecord // the new CC_CLOSE leg
    ccLegPnl: string // Decimal string, 4 dp
  }
  ```
- **Source:** `plans/us-8/plan.md` §3, `plans/us-8/contracts/positions-close-cc.md`
- **Implementation:** `src/main/schemas.ts`

### `CloseCoveredCallInput` / `CloseCoveredCallResult` (lifecycle engine)

- **Type:** other (core lifecycle function signature)
- **Shape:**

  ```typescript
  CloseCoveredCallInput {
    currentPhase: WheelPhase
    closePricePerContract: string
    openFillDate: string      // CC_OPEN leg fillDate
    fillDate: string          // payload (or today)
    expiration: string        // CC_OPEN leg expiration
  }

  CloseCoveredCallResult {
    phase: 'HOLDING_SHARES'
  }
  ```

  Engine throws `ValidationError` with one of: `__phase__` / `invalid_phase`, `closePricePerContract` / `must_be_positive`, `fillDate` / `close_date_before_open`, `fillDate` / `close_date_after_expiration`.

- **Source:** `plans/us-8/plan.md` §1, `plans/us-8/data-model.md`
- **Implementation:** `src/main/core/lifecycle.ts`

### `CcCloseInput` / `CcCloseResult` (cost basis engine)

- **Type:** other (core cost basis function signature)
- **Shape:**

  ```typescript
  CcCloseInput {
    openPremiumPerContract: string
    closePricePerContract: string
    contracts: number
  }

  CcCloseResult {
    ccLegPnl: string         // 4 dp, e.g. "120.0000" or "-120.0000"
  }
  ```

  Formula: `ccLegPnl = round4((openPremium − closePrice) × contracts × 100)` via `decimal.js` with `ROUND_HALF_UP`.

- **Source:** `plans/us-8/plan.md` §2, `plans/us-8/data-model.md`
- **Implementation:** `src/main/core/costbasis.ts`

### Preload bridge addition

- **Type:** other (preload contextBridge API)
- **Shape:**
  ```typescript
  closeCoveredCallEarly: (payload: unknown) =>
    ipcRenderer.invoke('positions:close-cc-early', payload)
  ```
  Typed against `IpcCloseCcPayload { positionId: string; closePricePerContract: number; fillDate?: string }` in `src/preload/index.d.ts`.
- **Source:** `plans/us-8/plan.md` §6, `plans/us-8/green-phase-results.md`
- **Implementation:** `src/preload/index.ts`, `src/preload/index.d.ts`

### Renderer `CloseCcPayload` / `CloseCcResponse`

- **Type:** other (renderer adapter types — snake_case payload)
- **Shape:**

  ```typescript
  export type CloseCcPayload = {
    position_id: string
    close_price_per_contract: number
    fill_date?: string
  }

  export type CloseCcResponse = {
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
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
    ccLegPnl: string
  }
  ```

  Adapter `closeCoveredCallEarly(payload)` maps snake_case → camelCase before calling `window.api.closeCoveredCallEarly(...)`; throws `apiError(400, ...)` with `mapIpcErrors(result.errors)` on `{ ok: false }`.

- **Source:** `plans/us-8/plan.md` §7, `plans/us-8/contracts/positions-close-cc.md`
- **Implementation:** `src/renderer/src/api/positions.ts`

### Renderer API adapter snake_case ↔ camelCase mapping

- **Type:** other (renderer adapter mapping)
- **Shape:**

  ```
  closeCoveredCallEarly payload (renderer snake_case -> IPC camelCase):
    position_id                -> positionId
    close_price_per_contract   -> closePricePerContract
    fill_date                  -> fillDate

  Error field mapping (IPC -> form):
    closePricePerContract      -> close_price_per_contract
    fillDate                   -> fill_date
  ```

- **Source:** `plans/us-8/plan.md` §7, `plans/us-8/contracts/positions-close-cc.md`
- **Implementation:** `src/renderer/src/api/positions.ts` (`IPC_TO_FORM_FIELD`)

### `useCloseCoveredCallEarly` mutation hook

- **Type:** other (renderer TanStack Query mutation hook)
- **Shape:**
  ```typescript
  useCloseCoveredCallEarly(options: { onSuccess: (data: CloseCcResponse) => void }):
    useMutation<CloseCcResponse, ApiError, CloseCcPayload>
  ```
  Invalidates `positionQueryKeys.all` on success; forwards `onSuccess` callback (used by the sheet to transition to its success state).
- **Source:** `plans/us-8/plan.md` §8
- **Implementation:** `src/renderer/src/hooks/useCloseCoveredCallEarly.ts`

### `CcPnlPreview` component

- **Type:** other (renderer UI component)
- **Shape:**
  ```typescript
  interface CcPnlPreviewProps {
    openPremium: string
    closePrice: string
    contracts: number
  }
  ```
  Computes `pnl = (open − close) × contracts × 100` and `pct = (open − close) / open × 100` via `decimal.js`. Renders:
  - `+$X.XX profit · Y.Y% of max` (green) when `pnl > 0`
  - `−$X.XX loss · Y.Y% above open` (red) when `pnl < 0`
  - `$0.00 break-even` (neutral) when `pnl === 0`
  - `null` when `closePrice` is empty / non-positive
- **Source:** `plans/us-8/plan.md` §9, `plans/us-8/data-model.md`
- **Implementation:** `src/renderer/src/components/ui/CcPnlPreview.tsx`

### `CloseCcEarlySheetProps`

- **Type:** other (renderer sheet orchestrator props)
- **Shape:**
  ```typescript
  export interface CloseCcEarlySheetProps {
    open: boolean
    positionId: string
    ticker: string
    contracts: number
    openPremium: string
    ccOpenFillDate: string
    ccExpiration: string
    strike: string
    basisPerShare: string
    onClose: () => void
  }
  ```
  Portal-rendered fixed right-panel overlay (400 px, `SIDEBAR_WIDTH=200` left offset, scrim backdrop). Owns `closePrice`, `fillDate`, `fieldErrors`, `successState: CloseCcResponse | null`. Uses `useCloseCoveredCallEarly({ onSuccess: setSuccessState })` and renders `CloseCcEarlyForm` until `successState` is set, then `CloseCcEarlySuccess`.
- **Source:** `plans/us-8/plan.md` §10, `plans/us-8/green-phase-results.md`
- **Implementation:** `src/renderer/src/components/CloseCcEarlySheet.tsx`

## Schema Changes

### No new tables, columns, or migrations

- **Change:** none — existing schema fully supports CC close. No migration required. Reuses `legs` and `positions` as designed.
- **Source:** `plans/us-8/data-model.md`, `plans/us-8/research.md`, `plans/us-8/quickstart.md`

### `legs` row INSERT — CC close leg

- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field | Value |
  | ---------------------- | ---------------------------------------------------- |
  | `id` | `randomUUID()` |
  | `position_id` | FK → parent CC_OPEN position |
  | `leg_role` | `'CC_CLOSE'` |
  | `action` | `'BUY'` (buy to close) |
  | `instrument_type` | `'CALL'` |
  | `strike` | copied from CC_OPEN leg (4 dp TEXT) |
  | `expiration` | copied from CC_OPEN leg |
  | `contracts` | copied from CC_OPEN leg (must match; no partial close) |
  | `premium_per_contract` | `closePricePerContract` (4 dp TEXT) — buy-to-close fill price |
  | `fill_price` | same as `premium_per_contract` |
  | `fill_date` | from payload (or today) |
- **Source:** `plans/us-8/data-model.md`
- **Migration file:** none

### `positions` row UPDATE on CC close

- **Change:** altered row (no schema change)
- **Columns / fields:**
  | Field | Before CC close | After CC close |
  | ------------ | ---------------- | ---------------- |
  | `phase` | `CC_OPEN` | `HOLDING_SHARES` |
  | `updated_at` | prior timestamp | now |
- **Source:** `plans/us-8/data-model.md`

### `cost_basis_snapshots` — explicitly NOT touched

- **Change:** none — no INSERT, no UPDATE. The existing CC_OPEN snapshot remains the current snapshot.
- **Why:** See ADR "No new cost-basis snapshot on CC close".
- **Source:** `plans/us-8/data-model.md`, `plans/us-8/research.md`, `docs/epics/02-stories/US-8-close-covered-call-early.md` Technical Notes

## Acceptance Criteria

Background:

- The trader has a `CC_OPEN` position on AAPL
- The CC was sold at $2.30 premium, strike $182.00, 1 contract
- The effective cost basis is $174.20 per share

- Scenario: Successfully close a covered call early at a profit
  - Given the trader enters close price $1.10 with fill date "2026-02-01"
  - When the trader submits the close CC form
  - Then the position phase changes to `HOLDING_SHARES`
  - And a `CC_CLOSE` leg is recorded with fill price $1.10 and fill date "2026-02-01"
  - And the CC leg P&L shows +$120.00 (`($2.30 − $1.10) × 1 × 100`)
  - And the position cost basis snapshot remains $174.20 per share (cost basis does not change on CC close)
- Scenario: Close at a loss shows negative P&L
  - Given the trader enters close price $3.50 (above the $2.30 open premium)
  - Then a `CC_CLOSE` leg is recorded with fill price $3.50
  - And the CC leg P&L shows −$120.00 (`($2.30 − $3.50) × 1 × 100`)
  - And the position remains in `HOLDING_SHARES`
- Scenario: P&L preview shown on the form before submission — profit close
  - Given the close price field shows $1.15
  - Then a P&L preview shows `+$115.00 profit (50% of max)`
  - And the preview updates as the trader changes the close price
- Scenario: P&L preview shown on the form before submission — loss close
  - Given the close price field shows $3.50 (above the $2.30 open premium)
  - Then a P&L preview shows `−$120.00 loss`
  - And no percentage-of-max label is shown
- Scenario: Reject close when not in `CC_OPEN` phase
  - Given the position is in `HOLDING_SHARES` phase
  - When the trader attempts to close a covered call
  - Then the action is rejected with message `"No open covered call on this position"`
- Scenario: Reject close price of zero or negative
  - Given the close CC form is open
  - When the trader enters close price `"0"`
  - Then a validation error appears: `"Close price must be greater than zero"`
  - And no leg is created
- Scenario: Reject fill date before CC open date
  - Given the CC was opened on `"2026-01-20"`
  - When the trader enters fill date `"2026-01-19"`
  - Then a validation error appears: `"Fill date cannot be before the CC open date"`
  - And no leg is created
- Scenario: Reject fill date after CC expiration date
  - Given the CC expires on `"2026-02-21"`
  - When the trader enters fill date `"2026-02-22"`
  - Then a validation error appears: `"Fill date cannot be after the CC expiration date — use Record Expiry instead"`
  - And no leg is created

(Source: `docs/epics/02-stories/US-8-close-covered-call-early.md`)

## Decisions & Tradeoffs

- The active `CC_OPEN` leg is the source of truth for strike, expiration, contracts, open premium, and open fill date — the service reads these from leg history rather than from any cached position field. (Source: `plans/us-8/plan.md` §4, `plans/us-8/data-model.md`)
- Contracts must match the open CC; partial close is not supported. The contracts field in the form is read-only (displays value, not editable). (Source: `plans/us-8/data-model.md`, `docs/epics/02-stories/US-8-close-covered-call-early.md` Technical Notes, `plans/us-8/plan.md` §10)
- P&L math uses `decimal.js` with `ROUND_HALF_UP` and 4 dp precision; the value is serialised as a string in IPC. (Source: `plans/us-8/plan.md` §2, `plans/us-8/data-model.md`)
- `fillDate` defaults to today when omitted from the IPC payload (handled by the service). (Source: `plans/us-8/plan.md` §4)
- The new CC_CLOSE leg sets `fill_price` equal to `premium_per_contract` (both = close price) — there is no separate broker fill-price distinction in manual entry. (Source: `plans/us-8/data-model.md`)
- IPC return shape keeps `position.status = 'ACTIVE'` and `position.closedDate = null` because the wheel continues — only the CC leg closes, not the position. (Source: `plans/us-8/research.md`)
- "Close CC Early →" button is rendered in `PositionDetailActions` only when `phase === 'CC_OPEN'`; the wire-up lives in `PositionDetailPage` via a `closeCcCtx` state populated from the active CC leg + current snapshot's `basisPerShare`. (Source: `plans/us-8/plan.md` §11–§12, `docs/epics/02-stories/US-8-close-covered-call-early.md` Technical Notes)
- The success state renders both a literal `CC_OPEN → HOLDING_SHARES` string and the `PhaseBadge` pair so tests, E2E assertions, and the visual design all stay aligned. (Source: `plans/us-8/green-phase-results.md`)
- The success state surfaces a "Sell New Covered Call on {ticker} →" CTA (full-width gold `FormButton`) that simply calls `onClose` in this story — the actual open-CC wire-up from the success-state CTA is deferred to a later story. (Source: `plans/us-8/plan.md` §10)
- The irrevocable-action warning (`AlertBox variant="warning"`) reads: "This cannot be undone. A CC_CLOSE leg will be recorded. The position returns to Holding Shares. Full leg history is preserved." (Source: `plans/us-8/plan.md` §10)
- The IPC handler uses the shared `handleIpcCall('positions_close_cc_early_unhandled_error', ...)` wrapper, consistent with `positions:create`, `positions:close-csp`, `positions:open-cc`, etc. (Source: `plans/us-8/plan.md` §5)
- The renderer-side form date picker is the shared `DatePicker` UI primitive — the close-sheet test file mocks it explicitly rather than assuming a raw text input. (Source: `plans/us-8/green-phase-results.md`)
- Front-end validation duplicates the lifecycle engine's date and price guards so the sheet can surface inline errors without an IPC round-trip; the engine remains the authoritative source. (Source: `plans/us-8/plan.md` §10)
- E2E spec covers 8 scenarios mapped 1:1 to ACs (`e2e/close-cc-early.spec.ts`) and seeds a `CC_OPEN` state by running the UI flow through `createPosition → assignCsp → openCoveredCall` before clicking `data-testid="close-cc-early-btn"`. The green E2E run is the one acceptance task that remains pending because `pnpm test:e2e` requires a GUI terminal. (Source: `plans/us-8/plan.md` §13, `plans/us-8/green-phase-results.md`)

Refactor-phase decisions (authoritative; `plans/us-8/refactor-phase-results.md`):

- **Extracted shared `requirePositiveClosePrice(closePricePerContract: string): void` helper in `src/main/core/lifecycle.ts`.** The inline `new Decimal(input.closePricePerContract).lte(0)` guard was duplicated in both `closeCsp` and `closeCoveredCall` with inconsistent messages ("Close price must be positive" vs "Close price must be greater than zero"). Both functions now call the helper; the message is normalized to "Close price must be greater than zero". Consistent with the existing `requirePositiveStrike` / `requirePositivePremium` pattern.
- **Test execution after refactor:** 376 tests passing, no regressions; `pnpm test`, `pnpm lint`, `pnpm typecheck` all clean.
- **No automated `code-simplifier` agent run** — the changes were simple, targeted extractions, so no agent was invoked.
- **Remaining tech debt:** none identified by the refactor pass. (Known pre-existing notes from the green pass: `pnpm test:e2e` must still be run from a GUI terminal; the success-state tests emit React `act(...)` warnings similar to other sheet tests in the repo.)

## Source Code References

Files this plan introduced or modified (verified to exist on disk):

- `src/main/core/lifecycle.ts` — added `CloseCoveredCallInput`, `CloseCoveredCallResult`, `closeCoveredCall()`; added `requirePositiveClosePrice` private helper shared with `closeCsp` (refactor).
- `src/main/core/lifecycle.test.ts` — added `describe('closeCoveredCall')` test suite.
- `src/main/core/costbasis.ts` — added `CcCloseInput`, `CcCloseResult`, `calculateCcClose()`.
- `src/main/core/costbasis.test.ts` — added `describe('calculateCcClose')` test suite.
- `src/main/schemas.ts` — added `CloseCcPayloadSchema`, `CloseCcPayload`, `CloseCcPositionResult`.
- `src/main/services/close-covered-call-position.ts` — new service following `open-covered-call-position.ts` pattern; finds active CC_OPEN leg, calls lifecycle + costbasis engines, inserts `CC_CLOSE` leg, updates position phase to `HOLDING_SHARES`, returns `{ position, leg, ccLegPnl }`.
- `src/main/services/close-covered-call-position.test.ts` — new integration test file; setup helper reaches `CC_OPEN` via `createPosition → assignCsp → openCoveredCall`.
- `src/main/services/positions.ts` — re-exports `closeCoveredCallPosition`.
- `src/main/ipc/positions.ts` — added `positions:close-cc-early` handler using shared `handleIpcCall` wrapper.
- `src/preload/index.ts` — added `closeCoveredCallEarly` to `window.api`.
- `src/preload/index.d.ts` — added typed `IpcCloseCcPayload` and `closeCoveredCallEarly` return contract.
- `src/renderer/src/api/positions.ts` — added `CloseCcPayload`, `CloseCcResponse` types, `closeCoveredCallEarly()` adapter; extended `IPC_TO_FORM_FIELD` map with `closePricePerContract`/`fillDate`.
- `src/renderer/src/hooks/useCloseCoveredCallEarly.ts` — new TanStack Query mutation hook.
- `src/renderer/src/hooks/useCloseCoveredCallEarly.test.ts` — hook unit tests.
- `src/renderer/src/components/ui/CcPnlPreview.tsx` — new live-preview UI component (profit/loss/break-even/null states).
- `src/renderer/src/components/ui/CcPnlPreview.test.tsx` — preview component tests.
- `src/renderer/src/components/CloseCcEarlySheet.tsx` — portal orchestrator for the close-CC flow.
- `src/renderer/src/components/CloseCcEarlySheet.test.tsx` — sheet integration tests (mocks shared `DatePicker`).
- `src/renderer/src/components/CloseCcEarlyForm.tsx` — form body: position summary card, close-price + fill-date inputs, `CcPnlPreview`, irrevocable-warning `AlertBox`, footer.
- `src/renderer/src/components/CloseCcEarlyForm.test.tsx`.
- `src/renderer/src/components/CloseCcEarlySuccess.tsx` — success state: hero P&L card, result summary, info `AlertBox`, "Sell New Covered Call on {ticker} →" CTA.
- `src/renderer/src/components/CloseCcEarlySuccess.test.tsx`.
- `src/renderer/src/components/PositionDetailActions.tsx` — added `onCloseCcEarly` prop and `Close CC Early →` button (`data-testid="close-cc-early-btn"`) visible only when `phase === 'CC_OPEN'`.
- `src/renderer/src/pages/PositionDetailPage.tsx` — added `closeCcCtx` state, `handleCloseCcEarly` builder (reads active CC_OPEN leg + current snapshot's `basisPerShare`), renders `CloseCcEarlySheet`.
- `e2e/close-cc-early.spec.ts` — 8 E2E tests, one per AC (green run still pending — requires GUI terminal).

## Open Questions

None recorded. The refactor-phase results report 376 tests passing with clean `pnpm test`, `pnpm lint`, and `pnpm typecheck`. (Source: `plans/us-8/refactor-phase-results.md`)

Deferred / out of scope (noted in story, not unresolved): rolling the CC (close + reopen in one atomic action) — Epic 03, US-14; automatic close at 50% profit alert — Epic 07; closing only a subset of contracts (partial close) — deferred; suppressing the "Close Early" button when the CC has already passed expiration date — tracked separately in a position-detail-header UX story. (Source: `docs/epics/02-stories/US-8-close-covered-call-early.md`)
