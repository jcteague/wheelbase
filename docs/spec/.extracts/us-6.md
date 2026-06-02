---
plan: us-6
source: plans/us-6/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-6

## Summary

This story implements the assignment flow that transitions a `CSP_OPEN` position to `HOLDING_SHARES` when a broker assigns shares to the trader. Work spans a DB migration (rename `option_type` -> `instrument_type`, expand its CHECK constraint to include `'STOCK'`), two new core engine functions (`recordAssignment()` in the lifecycle engine and `calculateAssignmentBasis()` in the cost basis engine), a new service `assignCspPosition()`, an IPC handler `positions:assign-csp`, preload binding, renderer API/hook, and a new right-side `AssignmentSheet` component reached from the position detail page. The cost basis engine returns a full premium waterfall (one entry per CSP or roll leg) so the sheet can render each deduction line individually. Done state: the trader opens the sheet from the position detail page, confirms an assignment date, and sees the position transition to HOLDING_SHARES with the correct effective cost basis and a strategic nudge to wait 1–3 days before opening the first covered call. (Source: `plans/us-6/plan.md`)

> **Note on extract completeness:** `plans/us-6/` does **not** contain a `refactor-phase-results.md` file, so this extract has no authoritative refactor-phase decisions section. All decisions below come from `plan.md`, `research.md`, `data-model.md`, `contracts/assign-csp.md`, and `quickstart.md`.

## Architecture Decisions

### ADR: Rename `OptionType` -> `InstrumentType` and add `STOCK`
- **Decision:** Rename the `OptionType` Zod enum / TypeScript type to `InstrumentType`. Add `'STOCK'` as a third value so the enum becomes `PUT | CALL | STOCK`. Rename the `option_type` column to `instrument_type` in the `legs` table via a new DB migration (`migrations/003_rename_option_type_to_instrument_type.sql`) and expand the CHECK constraint to `instrument_type IN ('PUT', 'CALL', 'STOCK')`. Every service SQL INSERT/SELECT referencing the column must be updated.
- **Why:** `OptionType` is semantically wrong for a field that must now represent stocks as well as options. `InstrumentType` is standard financial terminology that covers options (PUT, CALL) and equities (STOCK) within one enum. PMCC legs are still CALLs, so no new values are needed for that strategy — the rename alone future-proofs the field.
- **Alternatives considered:** `PositionType` (conflicts with the existing `positions` table and `strategy_type`); leaving `OptionType` and adding `STOCK` (user explicitly flagged as semantically wrong); separate nullable `stockFlag` boolean (over-complicated; a discriminated enum is cleaner).
- **Source:** `plans/us-6/research.md`, `plans/us-6/data-model.md`

### ADR: Add `'ASSIGN'` to `LegAction` enum
- **Decision:** Extend the `LegAction` Zod enum from `SELL | BUY | EXPIRE` to `SELL | BUY | EXPIRE | ASSIGN`. The assignment leg uses `action='ASSIGN'`.
- **Why:** Assignment is a broker-initiated stock delivery — semantically distinct from `BUY` (no market-price purchase), `SELL`, or `EXPIRE`. The story specifies `LegAction: assign`.
- **Alternatives considered:** Reusing `EXPIRE` (semantically wrong); reusing `BUY` (shares are not purchased at market price).
- **Source:** `plans/us-6/research.md`

### ADR: Reuse existing `'ASSIGN'` `LegRole`
- **Decision:** Use the existing `'ASSIGN'` value already present in the `LegRole` Zod enum (`src/main/core/types.ts`) and the DB CHECK constraint (`migrations/001_initial_schema.sql`).
- **Why:** `ASSIGN` is already defined and correct. The story's reference to `stock_assignment` describes the operation's semantics; `ASSIGN` is the code-level identifier already established by earlier schema work.
- **Alternatives considered:** Adding a new `'STOCK_ASSIGNMENT'` value — rejected: would require a schema migration and break the existing CHECK constraint for no benefit.
- **Source:** `plans/us-6/research.md`

