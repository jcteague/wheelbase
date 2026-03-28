# US-10: Record shares called away and complete the wheel cycle with final P&L

**As a** wheel trader whose covered call has been exercised,
**I want to** record that my shares were called away at the CC strike,
**So that** the wheel cycle completes with an accurate final P&L that accounts for all premiums collected and the share appreciation from cost basis to strike.

---

## Context

When the underlying closes above the CC strike at expiration, the broker exercises the option and takes the trader's shares at the strike price. This is the "exit" event for the wheel — all shares are delivered, the position closes, and the total cycle P&L is realized. The final P&L is the sum of: share appreciation (CC strike minus cost basis per share) plus all premiums collected throughout the cycle.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has a CC_OPEN position on AAPL
  And the effective cost basis is $174.20 per share (after CSP and CC premiums)
  And the CC strike is $182.00 with fill date "2026-02-21", 1 contract
  And total premium collected across all legs is $580.00

Scenario: Successfully record shares called away
  Given the position is in CC_OPEN phase
  When the trader submits the call-away form with fill date "2026-02-21"
  Then the position phase changes to WHEEL_COMPLETE
  And the position status changes to CLOSED
  And a CC_CLOSE leg is recorded with fill_price $182.00 and fill_date "2026-02-21"
  And the final P&L shows +$780.00
    | Component                           | Amount    |
    | Share appreciation                  | +$780.00  |
    | ($182.00 − $174.20) × 100 shares   |           |
    | Final P&L                           | +$780.00  |

Scenario: Called-away below cost basis shows a loss
  Given the effective cost basis is $176.50 per share
  And the CC strike is $174.00 (below cost basis)
  When the trader records shares called away at $174.00
  Then the final P&L shows −$250.00 (($174.00 − $176.50) × 100 shares)
  And the P&L is displayed in red

Scenario: P&L breakdown shown on the form before submission
  When the trader views the call-away confirmation sheet
  Then a P&L waterfall shows each component:
    | Line                          | Value    |
    | CC strike (shares delivered)  | $182.00  |
    | − Effective cost basis        | $174.20  |
    | = Appreciation per share      | $7.80    |
    | × 100 shares                  | $780.00  |
    | = Final cycle P&L             | $780.00  |

Scenario: Reject call-away when not in CC_OPEN phase
  Given the position is in HOLDING_SHARES phase
  When the trader attempts to record shares called away
  Then the action is rejected with message "No open covered call on this position"

Scenario: Reject fill date before CC open date
  Given the CC was opened on "2026-01-20"
  When the trader enters fill date "2026-01-19"
  Then a validation error appears: "Fill date cannot be before the CC open date"
  And no leg is created

Scenario: Success state shows complete wheel summary
  Given the shares-called-away has been confirmed
  Then the success screen shows "WHEEL COMPLETE"
  And the total cycle P&L is displayed prominently
  And the cycle duration in calendar days is shown (position open date to fill date)
  And the annualized return percentage is displayed
  And a "Start New Wheel on AAPL →" CTA is visible
```

---

## Technical Notes

- Lifecycle transition: `CC_OPEN → WHEEL_COMPLETE`, status → `CLOSED`
- `LegRole: CC_CLOSE`, `LegAction: EXERCISE` (shares are delivered by exercise, not a market buy), `InstrumentType: CALL`, `fill_price: CC strike`
- The fill date is the day shares are delivered (typically the trading day after expiration Friday; T+1 for equity settlement)
- Final P&L formula: `(ccStrike − basisPerShare) × sharesHeld`
  - `basisPerShare` is the **effective** cost basis already reduced by all premiums collected — do NOT add `totalPremiumCollected` separately, it is already embedded in `basisPerShare`
  - `sharesHeld = contracts × 100`
  - Annualized return: `(finalPnl / capitalDeployed) × (365 / cycleDays) × 100`, where `capitalDeployed = basisPerShare × sharesHeld` and `cycleDays = closedDate − position.openDate`
- After call-away, set `closed_date = fill_date` on the `CC_OPEN` leg and link it to the new `CC_CLOSE` leg; this is an exercise linkage, not a roll pair
- Store `final_pnl` in `cost_basis_snapshot`; set `closed_date` and `status = CLOSED` on the position
- The "called away" confirmation is a separate action from "CC expired worthless" — both are accessible from the position detail header when `phase = CC_OPEN`
- The fill price is **always the CC strike** — the trader does not enter it manually; it is derived from the CC_OPEN leg
- Fill date validation compares against the `fill_date` of the `CC_OPEN` leg (not the position open date)
- The "Start New Wheel" CTA uses internal router navigation to `/new?ticker=AAPL` (hash-based routing via wouter)

---

## Out of Scope

- Early exercise / assignment before expiration (treated identically — no Phase 1 special handling; `closed_date` reflects actual delivery date, not the CC expiry date)
- Multi-contract positions (> 1 contract): call-away is not supported in this release; the form must reject positions with `contracts > 1` with message "Multi-contract call-away is not yet supported"
- Partial call-away (some contracts exercised) — deferred
- Tax lot tracking — future epic
- Automatic detection via Alpaca — Epic 06

---

## Dependencies

- US-7: CC must be open; position must be in CC_OPEN with a valid CC_OPEN leg

## Size

5 points

## Mockup

`mockups/us-10-record-shares-called-away.mdx`
