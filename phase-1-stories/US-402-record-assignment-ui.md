# US-402 — Record an assignment from the UI

**Epic:** Manual Trade Entry UI
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** a simple action in the UI to record that my CSP was assigned,
**so that** the wheel transitions to the share-holding phase with one click.

---

## Acceptance Criteria

- From a wheel in `CSP_OPEN` phase, an "Record Assignment" button/action is available
- A confirmation dialog shows: ticker, number of shares to be received (contracts × 100), and the new effective cost basis that will result
- On confirm, the engine transitions the position to `HOLDING_SHARES`
- The dashboard card for that position immediately reflects the new phase and cost basis
- No manual data entry is required beyond confirming — the strike is already known from the CSP leg