### ADR: Premium waterfall computed in the cost basis engine
- **Decision:** `calculateAssignmentBasis()` accepts an array of `{ legRole, premiumPerContract, contracts }` objects and returns both the numeric `basisPerShare` and a `premiumWaterfall: Array<{ label, amount }>`. The service passes all `CSP_OPEN` and `ROLL_TO` legs from the position's leg history. Label is `'Roll credit'` when `legRole === 'ROLL_TO'`, otherwise `'CSP premium'`.
- **Why:** The mockup and acceptance criteria require each premium line to render individually (e.g., "− CSP premium $3.50", "− Roll credit $1.50"). Returning the waterfall from the pure core function keeps rendering logic out of the service and component.
- **Alternatives considered:** Computing the waterfall in the component from raw leg data (puts domain logic in the renderer); computing only a total in the core and re-deriving lines in the component (duplicates leg traversal).
- **Source:** `plans/us-6/research.md`

### ADR: Cost basis snapshot on assignment — new row, `final_pnl=NULL`, position stays ACTIVE
- **Decision:** The assignment service inserts a new `cost_basis_snapshots` row with `final_pnl = NULL`. The position `status` remains `'ACTIVE'` and `closed_date` remains `NULL`. Only `phase` (-> `HOLDING_SHARES`) and `updated_at` change on the `positions` row.
- **Why:** Assignment is a phase transition, not a position close. The snapshot records the effective cost basis at the moment of assignment. `final_pnl` is only set when the wheel completes (CC close or expiry).
- **Alternatives considered:** No new snapshot (cost basis changes at assignment — it is now measured against the assignment strike minus all collected premiums, not just the initial CSP premium).
- **Source:** `plans/us-6/research.md`, `plans/us-6/data-model.md`

### ADR: Future assignment date — client-side warning only
- **Decision:** The `recordAssignment()` lifecycle engine does NOT throw a `ValidationError` for future dates. The future-date warning ("This date is in the future — are you sure?") is rendered client-side only as a gold soft warning; the form remains submittable.
- **Why:** Some brokers post assignment details over the weekend and the recorded date may technically be a future business day. The story explicitly states: "Future-date warning is client-side only; the backend does not reject future dates."
- **Alternatives considered:** Backend validation — explicitly rejected by the story spec.
- **Source:** `plans/us-6/research.md`, `docs/epics/02-stories/US-6-record-csp-assignment.md`

### ADR: `activeLeg` returns `null` for `HOLDING_SHARES` positions
- **Decision:** After assignment, the `getPosition` service's `activeLeg` query returns `null` for `HOLDING_SHARES` positions (the CSP option no longer exists as an open leg). The ASSIGN leg is an event marker, not an ongoing position.
- **Why:** Consistent with how `EXPIRE` legs work — they are appended as event markers. The `PositionDetailPage` already guards `activeLeg &&` before rendering the open leg card, so returning `null` is safe without a page rewrite.
- **Source:** `plans/us-6/research.md`

### ADR: Date validation parameters mirror `closeCsp` / `expireCsp`
- **Decision:** `recordAssignment()` accepts `{ currentPhase, assignmentDate, openFillDate }` and uses ISO string comparison (consistent with `closeCsp` and `expireCsp`). It validates `currentPhase === 'CSP_OPEN'` and `assignmentDate >= openFillDate`. The boundary case `assignmentDate === openFillDate` is valid.
- **Why:** Keeps the lifecycle engine pure (no DB access). The service looks up `openFillDate` from the open leg and passes it in. Matches the pattern established by US-4 / US-5.
- **Source:** `plans/us-6/plan.md`, `plans/us-6/data-model.md`

