# Research: US-7 — Open Covered Call

## Lifecycle Transition: HOLDING_SHARES → CC_OPEN

- **Decision:** Add `openCoveredCall()` function to `src/main/core/lifecycle.ts` following the same pattern as `recordAssignment()`.
- **Rationale:** The lifecycle engine is a pure state machine. The new function validates the current phase is `HOLDING_SHARES`, validates input constraints (fill date ≥ assignment date, contracts ≤ position contracts), and returns `{ phase: 'CC_OPEN' }`.
- **Alternatives considered:** None — the pattern is established and consistent.

## Cost Basis After CC Open

- **Decision:** Add `calculateCcOpenBasis()` to `src/main/core/costbasis.ts`. Formula: `newBasisPerShare = prevBasisPerShare − ccPremiumPerContract`. Total premium: `prevTotal + (ccPremium × contracts × 100)`.
- **Rationale:** The cost basis engine uses `decimal.js` with `ROUND_HALF_UP` and 4dp precision. CC premium reduces cost basis because the trader receives a credit.
- **Alternatives considered:** Could fold into `calculateAssignmentBasis()`, but that conflates two distinct events. Separate function is cleaner and follows Open/Closed Principle.

## CC Leg Structure

- **Decision:** `legRole: 'CC_OPEN'`, `action: 'SELL'`, `instrumentType: 'CALL'`. All three enum values already exist in `src/main/core/types.ts`.
- **Rationale:** Selling a covered call is a SELL action on a CALL instrument. The types are already defined.
- **Alternatives considered:** None needed.

## Contracts Validation

- **Decision:** Validate `contracts ≤ position.contracts` in the service layer by querying the ASSIGN leg's contracts from the leg history.
- **Rationale:** The ASSIGN leg stores the number of contracts assigned (and therefore shares held). The lifecycle engine validates the phase; the service layer validates business constraints like contract limits.
- **Alternatives considered:** Could validate in the lifecycle engine, but that would require passing position contract count as input, coupling the engine to DB query results.

## Fill Date Validation

- **Decision:** Validate fill date ≥ assignment date (from the ASSIGN leg's fill_date) and fill date ≤ today (reference date). Both checks happen in the lifecycle engine as pure date comparisons.
- **Rationale:** Follows the pattern of `openWheel()` which validates fill date ≤ reference date, and `recordAssignment()` which validates assignment date ≥ open fill date.
- **Alternatives considered:** None — consistent with existing validation patterns.

## Cost Basis Guardrail (Client-Side)

- **Decision:** Implement guardrail logic as a pure function in the `OpenCoveredCallSheet` component. Compares strike to `basisPerShare` from the current cost basis snapshot. No server-side validation — the warning is informational only.
- **Rationale:** The story explicitly states the guardrail is client-side only. The Confirm button remains enabled regardless. This is a UX aid, not a business rule.
- **Alternatives considered:** Could implement as a shared utility, but it's a 10-line function specific to this sheet.

## DB Schema Changes

- **Decision:** No migration needed. The `legs` table already supports all required fields (leg_role, action, instrument_type, strike, expiration, contracts, premium_per_contract, fill_date). The `cost_basis_snapshots` table already supports the new snapshot.
- **Rationale:** The schema was designed generically to support all leg types.
- **Alternatives considered:** None needed.

## Sheet Component Pattern

- **Decision:** Create `OpenCoveredCallSheet.tsx` following the `AssignmentSheet.tsx` pattern — portal-based right-side panel with form state → success state transition.
- **Rationale:** The mockup shows the same sheet pattern: right-side panel, header/body/footer, form fields, guardrail alert, success hero card.
- **Alternatives considered:** Could use a modal, but the mockup explicitly shows a sheet panel matching the existing pattern.
