# US-202 — Record a CSP expiration (worthless)

**Epic:** Wheel Lifecycle Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to record that my CSP expired worthless,
**so that** the full premium is captured as income and the wheel is either closed or ready for a new CSP.

---

## Acceptance Criteria

- Adding a `csp` / `expire` Leg to a `CSP_OPEN` position transitions the phase to `CSP_CLOSED_PROFIT`
- The full original premium is counted in `total_premium_collected`
- The position `status` can be set to `closed` at this point or left `active` to begin a new wheel cycle on the same ticker
- Unit tests confirm the phase transition and premium accumulation