### ADR: Waterfall data source for the form state
- **Decision:** The `AssignmentSheet` needs the premium waterfall to render the form state before the assignment is submitted. `getPosition` already returns `legs: LegRecord[]`. Either (a) the page filters `legs` for `CSP_OPEN` and `ROLL_TO` roles and builds the `premiumWaterfall` prop inline (a pure display transform — acceptable in the page layer), or (b) `getPosition` returns a pre-computed waterfall. Either approach is acceptable; the choice is to be documented in code comments.
- **Why:** Both options avoid duplicating engine logic. The page-layer transform is leaner; pushing it into the service centralises the shape. Plan leaves the choice open.
- **Source:** `plans/us-6/plan.md`

## Contracts

### `positions:assign-csp`
- **Type:** IPC handler
- **Shape:**
  ```typescript
  // Request payload (Zod-validated via AssignCspPayloadSchema)
  {
    positionId: string      // UUID — the position to assign
    assignmentDate: string  // ISO date string YYYY-MM-DD
  }

  // Success response
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
    },
    leg: {
      id: string
      positionId: string
      legRole: 'ASSIGN'
      action: 'ASSIGN'
      instrumentType: 'STOCK'
      strike: string
      expiration: string
      contracts: number
      premiumPerContract: '0.0000'
      fillPrice: null
      fillDate: string         // the assignmentDate from payload
      createdAt: string
      updatedAt: string
    },
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: null
      snapshotAt: string
      createdAt: string
    },
    premiumWaterfall: Array<{
      label: string  // e.g. "CSP premium", "Roll credit"
      amount: string // premiumPerContract for that leg (per-share, 4dp)
    }>
  }

  // Error responses
  { ok: false, errors: [{ field: '__root__',       code: 'not_found',        message: string }] }
  { ok: false, errors: [{ field: '__root__',       code: 'no_active_leg',    message: string }] }
  { ok: false, errors: [{ field: '__phase__',      code: 'invalid_phase',    message: 'Assignment can only be recorded on a CSP_OPEN position' }] }
  { ok: false, errors: [{ field: 'assignmentDate', code: 'date_before_open', message: 'Assignment date cannot be before the CSP open date' }] }
  { ok: false, errors: [{ field: '__root__',       code: 'internal_error',   message: 'An unexpected error occurred' }] }
  ```
- **Source:** `plans/us-6/contracts/assign-csp.md`, `plans/us-6/data-model.md`
- **Implementation:** `src/main/ipc/positions.ts`, `src/main/services/assign-csp-position.ts`

### `AssignCspPayloadSchema`
- **Type:** Zod schema
- **Shape:**
  ```typescript
  z.object({
    positionId: z.string().uuid(),
    assignmentDate: z.string()   // ISO date string YYYY-MM-DD
  })
  ```
- **Source:** `plans/us-6/data-model.md`, `plans/us-6/contracts/assign-csp.md`
- **Implementation:** `src/main/schemas.ts`

### `AssignCspPositionResult`
- **Type:** other (IPC return type definition)
- **Shape:**
  ```typescript
  interface AssignCspPositionResult {
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
    }
    leg: LegRecord
    costBasisSnapshot: CostBasisSnapshotRecord
    premiumWaterfall: Array<{ label: string; amount: string }>
  }
  ```
- **Source:** `plans/us-6/data-model.md`, `plans/us-6/contracts/assign-csp.md`
- **Implementation:** `src/main/schemas.ts`

### `RecordAssignmentInput` / `RecordAssignmentResult` (lifecycle engine)
- **Type:** other (core lifecycle function signature)
- **Shape:**
  ```typescript
  interface RecordAssignmentInput {
    currentPhase: WheelPhase
    assignmentDate: string   // YYYY-MM-DD
    openFillDate: string     // YYYY-MM-DD — assignment must not precede this
  }

  interface RecordAssignmentResult {
    phase: 'HOLDING_SHARES'
  }
  ```
