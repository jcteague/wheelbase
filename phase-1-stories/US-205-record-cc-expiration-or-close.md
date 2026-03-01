# US-205 — Record a CC expiration or early close

**Epic:** Wheel Lifecycle Engine
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to record that my covered call expired worthless or was closed early for a profit,
**so that** the income is captured and I can decide to sell another CC or close the wheel.

---

## Acceptance Criteria

- A `short_cc` / `expire` or `short_cc` / `close` Leg on a `CC_OPEN` position transitions the phase to `CC_CLOSED_PROFIT`
- For an early close, `fill_price` (the buy-to-close cost) is stored and the net gain is calculated
- The Cost Basis Engine is reinvoked to update the snapshot
- Unit tests confirm phase transition and income calculation for both expire and early-close paths
