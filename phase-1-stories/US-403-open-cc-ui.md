# US-403 — Open a CC from the UI

**Epic:** Manual Trade Entry UI
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** a form to enter a new covered call on shares I'm holding,
**so that** I can continue the wheel and track the additional premium income.

---

## Acceptance Criteria

- Available only when a position is in `HOLDING_SHARES` phase
- Form fields: strike price, expiration date, number of contracts, premium received per contract
- App displays the current effective cost basis alongside the form as a reference, and warns if the selected strike is below cost basis (which would lock in a loss if called away)
- Submission creates a `short_cc` / `open` Leg and invokes the Cost Basis Engine
- The updated cost basis is shown immediately in the confirmation
