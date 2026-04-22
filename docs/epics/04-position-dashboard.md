# Epic: Position Dashboard and Portfolio Overview

## Phase

**Deferred** — ships after Epic 06 (live market data). The dashboard's key value — distance-to-strike, real-time urgency — depends on live prices. Building the card layout before that data exists means redesigning it once we see how the data actually feels. Stories and mockups are complete and ready to pick up once Epic 06 lands.

Originally scoped as: Phase 1 (static data) / Phase 2 (live data enrichment)

## Goal

A trader opens the app and immediately sees all active positions, key portfolio metrics, and enough information to decide what needs attention — without opening their broker platform.

## Success Criteria

- Dashboard displays position cards for every active wheel showing: ticker, phase badge, strike, DTE countdown, premium collected this cycle, effective cost basis
- Portfolio summary bar at top shows: total capital deployed, total premium collected MTD and YTD, count of active positions
- Positions are filterable by phase (CSP_OPEN, HOLDING_SHARES, CC_OPEN, CLOSED)
- Positions are sortable by DTE (soonest first), ticker, or total premium
- Visual proximity indicator shows how close the underlying is to the strike (percentage distance)
- Clicking a position card navigates to the position detail page
- Dashboard handles zero-state gracefully (no positions yet)

## Vertical Slice

| Layer    | What ships                                                                             |
| -------- | -------------------------------------------------------------------------------------- |
| API      | GET /api/positions (list with filters/sort), GET /api/dashboard/summary (aggregates)   |
| Frontend | Dashboard page with summary bar, position card grid, filter/sort controls, empty state |

## Stories

- [ ] US-18: Display all active positions as cards with phase badge, ticker, strike, DTE, premium
- [ ] US-19: Show portfolio summary bar with capital deployed, premium MTD/YTD, active count
- [ ] US-20: Filter positions by lifecycle phase
- [ ] US-21: Sort positions by DTE, ticker, or premium collected
- [ ] US-22: Show visual distance indicator (underlying vs. strike as percentage)
- [ ] US-23: Handle empty state when no positions exist with prompt to create first wheel
- [ ] US-24: Navigate from position card to position detail page

## Dependencies

- Epic 01: Open and Track a CSP (positions must exist to display)
- **Epic 06: Live Market Data** (distance-to-strike indicator, real-time price on cards)

## Strategy

Both (card layout adapts per strategy_type; PMCC card variant ships with Epic 09)

## Out of Scope

- Management queue / alert-driven action list (Epic 07)
- Live price enrichment (Epic 06 — Phase 1 uses stored data only)
- PMCC-specific card variant (Epic 09)
