# Epic: Live Market Data and Assignment Detection

## Phase

Phase 2

## Goal

Position cards update with real-time prices, Greeks, and unrealized P&L from Alpaca. The app automatically detects assignments by polling broker activity, eliminating the need for the trader to manually record every event.

## Success Criteria

- Position cards show live underlying price and option mid-price during market hours
- Unrealized P&L calculates in real-time based on current prices vs. entry prices
- Greeks (delta, theta, gamma, vega, IV) display on the position detail page for open option legs
- Background polling detects assignment events from Alpaca activities API and auto-transitions the position to HOLDING_SHARES
- Assignment detection creates the appropriate leg record and notifies the trader
- Paper vs. live environment toggle is clearly visible and prevents accidental cross-environment actions
- Polling frequency: every 60 seconds during market hours, hourly otherwise

## Vertical Slice

| Layer | What ships |
|---|---|
| Integration | alpaca.py: get_positions(), get_option_snapshots(), get_activities(type=OPASN) |
| Backend | APScheduler job for position polling and assignment detection |
| API | GET /api/positions enriched with live data, WebSocket or polling endpoint for price updates |
| Frontend | Live price display on position cards, Greeks panel on detail page, assignment notification, environment switcher |

## Stories

- [ ] US-31: Display live underlying price on position cards via Alpaca market data
- [ ] US-32: Show current option mid-price and unrealized P&L for open legs
- [ ] US-33: Display Greeks (delta, theta, gamma, vega, IV) on position detail page
- [ ] US-34: Poll Alpaca activities API to detect assignment events automatically
- [ ] US-35: Auto-transition position to HOLDING_SHARES on detected assignment with notification
- [ ] US-36: Toggle between paper and live Alpaca environments with clear visual indicator
- [ ] US-37: Configure polling frequency (market hours vs. after hours)

## Dependencies

- Epic 01: Open and Track a CSP (positions to enrich)
- Epic 04: Position Dashboard (cards to display live data on)
- Alpaca API credentials configured in .env

## Strategy

Both

## Out of Scope

- Order placement (Epic 10)
- Option chain browsing for trade entry (Epic 10)
- Candidate screening (Epic 08)
