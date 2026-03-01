# US-503 — View closed positions

**Epic:** Position List View
**Priority:** Should Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to see wheels that have been closed or completed,
**so that** I can review past performance and learn from previous trades.

---

## Acceptance Criteria

- A "Closed Positions" tab or filter shows all positions with `status = closed`
- Each row shows: ticker, opened date, closed date, total days active, total premium collected, final P&L, and outcome (completed, closed early)
- Closed positions are read-only — no action buttons are shown
- The view is sorted by `closed_date` descending by default
