# Option Wheel Manager — Phase 1 User Stories
### Core Engine + Manual Trade Entry

*Covers the foundational data model, Wheel Lifecycle Engine, Cost Basis Engine, and manual trade entry UI. No broker connection required in this phase — all data is entered manually. The goal of Phase 1 is to prove the core math is correct before adding complexity.*

*Each story is a **vertical slice**: it touches the database, backend engine, API, and frontend together. Infrastructure (schema, engine logic) is introduced in the first story that needs it, not as separate standalone stories.*

---

## Stories

1. [Open a new wheel (sell a CSP)](#us-1--open-a-new-wheel-sell-a-csp)
2. [Mark a CSP expired worthless](#us-2--mark-a-csp-expired-worthless)
3. [Record CSP assignment](#us-3--record-csp-assignment)
4. [Open a covered call](#us-4--open-a-covered-call)
5. [Record a CC outcome](#us-5--record-a-cc-outcome)
6. [Record shares called away](#us-6--record-shares-called-away)
7. [Roll a position](#us-7--roll-a-position)
8. [Close a position early (buy-to-close)](#us-8--close-a-position-early-buy-to-close)
9. [View active positions dashboard](#us-9--view-active-positions-dashboard)
10. [View position detail and leg history](#us-10--view-position-detail-and-leg-history)
11. [View and review closed positions](#us-11--view-and-review-closed-positions)
12. [Add and edit trade notes](#us-12--add-and-edit-trade-notes)

---

## US-1 — Open a new wheel (sell a CSP)

**As a** wheel trader,
**I want** to enter a new cash-secured put I've sold,
**so that** the wheel is created in my journal and I can start tracking its progress and cost basis from the first leg.

This is the "hello world" story. It establishes the foundational schema and engine wiring that all subsequent stories build on.

    **Acceptance Criteria:**

     *Database (introduced here, reused by all subsequent stories):*
     - Alembic migrations create:
       - `positions` table with columns: `id`, `ticker`, `strategy_type`, `status`, `phase`, `opened_date`, `closed_date`, `account_id`,
  `notes`, `thesis`, `tags`, `created_at`, `updated_at`
       - `legs` table with columns: `id`, `position_id` (FK), `leg_role`, `action`, `option_type`, `strike`, `expiration`, `contracts`,
  `premium_per_contract`, `fill_price`, `fill_date`, `order_id`, `roll_chain_id`, `created_at`, `updated_at`
       - `cost_basis_snapshots` table with columns: `id`, `position_id` (FK), `basis_per_share`, `total_premium_collected`, `final_pnl`
  (nullable), `annualized_return` (nullable), `snapshot_at`, `created_at`
     - DB enums are enforced for:
       - `strategy_type`: `WHEEL`
       - `status`: `active`, `paused`, `closed`
       - `phase`: `CSP_OPEN`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, `HOLDING_SHARES`, `CC_OPEN`, `CC_EXPIRED`,
  `CC_CLOSED_PROFIT`, `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`
       - `leg_role`: `csp`, `short_cc`, `stock_assignment`
       - `action`: `open`, `close`, `expire`, `assign`, `exercise`, `roll_from`, `roll_to`
       - `option_type`: `put`, `call`, `stock`
     - Defaults: `status = active`, `phase = CSP_OPEN`, `opened_date = current_date` when omitted.
     - `premium_per_contract` stores the **per-share quoted price** (e.g., $2.00 for a contract worth $200). The ×100 multiplier is
  applied by the engine, not the caller. Positive = credit received; negative = debit paid.
     - Monetary fields (`strike`, `premium_per_contract`, `fill_price`, `basis_per_share`, `total_premium_collected`, `final_pnl`) use
  `NUMERIC(12, 4)` — no float storage.
     - `tags` is stored as a Postgres `text[]` array, serialized as a JSON string array in the API.
     - `roll_chain_id` is a UUID, nullable, generated at roll time and shared between the `roll_from` and `roll_to` legs of the same roll.
     - `account_id` is a free-text label in Phase 1; no accounts table and no referential constraint.
     - `final_pnl` and `annualized_return` on `cost_basis_snapshots` are `NULL` until wheel completion (populated by US-6).
     - Indexes exist for `positions(status, phase)`, `positions(ticker)`, and `legs(position_id, fill_date)`.

     *Backend — Lifecycle Engine (introduced here):*
     - Creating a `WHEEL` position with a `csp / open` leg returns phase `CSP_OPEN`.
     - Engine is pure: no imports from DB, ORM, HTTP, or broker integrations.
     - Validation rejects:
       - ticker not matching `^[A-Z]{1,5}$`
       - strike ≤ 0
       - contracts ≤ 0 or non-integer
       - premium_per_contract ≤ 0
       - fill_date in the future
       - expiration not strictly after fill_date
     - Unit tests cover the happy path and each invalid-input rejection path.

     *Backend — Cost Basis Engine (introduced here):*
     - After the first CSP leg, a snapshot is produced with:
       - `basis_per_share = strike − premium_per_contract`
       - `total_premium_collected = premium_per_contract × contracts × 100`
     - Engine is pure and deterministic (same inputs → same outputs).
     - Unit tests validate exact `Decimal` results (no float tolerance).
     - Rounding is `ROUND_HALF_UP` to 4 decimal places internally; displayed values are rounded to 2.

     *Backend — API:*
     - `POST /positions` creates position + opening leg + first cost-basis snapshot in **one DB transaction**. If any step fails, the
  transaction is rolled back and nothing is persisted.
     - Request body:
       - `ticker` (required, uppercase 1–5 chars)
       - `strike` (required, decimal > 0)
       - `expiration` (required, ISO date, must be after fill_date)
       - `contracts` (required, integer > 0)
       - `premium_per_contract` (required, decimal > 0, per-share quoted price)
       - `fill_date` (optional, ISO date, defaults to today; past dates allowed, future dates rejected)
       - optional: `account_id`, `thesis`, `notes`
     - Success response: `201 Created` with full created resource including `position`, opening `leg`, and first `cost_basis_snapshot`.
     - Validation failure response: `400` with field-level errors:
       - `{ "detail": [ { "field": "ticker", "code": "invalid_format", "message": "..." } ] }`
     - Server error response: `500` with `{ "detail": "Internal server error" }`.
     - Duplicate submissions are allowed in Phase 1. No idempotency key is required. A second identical POST creates a second position.

     *Frontend:*
     - "New Wheel" form fields (required): ticker, strike, expiration, contracts, premium per contract.
     - "New Wheel" form fields (optional, in a collapsed "Advanced" section): fill date (defaults to today), thesis, notes.
     - `account_id` and `tags` are not on the creation form; they are editable post-creation via US-12.
     - Ticker is normalized to uppercase before submit.
     - Validation runs on blur and on submit; field error messages map 1:1 with backend error fields.
     - Submit button is disabled while the request is in-flight; double-submit is prevented.
     - On success, an inline confirmation panel appears below the form showing:
       - ticker
       - contracts
       - premium collected (`premium × contracts × 100`)
       - initial effective cost basis per share
     - After 2 seconds or on user action, navigation proceeds to the newly created position's detail page.
     - On server or network error, an inline error message is shown above the submit button and the button is re-enabled.
     - Form is keyboard navigable (tab order, Enter submit, focus moves to first invalid field on submit failure).
     - Basic accessibility checks pass for labels, error announcements, and button semantics.
---

## US-2 — Mark a CSP expired worthless

**As a** wheel trader,
**I want** to record that my cash-secured put expired worthless,
**so that** the full premium is locked in as profit and I can decide whether to open another CSP or close the wheel.

**Acceptance Criteria:**

*Backend — Lifecycle Engine:*
- Adding a `csp / expire` Leg to a `CSP_OPEN` position transitions phase to `CSP_EXPIRED`
- The engine rejects this action on any other phase
- Unit test covers the transition and the rejection

*Backend — Cost Basis Engine:*
- A new snapshot is written; `total_premium_collected` reflects the full original premium
- The `basis_per_share` drops to zero (full premium offsets the notional basis) if premiums exceed the strike

*Backend — API:*
- `POST /positions/{id}/expire` accepts no body (all data is already on record), writes the expire Leg, and returns the updated position with the new snapshot

*Frontend:*
- From a position card or detail view in `CSP_OPEN` phase, a "Mark Expired" button is shown
- A confirmation dialog displays: ticker, strike, expiration, and the dollar profit being captured
- On confirm, the position card updates immediately to reflect the new phase and a prompt to open another CSP or close the wheel

---

## US-3 — Record CSP assignment

**As a** wheel trader,
**I want** to record that my cash-secured put was assigned and I've taken delivery of shares,
**so that** the wheel transitions to the share-holding phase with a correctly recalculated cost basis.

**Acceptance Criteria:**

*Backend — Lifecycle Engine:*
- Adding an `assign` action Leg to a `CSP_OPEN` position transitions phase to `HOLDING_SHARES`
- The engine blocks any further `csp / open` Legs while in `HOLDING_SHARES`
- Unit tests cover the transition and the blocking

*Backend — Cost Basis Engine:*
- On assignment, cost basis is recalculated as: `csp_strike − all_csp_premiums_collected`
- A new snapshot is written with this adjusted basis and the running premium total
- Unit test validates the formula against a hand-computed example (e.g., sold CSP at $50 strike for $1.50 premium → basis = $48.50)

*Backend — API:*
- `POST /positions/{id}/assign` writes the assignment Leg and returns the updated position with the new cost basis snapshot

*Frontend:*
- A "Record Assignment" button appears on any `CSP_OPEN` position
- A confirmation dialog shows: ticker, number of shares incoming (contracts × 100), and the effective cost basis per share that will result
- No manual data entry required — the strike is pre-filled from the open CSP leg
- On confirm, the position card updates to the `HOLDING_SHARES` phase immediately

---

## US-4 — Open a covered call

**As a** wheel trader,
**I want** to enter a covered call I've sold against shares I'm holding,
**so that** I continue collecting premium and reducing my effective cost basis.

**Acceptance Criteria:**

*Backend — Lifecycle Engine:*
- Adding a `short_cc / open` Leg to a `HOLDING_SHARES` position transitions phase to `CC_OPEN`
- The engine rejects a CC leg on any position not in `HOLDING_SHARES` (or `CC_CLOSED_PROFIT` for follow-on CCs)
- Unit tests cover the happy path and the rejection

*Backend — Cost Basis Engine:*
- A new snapshot is written; `basis_per_share` decreases by the CC premium per share
- Unit test confirms cumulative reduction across multiple CCs

*Backend — API:*
- `POST /positions/{id}/legs` with `leg_role = short_cc` and `action = open` creates the leg and returns the updated position with the new snapshot

*Frontend:*
- "Sell Covered Call" is only shown on positions in `HOLDING_SHARES` phase
- Form fields: strike price, expiration date, contracts (pre-filled from share count), premium received per contract
- The current effective cost basis is displayed alongside the form
- If the strike entered is below the current cost basis, a warning appears: "This strike would lock in a loss if called away"
- Success confirmation shows the updated effective cost basis

---

## US-5 — Record a CC outcome

**As a** wheel trader,
**I want** to mark a covered call as either expired worthless or closed early for a profit,
**so that** the income is captured, the cost basis updates, and I can sell another CC or rest the position.

**Acceptance Criteria:**

*Backend — Lifecycle Engine:*
- `short_cc / expire` on a `CC_OPEN` position → `CC_EXPIRED`
- `short_cc / close` on a `CC_OPEN` position → `CC_CLOSED_PROFIT`
- Both transitions return the position to a state where a new CC can be opened
- The engine rejects either action if the position is not `CC_OPEN`
- Unit tests cover both paths and the rejection

*Backend — Cost Basis Engine:*
- For expiration: the full CC premium is added to `total_premium_collected`
- For early close: the net gain (`original_premium − close_fill_price`) is added to `total_premium_collected`; a negative net is possible and is recorded accurately
- New snapshot written after either event

*Backend — API:*
- `POST /positions/{id}/expire` handles CC expiration (same endpoint as CSP, resolves correct leg from current phase)
- `POST /positions/{id}/close` accepts `{ fill_price, fill_date }` for an early close

*Frontend:*
- "Mark Expired" and "Close Early" buttons are shown on `CC_OPEN` positions
- "Mark Expired" uses the same confirmation-only dialog as the CSP expiration flow
- "Close Early" form shows a single buy-to-close price field; the app computes and displays the estimated net gain before the user confirms
- On success, a prompt offers to open the next CC or rest the position

---

## US-6 — Record shares called away

**As a** wheel trader,
**I want** to record when my covered call is assigned and my shares are sold,
**so that** the wheel is marked complete, the final P&L is calculated, and I can start a new cycle.

**Acceptance Criteria:**

*Backend — Lifecycle Engine:*
- `short_cc / assign` on a `CC_OPEN` position → `WHEEL_COMPLETE`; position `status` is set to `closed` automatically
- The engine rejects this action if the position is not `CC_OPEN`
- Unit test covers the transition, the auto-close, and the rejection

*Backend — Cost Basis Engine:*
- Final P&L: `(call_strike × contracts × 100) + total_premiums_collected − initial_capital_deployed`
- `initial_capital_deployed` = `csp_strike × contracts × 100`
- The final snapshot stores this P&L and an `annualized_return` value: `(total_premiums / capital_deployed) × (365 / days_active)`, rounded to two decimal places
- Unit tests validate both formulas against hand-computed full-wheel examples

*Backend — API:*
- `POST /positions/{id}/assign` (same endpoint as CSP assignment; resolves context from current phase) writes the leg, finalizes the position, and returns the closed position with the final P&L snapshot

*Frontend:*
- "Record Assignment" on a `CC_OPEN` position triggers a confirmation showing the final P&L and annualized return
- On confirm, the position moves to the closed view with a summary card and a "Start New Wheel on [ticker]" shortcut that pre-fills the ticker on the new CSP form

---

## US-7 — Roll a position

**As a** wheel trader,
**I want** to record a roll — closing one option leg and immediately opening a replacement — as a single atomic operation,
**so that** the full roll history is preserved as a linked pair and the cost basis updates correctly.

**Acceptance Criteria:**

*Backend — Lifecycle Engine:*
- A roll is two linked Legs: `roll_from` (closing the existing leg) and `roll_to` (opening the new leg), sharing a `roll_chain_id`
- The position phase does not change on a roll (a rolled CSP stays `CSP_OPEN`; a rolled CC stays `CC_OPEN`)
- The engine enforces the new expiration is strictly after the closed expiration
- Unit tests cover: roll-for-credit CSP, roll-for-debit CC, roll to a different strike, and rejection when new expiration is not later

*Backend — Cost Basis Engine:*
- Net roll credit (positive) reduces `basis_per_share`; net roll debit (negative) increases it
- A new snapshot is written after both legs are saved

*Backend — API:*
- `POST /positions/{id}/roll` accepts `{ close_fill_price, close_fill_date, new_strike, new_expiration, new_premium }` and writes both legs in a single DB transaction — if either write fails, neither is committed

*Frontend:*
- A "Roll" button is shown on any `CSP_OPEN` or `CC_OPEN` position
- The roll form shows two sections: "Close existing leg" (pre-filled, read-only) and "Open new leg" (trader fills in)
- The app computes and displays the net roll credit or debit in real time as the trader fills in the new leg
- The form blocks submission if the new expiration is not after the existing expiration, with an inline error
- The confirmation shows the updated cost basis after the roll

---

## US-8 — Close a position early (buy-to-close)

**As a** wheel trader,
**I want** to record buying-to-close an option outright (not rolling into a new one),
**so that** I can take profit, cut a loss, or free up capital without waiting for expiration.

**Acceptance Criteria:**

*Backend — Lifecycle Engine:*
- `csp / close` on `CSP_OPEN` → `CSP_CLOSED_PROFIT` (or `CSP_CLOSED_LOSS` if fill_price > original premium)
- `short_cc / close` on `CC_OPEN` → `CC_CLOSED_PROFIT` (or `CC_CLOSED_LOSS`)
- The engine rejects a close action if the position is not in an open-option phase
- Unit tests cover both legs and both profit/loss outcomes

*Backend — Cost Basis Engine:*
- Net gain/loss for the closed leg = `original_premium − fill_price` per contract × contracts × 100
- Added (or subtracted) from `total_premium_collected`; new snapshot written

*Backend — API:*
- `POST /positions/{id}/close` accepts `{ fill_price, fill_date }` and returns the updated position

*Frontend:*
- "Close Early" button is shown on any `CSP_OPEN` or `CC_OPEN` position
- Form has a single fill-price field; the app displays the resulting P&L on this leg before the trader confirms
- After a close, the trader is offered: "Open new CSP/CC" or "Rest this position"

---

## US-9 — View active positions dashboard

**As a** wheel trader,
**I want** to see all my active positions at a glance with the key metrics for each,
**so that** I can quickly assess where each wheel stands and decide what action to take.

**Acceptance Criteria:**

*Backend — API:*
- `GET /positions?status=active` returns all active positions with computed fields: `dte` (days to expiration from today), `total_premium_collected`, `basis_per_share`, and `annualized_return`
- Response is sortable by `ticker`, `dte`, and `total_premium_collected` via query params

*Frontend:*
- The dashboard lists each active position showing: ticker, phase badge, contracts, current strike, expiration date, DTE, total premium collected, and effective cost basis per share
- The list is sortable by ticker, DTE, and total premium by clicking column headers
- Each row has contextual action buttons matching the position's current phase (e.g., "Mark Expired", "Record Assignment", "Sell CC", "Roll")
- Empty state shows a prompt to open the first wheel
- View is responsive and usable at standard laptop width

---

## US-10 — View position detail and leg history

**As a** wheel trader,
**I want** to click into a position and see its complete history — every leg, roll, and event in order,
**so that** I can review every decision I've made and understand how the cost basis has evolved.

**Acceptance Criteria:**

*Backend — API:*
- `GET /positions/{id}` returns the position with all legs in chronological order and all cost basis snapshots

*Frontend:*
- The detail view shows: current effective cost basis and total premium collected prominently at the top, followed by the full leg history
- Each leg row shows: action, leg role, strike, expiration, contracts, premium, fill date, and the net P&L contribution of that leg
- Rolls are visually grouped as a pair (close + open) with the net credit or debit for the roll shown
- The cost basis per share at each snapshot is shown inline with the leg that triggered it
- The view is accessible from the dashboard list via click or keyboard

---

## US-11 — View and review closed positions

**As a** wheel trader,
**I want** to browse wheels that have been completed or closed early,
**so that** I can review past performance and learn from previous trades.

**Acceptance Criteria:**

*Backend — API:*
- `GET /positions?status=closed` returns closed positions sorted by `closed_date` descending; includes `total_premium_collected`, `final_pnl`, `annualized_return`, and `days_active`

*Frontend:*
- A "Closed" tab or filter on the dashboard shows the closed positions list
- Each row shows: ticker, opened date, closed date, days active, total premium collected, final P&L, and outcome label (e.g., "Wheel Complete", "Closed Early")
- Closed positions are read-only — no action buttons are shown
- Clicking a closed position opens the same detail view (US-10) in read-only mode

---

## US-12 — Add and edit trade notes

**As a** wheel trader,
**I want** to write a trade thesis and ongoing notes on any position,
**so that** I can record my reasoning when I open the trade and log observations as the wheel progresses.

**Acceptance Criteria:**

*Backend — API:*
- `PATCH /positions/{id}` accepts `{ thesis, notes }` and updates those fields without touching any Leg or triggering the Cost Basis Engine
- Returns the updated position

*Frontend:*
- The position detail view (US-10) has a notes section below the leg history
- `thesis` is a short-form field for the original entry rationale; `notes` is a multi-line field for ongoing observations
- Both fields are editable inline — clicking the field activates an edit mode; a Save button commits the change
- Notes display with the timestamp of the last edit
- Plain text only; markdown rendering is out of scope for Phase 1

---

## Story Summary

| ID | Title | Priority |
|---|---|---|
| US-1 | Open a new wheel (sell a CSP) | Must Have |
| US-2 | Mark a CSP expired worthless | Must Have |
| US-3 | Record CSP assignment | Must Have |
| US-4 | Open a covered call | Must Have |
| US-5 | Record a CC outcome | Must Have |
| US-6 | Record shares called away | Must Have |
| US-7 | Roll a position | Must Have |
| US-8 | Close a position early (buy-to-close) | Must Have |
| US-9 | View active positions dashboard | Must Have |
| US-10 | View position detail and leg history | Must Have |
| US-11 | View and review closed positions | Should Have |
| US-12 | Add and edit trade notes | Should Have |

*12 stories. Each is a complete user action, end to end.*