- **Source:** `plans/us-6/plan.md`, `plans/us-6/data-model.md`
- **Implementation:** `src/main/core/lifecycle.ts`

### `AssignmentBasisInput` / `AssignmentBasisResult` (cost basis engine)
- **Type:** other (core cost basis function signature)
- **Shape:**
  ```typescript
  interface AssignmentBasisLeg {
    legRole: LegRole           // 'CSP_OPEN' | 'ROLL_TO'
    premiumPerContract: string
    contracts: number
  }

  interface AssignmentBasisInput {
    strike: string
    contracts: number
    premiumLegs: AssignmentBasisLeg[]
  }

  interface AssignmentBasisResult {
    basisPerShare: string
    totalPremiumCollected: string
    sharesHeld: number
    premiumWaterfall: Array<{ label: string; amount: string }>
  }
  ```
- **Source:** `plans/us-6/data-model.md`, `plans/us-6/plan.md`
- **Implementation:** `src/main/core/costbasis.ts`

### `InstrumentType` (renamed from `OptionType`)
- **Type:** Zod schema / TypeScript type
- **Shape:**
  ```typescript
  export const InstrumentType = z.enum(['PUT', 'CALL', 'STOCK'])
  export type InstrumentType = z.infer<typeof InstrumentType>
  ```
- **Source:** `plans/us-6/data-model.md`, `plans/us-6/research.md`
- **Implementation:** `src/main/core/types.ts`

### `LegAction` (extended)
- **Type:** Zod schema / TypeScript type
- **Shape:**
  ```typescript
  export const LegAction = z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN'])
  export type LegAction = z.infer<typeof LegAction>
  ```
- **Source:** `plans/us-6/data-model.md`, `plans/us-6/research.md`
- **Implementation:** `src/main/core/types.ts`

### `LegRecord` (updated field rename)
- **Type:** Zod schema / TypeScript type
- **Shape:** Rename field `optionType: OptionType` -> `instrumentType: InstrumentType` (no other field changes).
- **Source:** `plans/us-6/data-model.md`
- **Implementation:** `src/main/schemas.ts`

### Renderer adapter — `assignPosition()`
- **Type:** other (renderer API adapter)
- **Shape:**
  ```typescript
  // Renderer payload type (snake_case form fields)
  type AssignCspPayload = {
    position_id: string
    assignment_date: string
  }

  // Response type
  type AssignCspResponse = {
    position: { id: string; ticker: string; phase: WheelPhase; status: WheelStatus }
    leg: { /* …LegRecord shape with camelCase from IPC… */ }
    costBasisSnapshot: { /* …snapshot shape… */ }
    premiumWaterfall: Array<{ label: string; amount: string }>
  }

  async function assignPosition(payload: AssignCspPayload): Promise<AssignCspResponse> {
    const result = await window.api.assignPosition({
      positionId:     payload.position_id,
      assignmentDate: payload.assignment_date
    })
    if (!result.ok) {
      throw apiError(400, { detail: mapIpcErrors(result.errors) })
    }
    return result as unknown as AssignCspResponse
  }
  ```
  `IPC_TO_FORM_FIELD` mapping addition: `assignmentDate: 'assignment_date'`.
- **Source:** `plans/us-6/contracts/assign-csp.md`, `plans/us-6/plan.md`
- **Implementation:** `src/renderer/src/api/positions.ts`

### Preload binding — `assignPosition`
- **Type:** other (preload contextBridge API)
- **Shape:**
  ```typescript
  assignPosition: (payload: unknown) => ipcRenderer.invoke('positions:assign-csp', payload)
  ```
- **Source:** `plans/us-6/plan.md`, `plans/us-6/contracts/assign-csp.md`
- **Implementation:** `src/preload/index.ts`

