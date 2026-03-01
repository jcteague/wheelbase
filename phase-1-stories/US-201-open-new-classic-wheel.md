# US-201 — Open a new Classic Wheel (CSP phase)

**Epic:** Wheel Lifecycle Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to create a new position in the CSP-open phase,
**so that** I can begin tracking a new cash-secured put as the first leg of a wheel.

---

## Acceptance Criteria

- Creating a Position with `strategy_type = WHEEL` and adding a `csp` / `open` Leg sets the wheel's current phase to `CSP_OPEN`
- The engine rejects adding a `short_cc` Leg to a position still in `CSP_OPEN` phase (no shares held yet)
- The engine rejects a CSP leg with a missing or past `expiration` date
- Unit tests cover the happy path and all rejection conditions
