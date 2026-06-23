# US-55: Fire strike-proximity alert when a CSP underlying is within 1% of strike

**As a** wheel trader with open cash-secured puts,
**I want to** be alerted when the stock price moves within 1% of my put strike,
**So that** I can decide whether to roll, close, or prepare for assignment before the position turns into a surprise.

---

## Context

Assignment risk on a short put is asymmetric: a put only becomes meaningfully assignable once the stock trades **below** the strike (in the money). But traders start paying attention earlier, as the stock _approaches_ the strike from either side, because the decision window is already narrowing. This rule is therefore an early-warning **strike-proximity** signal, not a claim that assignment is imminent — the summary text states the actual direction so the trader can judge real assignment risk for themselves. The rule is specific to the CSP phase in Epic 07. Covered-call breach risk is handled in US-62, and PMCC-specific assignment behavior is deferred to Epic 09.

---

## Acceptance Criteria

```gherkin
Background:
  Given the alert engine evaluates live underlying prices for open CSP positions

Scenario: Alert fires when price is within 1% above the CSP strike
  Given AAPL is in CSP_OPEN at the $180.00 strike
  And the current stock price is $181.20
  When the alert engine evaluates active positions
  Then a medium-urgency STRIKE_PROXIMITY alert is created for AAPL
  And the alert summary reads "Stock is 0.7% above the $180.00 put strike"

Scenario: Alert fires when price is within 1% below the CSP strike
  Given AAPL is in CSP_OPEN at the $180.00 strike
  And the current stock price is $179.10
  When the alert engine evaluates active positions
  Then a medium-urgency STRIKE_PROXIMITY alert is created for AAPL
  And the alert summary reads "Stock is 0.5% below the $180.00 put strike — now in the money"

Scenario: Alert does not fire when the stock is safely away from the strike
  Given AAPL is in CSP_OPEN at the $180.00 strike
  And the current stock price is $183.80
  When the alert engine evaluates active positions
  Then no STRIKE_PROXIMITY alert is created for AAPL

Scenario: Covered-call positions do not use this CSP strike-proximity rule
  Given MSFT is in CC_OPEN at the $420.00 strike
  And the current stock price is $419.60
  When the alert engine evaluates active positions
  Then no STRIKE_PROXIMITY alert is created for MSFT
```

---

## Technical Notes

- Compute proximity as absolute percent distance between underlying price and strike, then trigger when that distance is `<= 1%`.
- Restrict this Phase 3 rule to `CSP_OPEN` positions only.
- The alert summary must include directionality ("above" or "below") because traders interpret those differently; the below-strike (in-the-money) case is the one that carries genuine assignment risk and should say so.
- The rule code is `STRIKE_PROXIMITY` (renamed from the earlier `ASSIGNMENT_RISK` because firing on the above-strike, out-of-the-money case overstated literal assignment risk).

---

## Out of Scope

- Covered-call breach risk (US-62)
- Ex-dividend early-assignment risk
- Pin-risk-specific copy for expiration Friday

---

## Dependencies

- US-32: live underlying price available
- US-50: scheduled alert evaluation

---

## Estimate

3 points

## Mockup

None — the queue treatment is covered by the US-51 dashboard mockup
