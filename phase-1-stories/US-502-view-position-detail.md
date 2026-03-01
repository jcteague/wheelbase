# US-502 — View position detail and full leg history

**Epic:** Position List View
**Priority:** Must Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to click into a position and see its complete leg history,
**so that** I can review every trade, roll, and event in the wheel's lifecycle.

---

## Acceptance Criteria

- Clicking a position opens a detail view showing: all legs in chronological order, each leg's action, strike, expiration, premium, fill date, and net P&L contribution
- The effective cost basis at each point in the history is shown (from `CostBasisSnapshot`)
- Rolls are visually grouped as a pair (close + open)
- The current effective cost basis and total premium collected are shown prominently at the top
- The detail view is accessible from the main list via keyboard or click
