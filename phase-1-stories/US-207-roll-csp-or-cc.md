# US-207 — Roll a CSP or CC position

**Epic:** Wheel Lifecycle Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to record a roll (close the current leg, open a replacement),
**so that** the full roll history is preserved as a linked pair and cumulative cost basis is correctly updated.

---

## Acceptance Criteria

- A roll is recorded as two linked Legs: one `roll_from` (closing the old leg) and one `roll_to` (opening the new leg), linked by the same `roll_chain_id`
- The net premium of the roll (credit or debit) is computed and stored
- The Cost Basis Engine is reinvoked after both legs are written
- The position phase does not change on a roll (a rolled CSP stays in `CSP_OPEN`; a rolled CC stays in `CC_OPEN`)
- The engine enforces that the new expiration is after the closed expiration (roll forward only)
- Unit tests cover a roll-for-credit, a roll-for-debit, and a roll to a different strike
