# US-59: Dismiss an alert with a record of the dismissal

**As a** wheel trader triaging my queue,
**I want to** dismiss an alert I have reviewed but do not want resurfacing immediately,
**So that** the queue stays focused on what still needs action while preserving an audit trail of what I intentionally ignored.

---

## Context

Not every alert leads to action. Sometimes the trader deliberately chooses to hold through a signal. Dismissal should therefore be a suppression mechanism with history, not a delete. The key trust requirement is that a dismissed alert stays out of the queue until the underlying condition clears and later reoccurs.

---

## Acceptance Criteria

```gherkin
Background:
  Given AAPL has an open MANAGEMENT_WINDOW alert in the dashboard queue

Scenario: Trader dismisses an alert from the queue
  When the trader clicks "Dismiss" on the AAPL alert
  Then the alert status changes to dismissed
  And the alert stores a dismissed_at timestamp
  And the alert no longer appears in the open management queue

Scenario: Dismissed alert does not immediately reappear while the condition is unchanged
  Given the AAPL MANAGEMENT_WINDOW alert was dismissed today
  And AAPL still has 12 DTE remaining
  When the alert engine evaluates active positions again
  Then the dismissed alert remains hidden from the open queue
  And no new MANAGEMENT_WINDOW alert is created for AAPL

Scenario: Dismissed alert can reappear after the condition clears and later returns
  Given the AAPL MANAGEMENT_WINDOW alert was dismissed
  And AAPL is later rolled to 30 DTE
  And on a future cycle AAPL returns to 14 DTE
  When the alert engine evaluates active positions
  Then a new MANAGEMENT_WINDOW alert is created for AAPL
  And the new alert has a new triggered_at timestamp

Scenario: Dismissing an already resolved alert is rejected
  Given the AAPL alert has already been resolved
  When the trader attempts to dismiss it again
  Then the request is rejected with message "Only open alerts can be dismissed"
```

---

## Technical Notes

- Model dismissal as a status transition (`open -> dismissed`) plus timestamp, not a destructive delete.
- A dismissed alert should be re-openable only through a fresh trigger cycle after the condition has cleared.
- Reuse the existing app pattern for "dismissed but retained in SQLite" established by pending assignments.

---

## Out of Scope

- Dismissal notes or free-text reasons
- Bulk dismiss
- Timed snooze with automatic wake-up

---

## Dependencies

- US-50: persisted alert records and status transitions
- US-51: queue surface with a dismiss affordance

---

## Estimate

3 points

## Mockup

`mockups/us-59-dismiss-alert.mdx`
