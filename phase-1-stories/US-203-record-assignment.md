# US-203 — Record an assignment

**Epic:** Wheel Lifecycle Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to record when my CSP is assigned and I take delivery of shares,
**so that** the wheel transitions to the share-holding phase and my cost basis resets appropriately.

---

## Acceptance Criteria

- Adding an `assign` action Leg to a `CSP_OPEN` position transitions the phase to `HOLDING_SHARES`
- The Cost Basis Engine is invoked to recalculate effective cost basis at time of assignment (see US-301)
- The engine blocks adding another `csp` Leg while in `HOLDING_SHARES` phase
- Unit tests cover assignment transition and confirm the Cost Basis Engine is called
