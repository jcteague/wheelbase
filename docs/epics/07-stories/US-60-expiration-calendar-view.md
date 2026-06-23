# US-60: Display expiration calendar view color-coded by phase

**As a** wheel trader planning my week,
**I want to** see all upcoming option expirations on a calendar grouped by date and color-coded by phase,
**So that** I can anticipate clusters of management work before multiple positions pile up at once.

---

## Context

A queue tells the trader what is urgent right now; a calendar shows what is about to become urgent next. Traders often get into trouble not because one position is hard to manage, but because several expirations land in the same week. A calendar view makes that clustering visible and gives phase context at a glance.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader opens the Expiration Calendar page
  And active positions have expiration dates and wheel phases

Scenario: Calendar shows expirations on the correct dates with phase colors
  Given the active positions are:
    | ticker | phase            | expiration  |
    | AAPL   | CSP_OPEN         | 2026-08-14  |
    | MSFT   | CC_OPEN          | 2026-08-14  |
    | TSLA   | HOLDING_SHARES   | —           |
  When the calendar month view loads
  Then the August 14 cell shows AAPL in the CSP color
  And the August 14 cell shows MSFT in the CC color
  And TSLA does not appear on the calendar because it has no active option expiration

Scenario: Selecting a populated date shows that day's positions in a side panel
  Given August 14 has two expirations
  When the trader clicks August 14
  Then the day detail panel lists AAPL and MSFT
  And each list row shows ticker, phase, strike, and DTE

Scenario: Overflow indicator appears when more expirations exist than fit in one date cell
  Given August 21 has 5 expirations
  When the calendar renders August 21
  Then the cell shows the first visible positions
  And the cell shows "+2 more" for the hidden entries

Scenario: Empty month state renders cleanly
  Given there are no active option expirations in September 2026
  When the trader navigates to September 2026
  Then the page shows "No expirations this month"
  And the month grid still renders without position chips
```

---

## Technical Notes

- The calendar data source should return active positions grouped by expiration date plus phase metadata for color mapping.
- Reuse existing phase token colors so the calendar stays visually aligned with the dashboard and position detail surfaces.
- A date cell should remain readable on dense weeks; overflow handling is required from the first slice.

---

## Out of Scope

- Dragging expirations between dates
- Broker calendar sync
- Closed-position history in the calendar

---

## Dependencies

- US-50: alert and expiration data plumbing
- Epic 04 dashboard and navigation conventions

---

## Estimate

5 points

## Mockup

`mockups/us-60-expiration-calendar-view.mdx`
