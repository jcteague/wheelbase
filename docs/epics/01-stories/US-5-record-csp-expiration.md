# US-5: Record a CSP expiring worthless and mark the wheel as complete

## User Story

**As a** wheel trader whose CSP has expired out of the money,
**I want to** record the expiration so the wheel is marked complete with 100% premium captured,
**So that** I can see the final P&L and free up my attention for active positions.

## Context

A CSP expiring worthless is the best-case outcome for the CSP leg — the trader keeps 100% of the premium with no further obligation. This is a common result for well-selected strikes. After recording expiration, the wheel is complete. The trader often wants to immediately open a new wheel on the same ticker to continue the cycle, so the post-expiration UX should make that easy.

Each expired wheel is a self-contained lifecycle. Re-opening a CSP on the same ticker creates a new, independent wheel — not a continuation of the expired one. This keeps P&L tracking clean and history meaningful.

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

Scenario: Successfully record CSP expiration
  Given today is 2026-04-17 or later
  When the trader records the CSP as expired
  Then the position phase changes to WHEEL_COMPLETE
  And the position status changes to closed
  And an expire leg is recorded with action "expire" and no fill_price
  And the cost basis snapshot shows final_pnl of $250.00
  And the total premium captured shows 100%

Scenario: Post-expiration offers shortcut to open new wheel on same ticker
  Given the trader has just recorded expiration on the AAPL wheel
  When the expiration confirmation is displayed
  Then a "Open new wheel on AAPL" shortcut is available
  And clicking it navigates to the New Wheel form with ticker pre-filled as "AAPL"

Scenario: Reject expiration when position is not in CSP_OPEN phase
  Given the position phase is CSP_CLOSED_PROFIT
  When the trader attempts to record expiration
  Then the action is rejected with message "Position is not in CSP_OPEN phase"

Scenario: Reject expiration before expiration date
  Given today is 2026-04-10 (before expiration)
  When the trader attempts to record the CSP as expired
  Then a validation error appears: "Cannot record expiration before the expiration date"

Scenario: Allow expiration on the expiration date itself
  Given today is 2026-04-17 (the expiration date)
  When the trader records the CSP as expired
  Then the expiration is recorded successfully

Scenario: Position disappears from active positions after expiration
  Given the trader has recorded the AAPL CSP as expired
  When the trader views the positions list
  Then the AAPL position shows the WHEEL_COMPLETE phase badge
  And the position status is closed
```

## Technical Notes

- **API:** `PATCH /api/positions/:id/expire` with optional body: `{ expiration_date_override? }` (for cases where the actual expiration differs from recorded)
- **Lifecycle engine:** Add `expire_csp(position)` — validates phase is `CSP_OPEN` and that current date >= expiration date
- **Cost basis engine:** Add `calculate_csp_expiration(open_premium, contracts)` — returns `final_pnl = total_premium_collected` (100% profit)
- **New leg:** `action: expire`, `leg_role: csp`, `option_type: put`, `fill_price: null`, `fill_date: expiration date`
- **Phase transition:** `CSP_OPEN` -> `WHEEL_COMPLETE` (skips `CSP_EXPIRED` intermediate — single-step for simplicity)
- **Position status:** Set to `closed` after expiration
- **Expiration date validation:** Allow recording on or after the expiration date. Standard equity options expire Saturday but cease trading Friday — traders enter Friday as the expiration date, so `>=` comparison is correct.

## Out of Scope

- Assignment handling (CSP assigned = shares acquired — that's Epic 02)
- Automatic expiration detection from broker (Epic 06 — live market data)
- Editing the expiration date after the fact
- Partial expiration (not applicable to standard options)

## Dependencies

- US-1: Open a new wheel by selling a CSP (creates the position to expire)
- US-3: Position detail page (provides the UI context for the expire action)

## Size

3 points — lifecycle transition + cost basis calculation + API endpoint + simple confirmation UI (no complex form like US-4)
