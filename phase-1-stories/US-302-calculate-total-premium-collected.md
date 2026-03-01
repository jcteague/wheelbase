# US-302 — Calculate total premium collected

**Epic:** Cost Basis Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to see the total premium I've collected across the entire lifecycle of a wheel,
**so that** I can measure the income this position has generated.

---

## Acceptance Criteria

- `total_premium_collected` is the sum of all credits received (CSP premiums + CC premiums + roll credits) minus all debits paid (buy-to-close costs + roll debits)
- This value is stored on each `CostBasisSnapshot`
- It is always non-negative for a profitable wheel (debits can reduce it but it cannot go below 0 as a display value — actual net is shown separately)
- Unit tests confirm accumulation across multiple legs including mixed credits and debits
