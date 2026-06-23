# US-61: Flag positions expiring within 7 days on dashboard and calendar

**As a** wheel trader scanning both the dashboard and the expiration calendar,
**I want to** see a prominent visual flag for positions expiring within 7 days,
**So that** near-term contracts stand out even before they cross the final 5-DTE alert threshold.

---

## Context

The 7-day mark is not always an "act now" signal, but it is a meaningful attention threshold. It gives the trader a wider runway than the critical 5-DTE rule and keeps upcoming expirations visible in both the operational queue and the planning calendar. This flag should be persistent factual context, not a suppressible alert.

---

## Acceptance Criteria

```gherkin
Background:
  Given the dashboard and expiration calendar both display active positions with DTE values

Scenario: Dashboard highlights positions with 7 DTE or less
  Given AAPL is in CSP_OPEN with 7 DTE remaining
  When the trader views the dashboard
  Then the AAPL row or card shows a prominent "7 DTE" flag in gold
  And the flag is visible even if AAPL has no separate queue item open

Scenario: Calendar highlights expiring-soon positions
  Given MSFT is in CC_OPEN with 4 DTE remaining
  When the trader views the expiration calendar
  Then the MSFT chip or date cell shows an expiring-soon highlight
  And the day detail panel labels MSFT as "Expiring soon"

Scenario: Positions outside the threshold are not flagged
  Given NVDA is in CC_OPEN with 8 DTE remaining
  When the trader views the dashboard and calendar
  Then NVDA does not show the expiring-soon flag

Scenario: Holding-shares positions are not flagged
  Given TSLA is in HOLDING_SHARES with no active option expiration
  When the trader views the dashboard and calendar
  Then TSLA does not show the expiring-soon flag
```

---

## Technical Notes

- This is a display rule based on current DTE, not an alert record with dismissible state.
- Keep the visual treatment consistent across dashboard and calendar so traders do not have to learn two separate warning languages.
- Reuse the existing gold DTE emphasis pattern already present in dashboard rows where possible.

---

## Out of Scope

- User-configurable expiring-soon thresholds
- Separate flags for 3 DTE, 1 DTE, or expiration day
- Notification delivery outside the app UI

---

## Dependencies

- US-51: dashboard management surfaces
- US-60: expiration calendar surface

---

## Estimate

3 points

## Mockup

`mockups/us-61-expiring-soon-flags.mdx`
