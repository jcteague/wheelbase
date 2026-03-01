# US-405 — Record a roll from the UI

**Epic:** Manual Trade Entry UI
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** a single form to record a roll (close old leg + open new leg) as an atomic operation,
**so that** the roll history is preserved and cost basis is updated in one step.

---

## Acceptance Criteria

- The roll form shows in two sections: "Close existing leg" (pre-filled from current leg data) and "Open new leg" (user fills in new strike, expiration, premium)
- App computes and displays the net roll credit or debit before the user confirms
- Submission writes both Legs (linked by `roll_chain_id`) in a single database transaction — if either fails, neither is saved
- The new expiration must be later than the closed expiration; the form prevents submission otherwise
- The updated cost basis is shown in the confirmation screen