### Renderer hook — `useAssignPosition()`
- **Type:** other (TanStack Query mutation hook)
- **Shape:** Mirrors `useExpirePosition` exactly. On success, calls `queryClient.invalidateQueries({ queryKey: positionQueryKeys.all })`. Accepts an optional `onSuccess` callback receiving `AssignCspResponse`.
- **Source:** `plans/us-6/plan.md`
- **Implementation:** `src/renderer/src/hooks/useAssignPosition.ts`

### `AssignmentSheetProps`
- **Type:** other (React component props)
- **Shape:**
  ```typescript
  interface AssignmentSheetProps {
    open: boolean
    positionId: string
    ticker: string
    strike: string
    expiration: string
    contracts: number
    openFillDate: string  // for date_before_open validation
    premiumWaterfall: Array<{ label: string; amount: string }>
    projectedBasisPerShare: string
    onClose: () => void
  }
  ```
- **Source:** `plans/us-6/plan.md`
- **Implementation:** `src/renderer/src/components/AssignmentSheet.tsx`

## Schema Changes

### Migration `migrations/003_rename_option_type_to_instrument_type.sql` — rename column + expand CHECK constraint
- **Change:** renamed column + altered CHECK constraint on the `legs` table.
- **Columns / fields:**
  | Field             | Before                            | After                                     |
  | ----------------- | --------------------------------- | ----------------------------------------- |
  | `option_type`     | column name; CHECK `IN ('PUT','CALL')` | column renamed to `instrument_type`; CHECK `instrument_type IN ('PUT', 'CALL', 'STOCK')` |
- **Approach:** Prefer `ALTER TABLE legs RENAME COLUMN option_type TO instrument_type;` (SQLite ≥ 3.25.0). SQLite cannot modify a CHECK constraint in place, so the always-safe form is a table rebuild: create `legs_new` with `instrument_type` and the new CHECK, copy data, drop old, rename. The migration runner in `src/main/db/migrate.ts` discovers and runs files in `migrations/` in filename order.
- **Downstream code touches (no further schema change):**
  - All service SQL INSERTs for legs use `instrument_type` (was `option_type`): `services/positions.ts` (createPosition), `services/close-csp-position.ts`, `services/expire-csp-position.ts`.
  - `services/get-position.ts` updates the SELECT alias from `option_type as optionType` to `instrument_type as instrumentType`.
- **Source:** `plans/us-6/data-model.md`, `plans/us-6/plan.md`, `plans/us-6/quickstart.md`
- **Migration file:** `migrations/003_rename_option_type_to_instrument_type.sql`

### `positions` row UPDATE on assignment
- **Change:** altered row (no schema change)
- **Columns / fields:**
  | Field         | Before        | After             |
  | ------------- | ------------- | ----------------- |
  | `phase`       | `CSP_OPEN`    | `HOLDING_SHARES`  |
  | `status`      | `ACTIVE`      | `ACTIVE` (unchanged) |
  | `closed_date` | `NULL`        | `NULL` (unchanged)   |
  | `updated_at`  | open timestamp | assignment timestamp |
- **Source:** `plans/us-6/data-model.md`
- **Migration file:** none

### `legs` row INSERT — ASSIGN leg
- **Change:** new row (no schema change beyond migration 003)
- **Columns / fields:**
  | Field                  | Value                                          |
  | ---------------------- | ---------------------------------------------- |
  | `id`                   | new UUID                                       |
  | `position_id`          | parent position ID                             |
  | `leg_role`             | `'ASSIGN'`                                     |
  | `action`               | `'ASSIGN'`                                     |
  | `instrument_type`      | `'STOCK'`                                      |
  | `strike`               | copied from the CSP_OPEN leg (assignment price) |
  | `expiration`           | copied from the CSP_OPEN leg (for reference)   |
  | `contracts`            | copied from the CSP_OPEN leg                   |
  | `premium_per_contract` | `'0.0000'` (no premium on assignment itself)   |
  | `fill_price`           | `NULL`                                         |
  | `fill_date`            | `assignmentDate` from payload                  |
  | `created_at`           | now                                            |
  | `updated_at`           | now                                            |
