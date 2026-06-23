# US-53: Fire management-window alert when DTE is between 6 and 21

**As a** wheel trader managing profitable or challenged positions,
**I want to** receive a reminder when a position enters the standard 21-DTE management window,
**So that** I review it while there is still enough time and liquidity to roll or close cleanly.

---

## Context

For many wheel traders, 21 DTE is the point where the position deserves fresh attention. Theta decay is attractive, but gamma risk is starting to matter and rolling is still practical. This is a lower-urgency alert than expiration imminent, and it should not double-fire once the position moves into the final 5-DTE critical window.

---

## Acceptance Criteria

```gherkin
Background:
  Given the alert engine evaluates active wheel positions

Scenario: Alert fires when a position enters the 21-DTE window
  Given MSFT is in CC_OPEN
  And its active leg has 21 DTE remaining
  When the alert engine evaluates active positions
  Then a medium-urgency MANAGEMENT_WINDOW alert is created for MSFT
  And the alert summary reads "21 DTE remaining — review for roll or close"

Scenario: Alert remains open while the position stays between 6 and 21 DTE
  Given an open MANAGEMENT_WINDOW alert already exists for MSFT
  And MSFT now has 12 DTE remaining
  When the alert engine evaluates active positions
  Then the existing MANAGEMENT_WINDOW alert remains open
  And the summary updates to "12 DTE remaining — review for roll or close"

Scenario: Alert does not fire outside the threshold
  Given MSFT has 22 DTE remaining
  When the alert engine evaluates active positions
  Then no MANAGEMENT_WINDOW alert is created for MSFT

Scenario: Expiration-imminent takes precedence inside 5 DTE
  Given MSFT has 4 DTE remaining
  When the alert engine evaluates active positions
  Then no new MANAGEMENT_WINDOW alert is created for MSFT
  And the position is eligible only for EXPIRATION_IMMINENT in this window
```

---

## Technical Notes

- Treat the management window as `6 <= DTE <= configuredThreshold`, where the default threshold is 21 and the lower bound excludes the expiration-imminent window.
- This overlap rule reduces duplicate queue noise on the same position.
- When a trader lowers the configured threshold below 21 (e.g. to 14 via US-57), positions between `threshold + 1` and 21 DTE intentionally produce no management-window alert until they reach the trader's chosen window. This is expected behavior, not a missed alert — the trader has opted into a tighter review window.
- The queue quick action can remain the generic "Review position" in Phase 3.

---

## Out of Scope

- Delta- or Greeks-based management windows
- Separate thresholds by wheel phase
- Automatic roll suggestions

---

## Dependencies

- US-50: scheduled alert evaluation
- US-52: expiration-imminent precedence is already defined

---

## Estimate

3 points

## Mockup

None — rule behavior appears within the queue mockup in US-51
