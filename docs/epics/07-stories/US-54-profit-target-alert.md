# US-54: Fire profit-target alert when unrealized profit reaches the configured target

**As a** premium-selling wheel trader,
**I want to** be alerted when an open short option has reached my profit-taking threshold,
**So that** I can lock in gains and redeploy capital before the remaining premium decays too slowly.

---

## Context

Closing around 50% of max profit is one of the most common wheel management rules because the back half of premium decay is slower and leaves more reversal risk on the table. Traders do not all use the same threshold, so this rule needs to honor the configured default and later per-position overrides. The message should feel like an opportunity alert, not a crisis alert.

---

## Acceptance Criteria

```gherkin
Background:
  Given the alert engine evaluates active wheel positions with live option mid-prices

Scenario: Alert fires when unrealized profit reaches the default target
  Given AAPL is in CSP_OPEN with entry premium $3.50
  And the current option mid-price is $1.70
  And the global profit target is 50%
  When the alert engine evaluates active positions
  Then a low-urgency PROFIT_TARGET alert is created for AAPL
  And the alert summary reads "51.4% of max profit captured — consider closing"

Scenario: Alert fires for an open covered call that reaches the target
  Given MSFT is in CC_OPEN with entry premium $4.00
  And the current option mid-price is $1.90
  And the global profit target is 50%
  When the alert engine evaluates active positions
  Then a low-urgency PROFIT_TARGET alert is created for MSFT
  And the alert summary reads "52.5% of max profit captured — consider closing"

Scenario: Alert does not fire before the target is reached
  Given AAPL is in CSP_OPEN with entry premium $3.50
  And the current option mid-price is $2.40
  And the global profit target is 50%
  When the alert engine evaluates active positions
  Then no PROFIT_TARGET alert is created for AAPL

Scenario: Position without a live option mark is skipped
  Given AAPL is in CSP_OPEN
  And no current option mid-price is available
  When the alert engine evaluates active positions
  Then no PROFIT_TARGET alert is created for AAPL
  And the engine records a debug log that the rule was skipped for missing mark data

Scenario: Holding-shares positions do not receive profit-target alerts
  Given TSLA is in HOLDING_SHARES with no open option leg
  When the alert engine evaluates active positions
  Then no PROFIT_TARGET alert is created for TSLA
```

---

## Technical Notes

- Reuse the same unrealized P&L and target-resolution logic from US-33 so the badge threshold and alert threshold never drift.
- The rule applies to any open short option leg — both `CSP_OPEN` and `CC_OPEN` — since the same 50%-of-max-profit logic governs short puts and short calls alike. Only `HOLDING_SHARES` (no open option leg) is excluded.
- The rule compares percentage of max profit captured, not raw dollars, so it scales across contract counts and premium sizes.
- This alert should point the trader back to the position detail page; it does not auto-close the contract.

---

## Out of Scope

- Auto-close orders
- Tiered profit-target ladders
- Underwater "salvage" alerts based on unrealized loss

---

## Dependencies

- US-33: current option mid-price and profit-target resolution
- US-50: scheduled alert evaluation

---

## Estimate

3 points

## Mockup

None — the queue treatment is covered by the US-51 dashboard mockup
