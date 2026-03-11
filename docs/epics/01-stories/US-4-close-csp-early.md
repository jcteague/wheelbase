# US-4: Close a CSP early (buy to close) with P&L preview

## User Story

**As a** wheel trader managing an open CSP,
**I want to** close my position early by recording a buy-to-close transaction with a P&L preview before confirming,
**So that** I can capture profits at my target (e.g., 50% of premium) and free up capital for the next trade.

## Context

Closing a CSP early (buying to close) is the most common exit for profitable wheel trades. Traders typically close at a profit target — often 50% of premium collected — rather than waiting for full expiration. The P&L preview before confirmation is critical: the trader needs to see exactly how much profit they're capturing as a percentage of the original premium. This is the number wheel traders anchor on when making the close decision.

The close action creates a new leg (action: close) and transitions the wheel's phase based on whether the trade was profitable or not.

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open CSP on AAPL with:
    | field                | value      |
    | strike               | $180.00    |
    | expiration           | 2026-04-17 |
    | contracts            | 1          |
    | premium_per_contract | $2.50      |
    | phase                | CSP_OPEN   |

Scenario: P&L preview shows profit when closing below premium collected
  When the trader enters a close price of $1.00 per contract
  Then the P&L preview displays:
    | field                    | value    |
    | premium collected        | $2.50    |
    | cost to close            | $1.00    |
    | net P&L per contract     | $1.50    |
    | total P&L                | $150.00  |
    | % of premium captured    | 60%      |

Scenario: Successfully close a CSP at a profit
  When the trader submits a close with price $1.00 per contract and fill date 2026-03-20
  Then the position phase changes to CSP_CLOSED_PROFIT
  And the position status changes to closed
  And a close leg is recorded with action "close" and fill_price $1.00
  And the cost basis snapshot shows final_pnl of $150.00
  And the trader is returned to the position detail page

Scenario: Successfully close a CSP at a loss
  When the trader submits a close with price $3.50 per contract and fill date 2026-03-20
  Then the P&L preview displays:
    | field                    | value     |
    | net P&L per contract     | -$1.00    |
    | total P&L                | -$100.00  |
    | % of premium captured    | -40%      |
  And after confirmation, the position phase changes to CSP_CLOSED_LOSS

Scenario: Reject close when position is not in CSP_OPEN phase
  Given the position phase is WHEEL_COMPLETE
  When the trader attempts to close the position
  Then the close action is rejected with message "Position is not in CSP_OPEN phase"

Scenario: Reject close with invalid fill date
  When the trader submits a close with fill date before the open leg's fill date
  Then a validation error appears: "Close date cannot be before the open date"

Scenario: Reject close with fill date after expiration
  When the trader submits a close with fill date 2026-04-18 (after expiration)
  Then a validation error appears: "Close date cannot be after expiration date"

Scenario Outline: Reject close with invalid price
  When the trader enters a close price of <price>
  Then a validation error appears: "<message>"

  Examples:
    | price | message                       |
    | 0     | Close price must be positive  |
    | -1.00 | Close price must be positive  |
```

## Technical Notes

- **API:** `PATCH /api/positions/:id/close` with body: `{ close_price_per_contract, fill_date? }`
- **Lifecycle engine:** Add `close_csp(position, close_price)` — validates phase is `CSP_OPEN`, determines profit/loss, returns target phase (`CSP_CLOSED_PROFIT` or `CSP_CLOSED_LOSS`)
- **Cost basis engine:** Add `calculate_csp_close(open_premium, close_price, contracts)` — returns `final_pnl` and `pnl_percentage`
- **New leg:** `action: close`, `leg_role: csp`, `option_type: put`, `fill_price: close_price_per_contract`
- **Phase transition:** `CSP_OPEN` -> `CSP_CLOSED_PROFIT` (when net P&L > 0) or `CSP_CLOSED_LOSS` (when net P&L <= 0)
- **Position status:** Set to `closed` after closing
- **P&L preview:** Frontend calculates preview locally from the form input — no API call needed until submit

## Out of Scope

- Commission tracking (future story)
- Undo/revert a close action
- Closing partial contracts (close applies to all contracts in the leg)
- Auto-close at profit target (Epic 07 — alerts)

## Dependencies

- US-1: Open a new wheel by selling a CSP (creates the position to close)
- US-3: Position detail page (provides the UI context for the close action)

## Size

5 points — lifecycle transition + cost basis calculation + API endpoint + frontend form with P&L preview
