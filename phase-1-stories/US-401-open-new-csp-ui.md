# US-401 — Open a new CSP from the UI

**Epic:** Manual Trade Entry UI
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** a form to enter a new cash-secured put,
**so that** I can create a new wheel and start tracking it without needing a broker connection.

---

## Acceptance Criteria

- Form fields: ticker (text), strategy type (locked to WHEEL for this flow), strike price, expiration date, number of contracts, premium received per contract
- Submission creates a new Position + a `csp` / `open` Leg and invokes the Cost Basis Engine
- Ticker is validated as uppercase letters only (1–5 characters)
- Strike, contracts, and premium must be positive numbers
- Expiration must be a future date
- Inline validation messages appear on submit if any field fails
- Success shows a confirmation with the new wheel's initial cost basis displayed
- The form is accessible via keyboard navigation