- **Source:** `plans/us-6/data-model.md`
- **Migration file:** none

### `cost_basis_snapshots` row INSERT — assignment snapshot
- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field                     | Value                                                                 |
  | ------------------------- | --------------------------------------------------------------------- |
  | `id`                      | new UUID                                                              |
  | `position_id`             | parent position ID                                                    |
  | `basis_per_share`         | `strike − Σ(premiumPerContract)` for each CSP/roll-credit premium leg |
  | `total_premium_collected` | `Σ(premiumPerContract × leg.contracts × 100)` for all CSP/roll legs   |
  | `final_pnl`               | `NULL` (position still open)                                          |
  | `annualized_return`       | `NULL` (future story)                                                 |
  | `snapshot_at`             | now                                                                   |
  | `created_at`              | now                                                                   |
- **Source:** `plans/us-6/data-model.md`
- **Migration file:** none

## Domain Concepts

- **Assignment** — broker-initiated stock delivery on a CSP that finishes in-the-money (or is exercised early). The trader records this manually after seeing shares in their brokerage; shares typically appear Monday morning after a Friday expiration. (Source: `docs/epics/02-stories/US-6-record-csp-assignment.md`)
- **Phase transition `CSP_OPEN -> HOLDING_SHARES`** — the position keeps `status='ACTIVE'` and `closed_date=NULL`; only `phase` (and `updated_at`) change. The wheel is still in flight; the trader now sells covered calls against the shares. (Source: `plans/us-6/data-model.md`, `plans/us-6/research.md`)
- **Effective cost basis** — `assignment_strike − Σ(premium_per_contract)` across the CSP open leg and any roll credits. This is the trader's break-even per share before selling covered calls. (Source: `docs/epics/02-stories/US-6-record-csp-assignment.md`, `plans/us-6/data-model.md`)
- **Premium waterfall** — an ordered display list of every premium-collecting leg (one per `CSP_OPEN` and one per `ROLL_TO`), each rendered as `"− <label> $<amount>"` in the summary card. Label is `'CSP premium'` or `'Roll credit'` based on `legRole`. (Source: `plans/us-6/research.md`, `plans/us-6/data-model.md`)
- **Shares held (derived)** — `contracts × 100`. Never user-entered; computed by the cost basis engine and returned as `sharesHeld`. (Source: `docs/epics/02-stories/US-6-record-csp-assignment.md`, `plans/us-6/data-model.md`)
- **`InstrumentType`** — Zod enum covering options and stocks: `PUT | CALL | STOCK`. Replaces the narrower `OptionType` so the same `legs` table can carry the stock-holding event marker. (Source: `plans/us-6/research.md`, `plans/us-6/data-model.md`)
- **ASSIGN leg as event marker** — like `EXPIRE`, the `ASSIGN` leg is an event marker, not an ongoing position. `getPosition.activeLeg` returns `null` for `HOLDING_SHARES` positions because the CSP option no longer exists as an open leg. (Source: `plans/us-6/research.md`)
- **Strategic nudge** — UX prompt on the success state: "Many traders wait 1–3 days for a bounce before selling the first covered call — avoid locking in a low strike right after assignment." Rendered as a blue `AlertBox variant="info"` above the "Open Covered Call" CTA. (Source: `docs/epics/02-stories/US-6-record-csp-assignment.md`, `plans/us-6/plan.md`)
- **Irrevocable warning** — gold `AlertBox variant="warning"` shown in the form state: "**This cannot be undone.** The position will transition to Holding Shares. Full leg history is preserved." (Source: `plans/us-6/plan.md`)

## Acceptance Criteria

- Scenario: Successfully record an assignment
  - Given the CSP strike is $180.00, 1 contract, $3.50 premium per contract collected
  - When the trader submits the assignment form with assignment date "2026-01-17"
  - Then the position phase changes to HOLDING_SHARES
  - And the position shows 100 shares held at assignment strike $180.00
  - And the effective cost basis displays as $176.50 per share
  - And a `stock_assignment` leg is recorded with `fill_date "2026-01-17"`
