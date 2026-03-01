# US-406 — Record an expiration (worthless) from the UI

**Epic:** Manual Trade Entry UI
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to mark an option as expired worthless,
**so that** the full premium is captured as profit and the wheel advances to the correct next phase.

---

## Acceptance Criteria

- Available on any position in `CSP_OPEN` or `CC_OPEN` phase
- A single "Mark Expired" action (no data entry needed — expiration date and premium are already on record)
- A confirmation dialog shows: "This will record [ticker] [strike] [expiration] as expired worthless, capturing $[premium] in profit."
- Submission creates an `expire` action Leg and the lifecycle engine advances the phase
- The wheel is surfaced to the user with a prompt to open the next leg or close the wheel
