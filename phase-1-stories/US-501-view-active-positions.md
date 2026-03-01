# US-501 — View all active positions in a list

**Epic:** Position List View
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to see all my active positions in a single view,
**so that** I have a quick overview of everything I'm tracking.

---

## Acceptance Criteria

- The list displays every Position with `status = active`
- Each row shows: ticker, strategy type badge, current phase, number of contracts, strike, expiration date, DTE (calculated from today), total premium collected, effective cost basis per share
- The list is sortable by ticker, DTE, and total premium collected
- Empty state message is shown when no positions exist
- The view is responsive and usable on a standard laptop screen
