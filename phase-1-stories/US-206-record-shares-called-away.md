# US-206 — Record shares called away

**Epic:** Wheel Lifecycle Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to record when my covered call is assigned and my shares are called away,
**so that** the wheel can be marked complete and the final P&L calculated.

---

## Acceptance Criteria

- A `short_cc` / `assign` Leg on a `CC_OPEN` position transitions the phase to `WHEEL_COMPLETE`
- Final P&L is calculated as: (call strike × contracts × 100) + total premiums collected − initial capital deployed
- Position `status` is set to `closed` automatically
- The user is prompted (in the UI) to optionally start a new wheel on the same ticker
- Unit tests confirm the final P&L calculation across a full multi-leg wheel
