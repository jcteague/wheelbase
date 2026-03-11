# US-2: List all positions with phase badge, ticker, strike, DTE, and premium

## User Story

**As a** wheel trader with multiple open positions,
**I want to** see all my positions in a list with key data at a glance,
**So that** I can quickly assess which positions need attention without opening each one individually.

## Context

After opening one or more wheels (US-1), the trader needs a dashboard-style list showing every position's current state. The position card must surface the data points that drive daily decisions: what phase is the wheel in, how many days until expiration, and how much premium has been collected. This is the primary landing page of the app.

## Acceptance Criteria

```gherkin
Scenario: Display positions list with one open CSP
  Given the trader has one open wheel on AAPL with strike $180, expiration 2026-04-17, and premium $2.50 per contract
  When the trader views the positions list
  Then a position card appears showing:
    | field               | value       |
    | ticker              | AAPL        |
    | phase badge         | CSP_OPEN    |
    | strike              | $180.00     |
    | expiration          | 2026-04-17  |
    | DTE                 | 42          |
    | premium collected   | $250.00     |
    | effective cost basis| $177.50     |

Scenario: Display multiple positions sorted by DTE ascending
  Given the trader has open wheels on AAPL (30 DTE), MSFT (14 DTE), and TSLA (45 DTE)
  When the trader views the positions list
  Then positions appear in order: MSFT, AAPL, TSLA
  And each position card shows its respective data

Scenario: DTE countdown updates daily
  Given the trader has an open wheel on AAPL expiring 2026-04-17
  And today is 2026-03-06
  When the trader views the positions list
  Then the DTE shows 42

Scenario: Closed positions appear with final status
  Given the trader has a completed wheel on SPY with phase WHEEL_COMPLETE
  When the trader views the positions list
  Then the SPY card shows the WHEEL_COMPLETE phase badge
  And the DTE field shows "Expired" instead of a countdown

Scenario: Empty state when no positions exist
  Given the trader has no positions
  When the trader views the positions list
  Then a message appears: "No positions yet"
  And a call-to-action links to the New Wheel form
```

## Technical Notes

- **API:** `GET /api/positions` — returns all positions with their latest cost basis snapshot
- **Response shape:** Array of position objects including computed `dte` field (calculated server-side from expiration date)
- **Default sort:** DTE ascending (nearest expiration first) — traders prioritize positions closest to decision points
- **Include closed positions:** Return all positions; frontend can filter by status later (Phase 4 concern)
- **Frontend:** Positions list page at `/positions`, using TanStack Query for data fetching

## Out of Scope

- Filtering or searching positions (future story)
- Pagination (unlikely needed for single-user app with < 100 positions)
- Live market price or current option value (Epic 06)
- Grouping by ticker or strategy type

## Dependencies

- US-1: Open a new wheel by selling a CSP (provides the data to display)

## Size

3 points — GET endpoint + frontend list page with position cards
