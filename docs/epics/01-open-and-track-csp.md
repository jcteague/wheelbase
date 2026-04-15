# Epic: Open and Track a Cash-Secured Put

## Phase

Phase 1

## Goal

A trader can sell a cash-secured put, see it on the dashboard, and close or let it expire — the first usable end-to-end workflow in the app.

## Success Criteria

- Trader enters a CSP via a form and sees the new position appear on a positions list
- The position card shows: ticker, CSP_OPEN phase badge, strike, expiration, DTE countdown, premium collected, effective cost basis
- Trader can close the CSP early (buy to close) with P&L displayed before confirmation
- Trader can record the CSP expiring worthless, freeing the capital
- Cost basis engine calculates initial basis (strike - premium) and updates on close
- Lifecycle engine enforces valid transitions: CSP_OPEN can only move to CLOSED or HOLDING_SHARES
- Position detail page shows the full leg history for this wheel

## Vertical Slice

| Layer        | What ships                                                                            |
| ------------ | ------------------------------------------------------------------------------------- |
| Database     | Position, Leg, CostBasisSnapshot tables and migrations                                |
| Core engines | lifecycle.open_wheel(), costbasis.calculate_initial_csp_basis()                       |
| API          | POST /api/positions, GET /api/positions, GET /api/positions/:id, PATCH (close/expire) |
| Frontend     | New Wheel form, positions list page, position detail page, close/expire actions       |

## Stories

- [x] US-1: Open a new wheel by selling a CSP
- [ ] US-2: List all positions with phase badge, ticker, strike, DTE, and premium
- [ ] US-3: View a single position's detail page with full leg history
- [ ] US-4: Close a CSP early (buy to close) with P&L preview
- [ ] US-5: Record a CSP expiring worthless and mark the wheel as complete or ready to restart

## Dependencies

None — this is the entry point to the app.

## Strategy

Classic Wheel

## Out of Scope

- Assignment handling (Epic 02)
- Rolling (Epic 03)
- Live market prices (Epic 06)
- PMCC (Epic 09)
