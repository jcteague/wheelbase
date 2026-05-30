---
plan: us-4
source: plans/us-4/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-4

## Summary

This story adds the ability to close a cash-secured put (CSP) position early by recording a buy-to-close transaction. The close flow validates the position phase, calculates final P&L, persists a close leg and updated cost basis snapshot, and transitions the position to `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS`. The frontend shows a real-time P&L preview before the trader confirms. (Source: `plans/us-4/plan.md`)

## Architecture Decisions

### ADR: Date validation ownership (lifecycle engine vs service layer)
- **Decision:** Date validations for close (`closeFillDate >= openFillDate`, `closeFillDate <= expiration`) belong in the lifecycle engine (`core/lifecycle.ts`), not the service layer.
- **Why:** These are domain business rules, consistent with how `openWheel()` validates fill/expiration dates. The lifecycle engine accepts context values (open fill date, expiration) as parameters — the service layer looks them up from the DB and passes them in. This keeps core logic pure and testable without a DB.
- **Alternatives considered:** Service-layer validation (simpler setup, but business rules scattered across layers).
- **Source:** `plans/us-4/research.md`

### ADR: How the close service reads position context
- **Decision:** The service calls a `getPosition(db, positionId)` helper first to fetch the position's current phase, open leg data (fill_date, expiration, premium_per_contract, contracts), and latest cost basis snapshot. That data is passed to the lifecycle and cost basis engines.
- **Why:** The lifecycle engine cannot touch the DB; it needs `openFillDate` and `expiration` from the caller. One query before the transaction is the cleanest pattern and consistent with `createPosition()` which calls `openWheel()` with values it already has.
- **Alternatives considered:** Inline SQL inside the close service (violates SRP), fat payload from frontend (puts DB concerns on the client).
- **Source:** `plans/us-4/research.md`

### ADR: cost_basis_snapshots — insert new vs update existing on close
- **Decision:** Insert a new `cost_basis_snapshots` row at close time with the `final_pnl` set. Do not mutate the opening snapshot.
- **Why:** The table is append-only (has a `snapshot_at` timestamp); the latest row wins via `ORDER BY snapshot_at DESC LIMIT 1`. This is consistent with the immutable/roll pattern used for legs and matches the existing `listPositions` query which always selects the latest snapshot.
- **Alternatives considered:** Update the existing row (mutates history, violates immutability principle).
- **Source:** `plans/us-4/research.md`

### ADR: P&L preview — frontend-only calculation
- **Decision:** The P&L preview in the form is computed locally in the React component as the user types. No IPC round-trip until form submission.
- **Why:** The user story's Technical Notes explicitly state this. All the required inputs (open premium, contracts) are available once the detail page loads. Local calculation is instant and avoids debounce complexity.
- **Alternatives considered:** Debounced IPC preview call (unnecessary latency, more infrastructure).
- **Source:** `plans/us-4/research.md`

### ADR: pnl_percentage storage
- **Decision:** Do not store `pnl_percentage` in the DB. Store only `final_pnl` in `cost_basis_snapshots`. Recalculate percentage for display.
- **Why:** The existing schema has `final_pnl TEXT` but no percentage column. Percentage is derivable from `final_pnl / total_premium_collected * 100` or from `(openPremium - closePrice) / openPremium * 100`. No migration needed.
- **Alternatives considered:** Add `pnl_percentage` column (requires migration, but data is redundant).
- **Source:** `plans/us-4/research.md`

### ADR: PositionDetailPage scope for this story
- **Decision:** Build just enough of PositionDetailPage to support the close flow: fetch and display core position fields (ticker, phase, strike, expiration, premium, cost basis) and render `CloseCspForm` when `phase === 'CSP_OPEN'`.
- **Why:** US-3 (Position detail page) created a stub. US-4 requires the detail page to host the close form. We build the minimum viable detail view rather than a full US-3 build-out.
- **Alternatives considered:** Keep PositionDetailPage as a stub and navigate to a separate `/positions/:id/close` route (adds unnecessary routing complexity for a single action).
- **Source:** `plans/us-4/research.md`

