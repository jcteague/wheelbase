# US-21: Sort positions by DTE, ticker, or premium collected

**As a** wheel trader scanning my dashboard,
**I want to** sort the position cards by DTE (soonest first), ticker (alphabetical), or total premium collected,
**So that** I can prioritize my review — checking expiring positions first, or finding my highest-income wheels.

---

## Context

The default sort order (DTE ascending) surfaces positions that need the most immediate attention — an expiring CSP that needs a roll decision, or a CC approaching assignment. But sometimes the trader wants a different lens: alphabetical to find a specific ticker quickly, or by premium to review which positions have been the most productive. Sort complements phase filtering (US-20) — the trader can filter to CSP_OPEN and then sort by DTE to see which puts expire soonest.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has 4 active positions:
    | ticker | dte  | premium_collected |
    | AAPL   | 25   | 3.50              |
    | MSFT   | 7    | 5.20              |
    | TSLA   | null | 8.00              |
    | GOOG   | 42   | 2.10              |

Scenario: Default sort is by DTE ascending (soonest first)
  When the trader views the dashboard
  Then cards are ordered: MSFT (7d), AAPL (25d), GOOG (42d), TSLA (—)
  And positions with null DTE appear last

Scenario: Sort by ticker alphabetically
  When the trader selects "Ticker" sort
  Then cards are ordered: AAPL, GOOG, MSFT, TSLA

Scenario: Sort by premium collected descending (highest first)
  When the trader selects "Premium" sort
  Then cards are ordered: TSLA ($8.00), MSFT ($5.20), AAPL ($3.50), GOOG ($2.10)

Scenario: Active sort option is visually indicated
  When the trader selects "Ticker" sort
  Then the "Ticker" sort option appears highlighted
  And the "DTE" and "Premium" options appear in default style

Scenario: Sort persists across filter changes
  Given the trader has selected "Premium" sort
  When the trader changes the phase filter from "All" to "Sell Put"
  Then the filtered results remain sorted by premium descending

Scenario: Sort is stable for equal values
  Given two positions both have DTE of 14
  When sorted by DTE
  Then both appear adjacent and their relative order is consistent (by ticker as tiebreaker)
```

---

## Technical Notes

- **Renderer-only story.** Sorting is client-side on `PositionListItem[]`. All three sort fields (`dte`, `ticker`, `premiumCollected`) are already in the response.
- **Sort control:** Compact inline control next to the filter bar — either a dropdown or segmented toggle with three options: "DTE", "Ticker", "Premium".
- **Sort directions:** DTE → ascending (soonest first), Ticker → ascending (A–Z), Premium → descending (highest first). Fixed directions — no toggle for asc/desc (keep it simple).
- **Null DTE handling:** Positions without an active option leg have `dte: null`. These sort to the end in DTE mode.
- **Tiebreaker:** When primary sort values are equal, secondary sort by ticker ascending.
- **State management:** `useState<SortKey>('dte')` in `DashboardPage`. Default is `'dte'`.
- **Premium sort value:** `premiumCollected` is a decimal string — parse with `parseFloat` for comparison.

---

## Out of Scope

- Ascending/descending toggle per sort key
- Sort by cost basis, open date, or other fields
- Persisting sort preference across sessions
- Server-side sorting

---

## Dependencies

- US-18: Position card grid must exist to sort

---

## Estimate

2 points

## Mockup

`mockups/us-21-sort-positions.mdx`
