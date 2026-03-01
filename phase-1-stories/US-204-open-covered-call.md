# US-204 — Open a Covered Call (CC phase)

**Epic:** Wheel Lifecycle Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to open a covered call on shares I'm holding,
**so that** I can continue collecting premium and further reduce my effective cost basis.

---

## Acceptance Criteria

- Adding a `short_cc` / `open` Leg to a `HOLDING_SHARES` position transitions the phase to `CC_OPEN`
- The engine rejects a CC leg if the position is not in `HOLDING_SHARES` or `CC_CLOSED` phase
- Unit tests cover the happy path and the rejection case
