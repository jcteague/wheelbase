# US-303 — Calculate annualized return on capital

**Epic:** Cost Basis Engine
**Priority:** Should Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** the app to calculate the annualized return on capital for each wheel,
**so that** I can compare positions on a like-for-like basis regardless of how long they've been open.

---

## Acceptance Criteria

- Formula: `annualized_return = (total_premium_collected / capital_deployed) × (365 / days_active)`
- `capital_deployed` for a Classic Wheel is `CSP_strike × contracts × 100`
- `days_active` is calculated from `opened_date` to today (or `closed_date` for closed positions)
- Returned as a percentage, rounded to two decimal places
- Unit tests confirm the formula with known inputs and expected outputs