### ADR: `getPosition` IPC channel
- **Decision:** Add a `positions:get` IPC handler backed by a `getPosition(db, positionId)` service. The renderer calls this to hydrate the detail page.
- **Why:** The existing `positions:list` returns summary data only. The close form needs full leg data (premium_per_contract, open fill_date, expiration) that isn't in the list response.
- **Alternatives considered:** Extend `listPositions` to return full data (breaks the list's lean shape), pass data via router state (fragile in Electron hash routing).
- **Source:** `plans/us-4/research.md`

### ADR: Leg fields for the close leg
- **Decision:** Insert the close leg with `leg_role = 'CSP_CLOSE'`, `action = 'BUY'`, `option_type = 'PUT'`, `fill_price = closePricePerContract`. Copy `strike`, `expiration`, `contracts` from the opening leg. `premium_per_contract` is set to the close price (it is what was paid to close).
- **Why:** `leg_role` values `CSP_CLOSE` etc. are already planned in the schema comment. `action = 'BUY'` correctly describes buying to close. Mirroring strike/expiration/contracts from the open leg keeps the leg record self-contained.
- **Alternatives considered:** Omit some fields (violates schema NOT NULL constraints; contracts and strike are required).
- **Source:** `plans/us-4/research.md`

## Contracts

### `positions:get`
- **Type:** IPC handler
- **Shape:**
  ```typescript
  // Request payload
  {
    positionId: string // UUID
  }

  // Success response
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: WheelPhase
      status: WheelStatus
      openedDate: string        // ISO date
      closedDate: string | null
    },
    activeLeg: {
      id: string
      legRole: string           // 'CSP_OPEN' | 'CC_OPEN'
      action: string
      optionType: string
      strike: string            // 4 dp TEXT
      expiration: string        // ISO date
      contracts: number
      premiumPerContract: string // 4 dp TEXT
      fillDate: string          // ISO date
    } | null,
    costBasisSnapshot: {
      id: string
      basisPerShare: string           // 4 dp TEXT
      totalPremiumCollected: string   // 4 dp TEXT
      finalPnl: string | null         // 4 dp TEXT, set on close
    } | null
  }

  // Error responses
  { ok: false, errors: [{ field: '__root__', code: 'not_found', message: 'Position not found' }] }
  { ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }
  ```
- **Source:** `plans/us-4/contracts/close-csp.md`
- **Implementation:** `src/main/ipc/positions.ts`, `src/main/services/get-position.ts`

### `positions:close-csp`
- **Type:** IPC handler
- **Shape:**
  ```typescript
  // Request payload
  {
    positionId: string                 // UUID — required
    closePricePerContract: number      // positive number — required
    fillDate?: string                  // ISO date (YYYY-MM-DD) — defaults to today
  }

  // Success response
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
      status: 'CLOSED'
      closedDate: string    // ISO date
    },
    leg: {
      id: string
      legRole: 'CSP_CLOSE'
      action: 'BUY'
      optionType: 'PUT'
      strike: string        // 4 dp TEXT
      expiration: string    // ISO date
      contracts: number
      premiumPerContract: string  // 4 dp TEXT (= close price)
      fillDate: string            // ISO date
    },
    costBasisSnapshot: {
      id: string
      basisPerShare: string             // 4 dp TEXT
      totalPremiumCollected: string     // 4 dp TEXT
      finalPnl: string                  // 4 dp TEXT
    }
  }

  // Validation error response
  {
    ok: false,
    errors: [
      {
        field: '__phase__' | 'closePricePerContract' | 'fillDate',
        code: 'invalid_phase' | 'must_be_positive' | 'close_date_before_open' | 'close_date_after_expiration',
        message: string
      }
    ]
  }

  // Internal error response
  { ok: false, errors: [{ field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }] }
  ```
- **Source:** `plans/us-4/contracts/close-csp.md`
- **Implementation:** `src/main/ipc/positions.ts`, `src/main/services/close-csp-position.ts`

### CloseCspPayloadSchema
- **Type:** Zod schema
- **Shape:**
  ```typescript
  z.object({
    positionId: z.string().uuid(),
    closePricePerContract: z.number().positive(),
    fillDate: z.string().optional()
  })
  ```
- **Source:** `plans/us-4/plan.md`
- **Implementation:** `src/main/schemas.ts`

### CloseCspInput / CloseCspResult (lifecycle engine)
- **Type:** other (core lifecycle function signature)
- **Shape:**
  ```typescript
  CloseCspInput {
    currentPhase: WheelPhase
    closePricePerContract: string
    openPremiumPerContract: string
    closeFillDate: string
    openFillDate: string
    expiration: string
  }

  CloseCspResult {
    phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
  }
  ```
- **Source:** `plans/us-4/plan.md`, `plans/us-4/data-model.md`
- **Implementation:** `src/main/core/lifecycle.ts`

### CspCloseInput / CspCloseResult (cost basis engine)
- **Type:** other (core cost basis function signature)
- **Shape:**
  ```typescript
  CspCloseInput {
    openPremiumPerContract: string
    closePricePerContract: string
    contracts: number
  }

  CspCloseResult {
    finalPnl: string
    pnlPercentage: string
  }
  ```
- **Source:** `plans/us-4/plan.md`, `plans/us-4/data-model.md`
- **Implementation:** `src/main/core/costbasis.ts`

### CloseCspPositionResult / GetPositionResult
- **Type:** other (IPC return type definitions)
- **Shape:**
  ```typescript
  CloseCspPositionResult {
    position: { id, ticker, phase, status, closedDate }
    leg: LegRecord
    costBasisSnapshot: CostBasisSnapshotRecord & { finalPnl: string }
  }

  GetPositionResult {
    position: PositionRecord
    activeLeg: LegRecord | null
    costBasisSnapshot: (CostBasisSnapshotRecord & { finalPnl: string | null }) | null
  }
  ```
- **Source:** `plans/us-4/plan.md`
- **Implementation:** `src/main/schemas.ts`

### Renderer API adapter snake_case ↔ camelCase mapping
- **Type:** other (renderer adapter mapping)
- **Shape:**
  ```
  getPosition response (IPC camelCase → renderer snake_case):
    activeLeg.premiumPerContract            → active_leg.premium_per_contract
    activeLeg.fillDate                      → active_leg.fill_date
    activeLeg.legRole                       → active_leg.leg_role
    activeLeg.optionType                    → active_leg.option_type
    costBasisSnapshot.basisPerShare         → cost_basis_snapshot.basis_per_share
    costBasisSnapshot.totalPremiumCollected → cost_basis_snapshot.total_premium_collected
    costBasisSnapshot.finalPnl              → cost_basis_snapshot.final_pnl
    position.openedDate                     → position.opened_date
    position.closedDate                     → position.closed_date

  closePosition payload (renderer snake_case → IPC camelCase):
    position_id              → positionId
    close_price_per_contract → closePricePerContract
    fill_date                → fillDate

  Error field mapping (IPC → form):
    closePricePerContract → close_price_per_contract
    fillDate              → fill_date
  ```
- **Source:** `plans/us-4/contracts/close-csp.md`
- **Implementation:** `src/renderer/src/api/positions.ts`

## Schema Changes

### No new tables, columns, or migrations
- **Change:** none — existing schema fully supports CSP closing. No migration required. `cost_basis_snapshots.final_pnl` (nullable TEXT) already exists; `positions.closed_date` and `positions.status` already exist.
- **Source:** `plans/us-4/data-model.md`, `plans/us-4/quickstart.md`, `plans/us-4/plan.md`

### `positions` row UPDATE on close
- **Change:** altered row (no schema change)
- **Columns / fields:**
  | Field         | Before close   | After close                              |
  | ------------- | -------------- | ---------------------------------------- |
  | `phase`       | `CSP_OPEN`     | `CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS` |
  | `status`      | `ACTIVE`       | `CLOSED`                                 |
  | `closed_date` | `NULL`         | close fill date (ISO string)             |
  | `updated_at`  | open timestamp | close timestamp                          |
- **Source:** `plans/us-4/data-model.md`
- **Migration file:** none

### `legs` row INSERT — close leg
- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field                  | Value                                |
  | ---------------------- | ------------------------------------ |
  | `id`                   | new UUID                             |
  | `position_id`          | parent position ID                   |
  | `leg_role`             | `'CSP_CLOSE'`                        |
  | `action`               | `'BUY'`                              |
  | `option_type`          | `'PUT'`                              |
  | `strike`               | copied from the CSP_OPEN leg         |
  | `expiration`           | copied from the CSP_OPEN leg         |
  | `contracts`            | copied from the CSP_OPEN leg         |
  | `premium_per_contract` | close price per contract (4 dp TEXT) |
  | `fill_price`           | close price per contract (4 dp TEXT) |
  | `fill_date`            | close fill date (ISO string)         |
  | `created_at`           | now                                  |
  | `updated_at`           | now                                  |
- **Source:** `plans/us-4/data-model.md`
- **Migration file:** none

### `cost_basis_snapshots` row INSERT — close snapshot
- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field                     | Value                                                      |
  | ------------------------- | ---------------------------------------------------------- |
  | `id`                      | new UUID                                                   |
  | `position_id`             | parent position ID                                         |
  | `basis_per_share`         | copied from the opening snapshot                           |
  | `total_premium_collected` | copied from the opening snapshot                           |
  | `final_pnl`               | `(openPremium − closePrice) × contracts × 100` (4 dp TEXT) |
  | `annualized_return`       | `NULL` (future story)                                      |
  | `snapshot_at`             | now                                                        |
  | `created_at`              | now                                                        |
- **Source:** `plans/us-4/data-model.md`
- **Migration file:** none

## Acceptance Criteria

- Scenario: P&L preview shows profit when closing below premium collected
  - When the trader enters a close price of $1.00 per contract
  - Then the P&L preview displays: premium collected $2.50, cost to close $1.00, net P&L per contract $1.50, total P&L $150.00, % of premium captured 60%
- Scenario: Successfully close a CSP at a profit
  - When the trader submits a close with price $1.00 per contract and fill date 2026-03-20
  - Then the position phase changes to CSP_CLOSED_PROFIT
  - And the position status changes to closed
  - And a close leg is recorded with action "close" and fill_price $1.00
  - And the cost basis snapshot shows final_pnl of $150.00
  - And the trader is returned to the position detail page
- Scenario: Successfully close a CSP at a loss
  - When the trader submits a close with price $3.50 per contract and fill date 2026-03-20
  - Then the P&L preview displays: net P&L per contract -$1.00, total P&L -$100.00, % of premium captured -40%
  - And after confirmation, the position phase changes to CSP_CLOSED_LOSS
- Scenario: Reject close when position is not in CSP_OPEN phase
  - Given the position phase is WHEEL_COMPLETE
  - When the trader attempts to close the position
  - Then the close action is rejected with message "Position is not in CSP_OPEN phase"
- Scenario: Reject close with invalid fill date
  - When the trader submits a close with fill date before the open leg's fill date
  - Then a validation error appears: "Close date cannot be before the open date"
- Scenario: Reject close with fill date after expiration
  - When the trader submits a close with fill date 2026-04-18 (after expiration)
  - Then a validation error appears: "Close date cannot be after expiration date"
- Scenario Outline: Reject close with invalid price
  - When the trader enters a close price of 0 → "Close price must be positive"
  - When the trader enters a close price of -1.00 → "Close price must be positive"

Background (applied to all scenarios): the trader has an open CSP on AAPL with strike $180.00, expiration 2026-04-17, contracts 1, premium_per_contract $2.50, phase CSP_OPEN.

(Source: `docs/epics/01-stories/US-4-close-csp-early.md`, also referenced in `plans/us-4/plan.md`)

## Decisions & Tradeoffs

- Breakeven (net P&L = 0) is classified as `CSP_CLOSED_LOSS` (not profit). The lifecycle engine uses `netPnl.gt(0) ? 'CSP_CLOSED_PROFIT' : 'CSP_CLOSED_LOSS'`. (Source: `plans/us-4/plan.md`)
- A fill date equal to the expiration date passes validation — fill on expiry is valid. (Source: `plans/us-4/plan.md`)
- `pnlPercentage` is per-contract (not affected by contracts count). Total P&L scales with contracts, percentage does not. (Source: `plans/us-4/plan.md`)
- Decimal rounding uses 4 dp with `ROUND_HALF_UP` via the existing `round4` helper. (Source: `plans/us-4/plan.md`)
- `fillDate` defaults to today (`new Date().toISOString().slice(0, 10)`) when omitted from the payload. (Source: `plans/us-4/plan.md`, `plans/us-4/contracts/close-csp.md`)
- On successful close, the renderer navigates to `/` (positions list) using wouter's `useLocation`. (Source: `plans/us-4/plan.md`)
- Naming: error `field` value `__phase__` for phase-mismatch errors; `__root__` for not-found/internal. (Source: `plans/us-4/data-model.md`, `plans/us-4/contracts/close-csp.md`)
- `usePosition` `queryKey` is `['positions', id]`; the list key is `['positions']`. Invalidation on close uses `queryKey: ['positions']`. (Source: `plans/us-4/plan.md`)
- Frontend P&L preview only renders when `close_price_per_contract` is a valid positive number. (Source: `plans/us-4/plan.md`)
- Frontend uses React Hook Form + Zod resolver with schema: `close_price_per_contract: z.coerce.number().positive(...)`, `fill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`. (Source: `plans/us-4/plan.md`)
- IPC handler test coverage: relied on service-layer integration tests + E2E; no isolated IPC unit tests for the new handlers. (Source: `plans/us-4/plan.md`)

Refactor-phase decisions (authoritative; `plans/us-4/refactor-phase-results.md`):
- Extracted `mapIpcErrors(errors)` in `src/renderer/src/api/positions.ts` to remove duplicated `result.errors.map(...) + IPC_TO_FORM_FIELD` lookup shared by `closePosition` and `createPosition`.
- Extracted `handleIpcCall(logLabel, fn)` in `src/main/ipc/positions.ts` shared by `positions:create` and `positions:close-csp`; `positions:get` kept inline because it uses a null check rather than exception-based flow.
- Extracted `computePreview(openPremium, closePrice, contracts): PnlPreview | null` as a named function above `CloseCspForm` (was an IIFE inside render).

## Source Code References

- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/costbasis.test.ts`
- `src/main/schemas.ts`
- `src/main/services/get-position.ts`
- `src/main/services/get-position.test.ts`
- `src/main/services/close-csp-position.ts`
- `src/main/services/close-csp-position.test.ts`
- `src/main/services/positions.ts`
- `src/main/ipc/positions.ts`
- `src/main/ipc/utils.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/usePosition.ts`
- `src/renderer/src/hooks/useClosePosition.ts`
- `src/renderer/src/components/CloseCspForm.tsx`
- `src/renderer/src/components/CloseCspForm.test.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionDetailPage.test.tsx`

## Open Questions

- None recorded. The refactor-phase results report "Remaining Tech Debt: None identified" and all 110 tests pass. (Source: `plans/us-4/refactor-phase-results.md`)

Deferred / out of scope (noted in story, not unresolved): commission tracking, undo/revert a close, closing partial contracts, auto-close at profit target (Epic 07 — alerts). (Source: `docs/epics/01-stories/US-4-close-csp-early.md`)
