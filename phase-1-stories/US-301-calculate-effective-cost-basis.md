# US-301 — Calculate effective cost basis for Classic Wheel

**Epic:** Cost Basis Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** the app to automatically calculate my effective cost basis across the full lifecycle of a wheel,
**so that** I always know the true break-even price that accounts for all premiums collected and debits paid.

---

## Acceptance Criteria

- The engine implements the formula:
  `effective_cost_basis = assignment_strike − all_CSP_premiums + all_roll_debits − all_roll_credits − all_CC_premiums`
- The engine is invoked after every Leg is added and writes a new `CostBasisSnapshot`
- Before assignment: cost basis reflects the CSP strike minus premiums (notional basis)
- After assignment: cost basis is reset to the assignment strike and then CC premiums are subtracted
- The basis can go negative (meaning you've collected more premium than the stock cost — full profit locked in)
- Unit test suite covers: CSP-only (no assignment), single assignment with one CC, multiple CC rolls, roll-for-debit that increases basis, roll-for-credit that decreases basis
- All calculations are validated against hand-computed examples from the spec