- Scenario: Summary card shows the full premium waterfall
  - When the assignment form opens for a CSP at $180.00 with $3.50 premium collected
  - Then the summary card shows: `Assignment strike $180.00`, `− CSP premium $3.50`, `= Effective cost basis $176.50`
- Scenario: Cost basis accounts for all CSP premiums including rolls
  - Given the position collected $2.00 on the initial CSP and $1.50 credit on a roll, strike $175.00, 1 contract
  - When the trader submits the assignment form with any valid date
  - Then the waterfall shows `$175.00 − $2.00 − $1.50 = $171.50` per share
- Scenario: Future assignment date shows a soft warning but remains submittable
  - Given the CSP was opened on "2026-01-03"
  - When the trader enters assignment date "2026-12-19"
  - Then a warning appears: "This date is in the future — are you sure?"
  - And the Confirm Assignment button remains enabled
- Scenario: Reject submission when assignment date is missing
  - When the trader submits the form without an assignment date
  - Then a validation error appears: "Assignment date is required"
  - And no leg is created
- Scenario: Reject assignment date before the CSP open date
  - Given the CSP was opened on "2026-01-03"
  - When the trader submits with assignment date "2026-01-02"
  - Then a validation error appears: "Assignment date cannot be before the CSP open date"
  - And no leg is created
- Scenario: Reject assignment if position is not in CSP_OPEN phase
  - Given the position is in HOLDING_SHARES phase
  - When the trader attempts to record an assignment
  - Then the action is rejected with message "Assignment can only be recorded on a CSP_OPEN position"
  - And the position remains in HOLDING_SHARES
- Scenario: Success state shows strategic nudge before CC CTA
  - Given the assignment has been confirmed
  - Then the success screen shows: "Many traders wait 1–3 days for a bounce before selling the first covered call — avoid locking in a low strike right after assignment."
  - And the "Open Covered Call" CTA is visible below the nudge

(Source: `docs/epics/02-stories/US-6-record-csp-assignment.md`)

## Decisions & Tradeoffs

