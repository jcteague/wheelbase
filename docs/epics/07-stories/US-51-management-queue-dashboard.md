# US-51: Display management queue on dashboard ordered by urgency tier

**As a** wheel trader starting my day,
**I want to** see a management queue at the top of the dashboard ordered by urgency,
**So that** I know which positions deserve attention first without opening my broker or every position detail page.

---

## Context

Wheel traders often manage several contracts at once, and the hard part is not finding information but deciding where to look first. A management queue turns the dashboard from a passive snapshot into an action surface. To stay trustworthy, it should surface the most urgent items first, show why the alert fired in trader language, and offer a direct next step.

---

## Acceptance Criteria

```gherkin
Background:
  Given the alert engine has persisted open alerts
  And the trader opens the dashboard

Scenario: Queue appears above the position cards ordered by urgency then time
  Given the open alerts are:
    | ticker | rule                  | urgency | dte |
    | AAPL   | EXPIRATION_IMMINENT   | high    | 3   |
    | TSLA   | STRIKE_PROXIMITY      | medium  | 9   |
    | NVDA   | PROFIT_TARGET         | low     | 14  |
  When the dashboard loads
  Then the management queue renders above the positions grid
  And AAPL appears first
  And TSLA appears second
  And NVDA appears third

Scenario: Queue item shows the key fields traders need to act
  Given AAPL has an EXPIRATION_IMMINENT alert
  When the trader views the queue item
  Then the item shows ticker "AAPL"
  And the item shows the current phase badge
  And the item shows the trigger summary "Expires in 3 days at $180.00 strike"
  And the item shows a quick action button labeled "Review position"

Scenario: Queue item opens the related position from the quick action
  Given TSLA has a STRIKE_PROXIMITY alert
  When the trader clicks the quick action button
  Then the app navigates to the TSLA position detail page

Scenario: Empty state renders when there are no open alerts
  Given there are no open alerts
  When the trader opens the dashboard
  Then the management queue shows "No positions need attention right now"
  And the empty state does not render any quick action buttons
```

---

## Technical Notes

- Add an alerts query path from main to renderer that returns only open, non-dismissed alerts already sorted for display.
- Reuse existing dashboard visual language: `SectionCard`, `PhaseBadge`, mono numeric text, and gold/red urgency accents.
- Quick actions in Phase 3 can route to the position detail page; they do not need to trigger broker actions.
- Keep one row per open alert in this first slice. Grouping multiple alert types into a single position summary can be revisited after trader feedback.

---

## Out of Scope

- Bulk actions across multiple alerts
- Drag-to-reorder or manual pinning
- Snoozing alerts for a time window
- Portfolio-level queue analytics

---

## Dependencies

- US-50: open alerts must already be persisted
- Epic 04 dashboard shell and position navigation

---

## Estimate

5 points

## Mockup

`mockups/us-51-management-queue-dashboard.mdx`
