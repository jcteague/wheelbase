# US-52: Fire expiration-imminent alert when DTE <= 5

**As a** wheel trader with short options nearing expiration,
**I want to** receive a high-urgency alert once a position reaches 5 DTE or less,
**So that** I do not miss the final decision window to roll, close, or accept expiration outcomes.

---

## Context

Inside the final five days, the trade becomes time-sensitive. Gamma risk rises, assignment odds can change quickly, and the trader may only have one or two trading sessions left to act. This alert is intentionally louder than a normal management reminder because it highlights positions that can no longer wait until "later this week."

---

## Acceptance Criteria

```gherkin
Background:
  Given the alert engine evaluates active wheel positions

Scenario: Alert fires at 5 DTE remaining
  Given AAPL is in CSP_OPEN
  And its active leg expires on "2026-07-17"
  And today is "2026-07-12"
  When the alert engine evaluates active positions
  Then a high-urgency EXPIRATION_IMMINENT alert is created for AAPL
  And the alert summary reads "Expires in 5 days at $180.00 strike"
  And the quick action is "Review position"

Scenario: Alert remains open inside the final 5-day window
  Given an open EXPIRATION_IMMINENT alert already exists for AAPL
  And today is "2026-07-14" with 3 DTE remaining
  When the alert engine evaluates active positions
  Then the existing EXPIRATION_IMMINENT alert remains open
  And its summary updates to "Expires in 3 days at $180.00 strike"

Scenario: Alert does not fire before the threshold
  Given AAPL has 6 DTE remaining
  When the alert engine evaluates active positions
  Then no EXPIRATION_IMMINENT alert is created for AAPL

Scenario: Alert resolves after the leg is closed or expires
  Given an open EXPIRATION_IMMINENT alert exists for AAPL
  And the CSP is closed early before the next evaluation
  When the alert engine evaluates active positions
  Then the EXPIRATION_IMMINENT alert is marked resolved
```

---

## Technical Notes

- `DTE <= 5` is a fixed built-in rule in this epic; it is not part of the configurable management-window threshold.
- This rule applies to open short option legs only (`CSP_OPEN`, `CC_OPEN`), not `HOLDING_SHARES`.
- Use the same DTE calculation already established in market-data surfaces so queue messaging and dashboard badges stay consistent.

---

## Out of Scope

- Separate expiration-day after-hours handling
- Pin-risk-specific copy variants
- Broker auto-exercise education content

---

## Dependencies

- US-50: scheduled alert evaluation
- US-32: expiration and DTE data available to the alert engine

---

## Estimate

3 points

## Mockup

None — rule behavior appears within the queue mockup in US-51
