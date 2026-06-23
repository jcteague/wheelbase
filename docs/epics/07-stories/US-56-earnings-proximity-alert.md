# US-56: Fire earnings-proximity alert when earnings occur within 10 calendar days from today and on or before expiration

**As a** wheel trader with an open short option,
**I want to** be warned when an earnings event falls within the next 10 calendar days and before my option expires,
**So that** I do not carry an otherwise manageable wheel position into a binary event by accident.

---

## Context

Earnings are one of the fastest ways for a wheel trade to stop behaving like a steady premium sale and start behaving like a gap-risk bet. Traders usually want a warning before the event, but not noise about earnings that happen after the option expires. This story keeps the rule focused on actionable earnings risk inside the current contract window.

---

## Acceptance Criteria

```gherkin
Background:
  Given the alert engine evaluates positions with earnings-date data

Scenario: Alert fires when earnings are within 10 calendar days and before expiration
  Given NVDA is in CC_OPEN
  And the option expires on "2026-08-21"
  And the next earnings date is "2026-08-14"
  And today is "2026-08-08"
  When the alert engine evaluates active positions
  Then a medium-urgency EARNINGS_PROXIMITY alert is created for NVDA
  And the alert summary reads "Earnings in 6 days before your 2026-08-21 expiration"

Scenario: Alert does not fire when earnings are more than 10 days away
  Given NVDA is in CC_OPEN
  And the option expires on "2026-08-27"
  And the next earnings date is "2026-08-21"
  And today is "2026-08-08"
  When the alert engine evaluates active positions
  Then no EARNINGS_PROXIMITY alert is created for NVDA

Scenario: Alert does not fire when earnings occur after the option expires
  Given NVDA is in CC_OPEN
  And the option expires on "2026-08-15"
  And the next earnings date is "2026-08-18"
  And today is "2026-08-10"
  When the alert engine evaluates active positions
  Then no EARNINGS_PROXIMITY alert is created for NVDA

Scenario: Missing earnings data skips the rule without failing the run
  Given NVDA has an open option position
  And no earnings date is available
  When the alert engine evaluates active positions
  Then no EARNINGS_PROXIMITY alert is created for NVDA
  And the engine records a debug log that the rule was skipped
```

---

## Technical Notes

- The alert window is based on calendar days, not trading days.
- Only evaluate this rule when the earnings event falls before or on the active leg's expiration date.
- This story assumes an earnings-date provider is available to the main process. If a provider is not yet implemented, keep this story blocked behind that feed rather than inventing static data.

---

## Out of Scope

- Earnings exclusion during candidate screening
- IV-rank or IV-crush analytics
- Ex-dividend event warnings

---

## Dependencies

- US-50: scheduled alert evaluation
- Earnings-date feed for active underlyings

---

## Estimate

3 points

## Mockup

None — the queue treatment is covered by the US-51 dashboard mockup