- The boundary case `assignmentDate === openFillDate` is **valid** (assignment on the same day the CSP was opened passes validation). (Source: `plans/us-6/plan.md`)
- The "Record Assignment →" button is only rendered in the position detail header when `position.phase === 'CSP_OPEN'` — gating the action at the UI in addition to the lifecycle engine's `invalid_phase` check. (Source: `plans/us-6/plan.md`, `docs/epics/02-stories/US-6-record-csp-assignment.md`)
- `PositionDetailPage` applies the same blur/opacity styling to `<main>` when `showAssignment` is true that it already applies for `showExpiration` (consistent with US-5's ExpirationSheet pattern). Plan suggests considering whether the two conditions can be combined cleanly during refactor. (Source: `plans/us-6/plan.md`)
- The `AssignmentSheet` is a 400px right-side sheet rendered via `createPortal` to `document.body` — identical pattern to `ExpirationSheet`. It has two internal states: form and success. (Source: `plans/us-6/plan.md`)
- The success state's hero card uses hand-crafted inline styles for a gold gradient ("HOLDING N SHARES" headline). All other styling uses the shared `wb-*` tokens and the project's UI primitives (`SectionCard`, `Badge`, `Field`, `AlertBox`, `FormButton`, `Button`, `Caption`, `ErrorAlert`). (Source: `plans/us-6/plan.md`)
- The `useAssignPosition` hook invalidates `positionQueryKeys.all` on success (mirrors `useExpirePosition`). The "Open Covered Call on `<ticker>` →" CTA navigates to the open-CC route (defined by US-7, not implemented here). (Source: `plans/us-6/plan.md`)
- The waterfall data source for the form-state render is left as a choice between (a) page-layer transform from `getPosition().legs` filtered by role, or (b) pre-computed in the `getPosition` service. The implementer documents the choice in code comments. (Source: `plans/us-6/plan.md`)
- Future-date is a soft warning only; the backend explicitly accepts future `assignmentDate` values. (Source: `plans/us-6/research.md`, `plans/us-6/contracts/assign-csp.md`)
- Error `field` naming follows the established convention: `__phase__` for phase-mismatch, `__root__` for not-found / no-active-leg / internal, and the actual field name (`assignmentDate`) for field-level validation errors. (Source: `plans/us-6/contracts/assign-csp.md`, `plans/us-6/data-model.md`)
- All arithmetic in `calculateAssignmentBasis` uses `decimal.js` with `ROUND_HALF_UP` at 4 dp; no native float operations. (Source: `plans/us-6/plan.md`)
- The migration runner picks up `003_` files automatically (filename order). After writing the migration, `better-sqlite3` must be rebuilt for both Electron and system Node, as noted in `quickstart.md`. (Source: `plans/us-6/quickstart.md`)
- IPC handler test coverage relies primarily on service-level integration tests + E2E; the plan permits adding IPC-level tests if a harness exists. (Source: `plans/us-6/plan.md`)
- **No `refactor-phase-results.md` is present in `plans/us-6/`** — this extract has no authoritative refactor-phase decisions section. If/when one lands, it should be incorporated via `/update-spec us-6`.

## Source Code References

- `migrations/003_rename_option_type_to_instrument_type.sql`
- `src/main/db/migrate.ts`
- `src/main/db/migrate.test.ts`
- `src/main/core/types.ts`
- `src/main/core/types.test.ts`
- `src/main/core/lifecycle.ts`
- `src/main/core/lifecycle.test.ts`
- `src/main/core/costbasis.ts`
- `src/main/core/costbasis.test.ts`
- `src/main/schemas.ts`
- `src/main/services/assign-csp-position.ts`
- `src/main/services/assign-csp-position.test.ts`
- `src/main/services/get-position.ts`
- `src/main/services/positions.ts`
- `src/main/services/close-csp-position.ts`
- `src/main/services/expire-csp-position.ts`
- `src/main/ipc/positions.ts`
- `src/main/ipc/utils.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/positions.ts`
- `src/renderer/src/hooks/useAssignPosition.ts`
- `src/renderer/src/components/AssignmentSheet.tsx`
- `src/renderer/src/components/AssignmentSheet.test.tsx`
- `src/renderer/src/pages/PositionDetailPage.tsx`
- `src/renderer/src/pages/PositionDetailPage.test.tsx`
- `e2e/csp-assignment.spec.ts`

## Open Questions

- No `plans/us-6/refactor-phase-results.md` exists, so it is unknown whether the implementation surfaced any refactor decisions or remaining tech debt. Re-run `/update-spec us-6` once the refactor-phase results are recorded.
- Plan leaves open whether the premium waterfall is computed at the page layer (filter `getPosition().legs`) or in the `getPosition` service. The chosen approach should be documented in code comments. (Source: `plans/us-6/plan.md`)
- One E2E test (waterfall with rolls) is conditional on US-4/US-5 roll functionality being e2e-testable; otherwise it is marked `it.todo` to be enabled later. (Source: `plans/us-6/plan.md`)

Deferred / out of scope (noted in story, not unresolved):
- Automatic assignment detection via Alpaca polling (Epic 06)
- **Partial assignment** — multi-contract positions where only some contracts are assigned (requires a mixed-phase lifecycle model; deferred)
- Early assignment before expiration date (treated identically to expiration assignment; no special handling in Phase 1)
- Dividend tracking during the holding phase (future epic)
- PMCC short call assignment (Epic 09)

(Source: `docs/epics/02-stories/US-6-record-csp-assignment.md`)
