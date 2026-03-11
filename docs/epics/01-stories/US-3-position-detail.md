# US-3: View a single position's detail page with full leg history

## User Story

**As a** wheel trader reviewing a specific position,
**I want to** see the full detail of a wheel including every leg transaction in chronological order,
**So that** I can understand the complete history of premiums collected, rolls made, and basis changes before deciding my next action.

## Context

The position detail page is where the trader goes to make decisions — close, expire, roll, or just review. It must show the current state (phase, cost basis, DTE) plus the full leg history that explains how the position got there. The leg history is the primary long-term asset of the app — it provides the audit trail that spreadsheets lose.

## Acceptance Criteria

```gherkin
Scenario: Display position detail with single opening leg
  Given the trader has an open wheel on AAPL with:
    | field                | value      |
    | strike               | $180.00    |
    | expiration           | 2026-04-17 |
    | contracts            | 1          |
    | premium_per_contract | $2.50      |
    | phase                | CSP_OPEN   |
  When the trader navigates to the position detail page
  Then the header shows "AAPL" with a "CSP_OPEN" phase badge
  And the summary section shows:
    | field               | value     |
    | strike              | $180.00   |
    | expiration          | 2026-04-17|
    | DTE                 | 42        |
    | contracts           | 1         |
    | premium collected   | $250.00   |
    | effective cost basis| $177.50   |
  And the leg history shows one entry:
    | field    | value      |
    | action   | open       |
    | type     | put        |
    | strike   | $180.00    |
    | premium  | $2.50      |
    | date     | 2026-03-06 |

Scenario: Leg history displays in chronological order
  Given the trader has a wheel on MSFT with two legs:
    | action | type | strike  | premium | date       |
    | open   | put  | $400.00 | $5.00   | 2026-02-01 |
    | close  | put  | $400.00 | $2.00   | 2026-02-20 |
  When the trader views the position detail
  Then the leg history shows the open leg first and the close leg second

Scenario: Position not found returns error
  Given no position exists with ID "00000000-0000-0000-0000-000000000000"
  When the trader navigates to that position's detail page
  Then a "Position not found" message is displayed

Scenario: Notes and thesis are displayed when present
  Given the trader has a wheel on AAPL with thesis "Bullish on services revenue" and notes "Selling at support level"
  When the trader views the position detail
  Then the thesis and notes sections are visible with the entered text
```

## Technical Notes

- **API:** `GET /api/positions/:id` — returns position with all legs and latest cost basis snapshot
- **Legs included:** Eager-load or join legs ordered by `fill_date ASC, created_at ASC`
- **Frontend:** Position detail page at `/positions/:id`
- **Navigation:** Clicking a position card on the list page (US-2) navigates here
- **404 handling:** API returns 404 with standard error shape; frontend shows friendly message

## Out of Scope

- Action buttons (close, expire, roll) — those are US-4, US-5, and Epic 03
- Premium waterfall visualization (future analytics story)
- Edit/correct position data (future story)
- Cost basis history chart (future story)

## Dependencies

- US-1: Open a new wheel by selling a CSP (creates the position)
- US-2: List positions (provides navigation to detail page)

## Size

3 points — GET detail endpoint + frontend detail page with leg history table
