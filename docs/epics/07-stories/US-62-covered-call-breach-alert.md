# US-62: Fire covered-call breach alert when the underlying rises above the short-call strike

**As a** wheel trader with an open covered call,
**I want to** be alerted when the stock rises above my short-call strike,
**So that** I can decide whether to roll up-and-out for more upside or accept having my shares called away before expiration forces the outcome.

---

## Context

In the classic wheel, the covered-call leg being breached — the stock trading above the short-call strike — is one of the most time-sensitive management moments. Once the call is in the money, the shares are on track to be called away, capping the position's profit. This is usually a "good problem" (the trade is winning), but it still demands a decision: roll up-and-out to capture more upside, or let the call-away happen and recycle capital into a new CSP. A trader who misses this window loses the chance to roll on favorable terms.

This is a Classic Wheel rule and belongs in Epic 07 alongside the CSP strike-proximity rule (US-55). It is distinct from PMCC short-call-against-LEAPS assignment, which remains deferred to Epic 09.

---

## Acceptance Criteria

```gherkin
Background:
  Given the alert engine evaluates live underlying prices for open covered-call positions

Scenario: Alert fires when the stock rises above the covered-call strike
  Given MSFT is in CC_OPEN at the $420.00 strike
  And the current stock price is $427.40
  When the alert engine evaluates active positions
  Then a medium-urgency CC_BREACH alert is created for MSFT
  And the alert summary reads "Stock is 1.8% above the $420.00 call strike — shares may be called away"

Scenario: Alert does not fire while the stock is below the covered-call strike
  Given MSFT is in CC_OPEN at the $420.00 strike
  And the current stock price is $416.00
  When the alert engine evaluates active positions
  Then no CC_BREACH alert is created for MSFT

Scenario: Alert resolves when the stock falls back below the strike
  Given an open CC_BREACH alert exists for MSFT
  And the stock falls back to $415.00 before the next evaluation
  When the alert engine evaluates active positions
  Then the CC_BREACH alert is marked resolved

Scenario: Cash-secured-put positions do not use this covered-call breach rule
  Given AAPL is in CSP_OPEN at the $180.00 strike
  And the current stock price is $185.00
  When the alert engine evaluates active positions
  Then no CC_BREACH alert is created for AAPL

Scenario: Holding-shares positions without an open call are not evaluated
  Given TSLA is in HOLDING_SHARES with no open covered call
  When the alert engine evaluates active positions
  Then no CC_BREACH alert is created for TSLA
```

---

## Technical Notes

- Trigger when the underlying price is greater than or equal to the short-call strike (the call is in the money). Report the percent distance above the strike in the summary so the trader can gauge how deep ITM the position is.
- Restrict this rule to `CC_OPEN` positions only; the CSP equivalent is US-55's strike-proximity rule.
- This rule is independent of the DTE rules — a covered call can be both breached and inside the expiration-imminent or management window at the same time, and each rule keeps its own queue row per US-50.
- The quick action can remain the generic "Review position" in Phase 3; roll-up automation is out of scope until order execution lands.
- This is a Classic Wheel rule. PMCC short-call assignment against a LEAPS is a structurally different concern handled in Epic 09.

---

## Out of Scope

- Automatic roll-up-and-out order construction
- Ex-dividend early-assignment risk on the short call
- PMCC short-call assignment workflow (Epic 09)
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
