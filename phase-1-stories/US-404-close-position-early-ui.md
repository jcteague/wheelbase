# US-404 — Close a position early from the UI

**Epic:** Manual Trade Entry UI
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to record an early close (buy-to-close) on an open option leg,
**so that** I can capture partial profit and either rest the wheel or open a new position.

---

## Acceptance Criteria

- Available on any position in `CSP_OPEN` or `CC_OPEN` phase
- Form fields: buy-to-close price (fill price), close date (defaults to today)
- App displays the estimated profit on this leg: `(original premium − close price) × contracts × 100`
- Submission creates a `close` action Leg and recalculates cost basis
- After close, the user is shown their options: open a new CSP/CC, or mark the wheel as resting
