# US-20: Filter positions by lifecycle phase

**As a** wheel trader with positions in different lifecycle phases,
**I want to** filter the dashboard to show only positions in a specific phase (or all phases),
**So that** I can focus my attention — for example, reviewing only my open CSPs to decide which to roll before expiration.

---

## Context

As the portfolio grows beyond 5–6 positions, the card grid becomes noisy. The most natural grouping for wheel traders is by lifecycle phase, because each phase demands a different kind of attention: CSP_OPEN positions need roll-or-expire decisions, HOLDING_SHARES positions need CC strike selection, CC_OPEN positions need exit monitoring. Filtering by phase lets the trader focus on one decision type at a time.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has active positions in multiple phases:
    | ticker | phase          |
    | AAPL   | CSP_OPEN       |
    | MSFT   | CC_OPEN        |
    | TSLA   | HOLDING_SHARES |
    | GOOG   | CSP_OPEN       |
  And the trader has 1 closed position:
    | ticker | phase          |
    | AMD    | WHEEL_COMPLETE |

Scenario: All active phases shown by default
  When the trader views the dashboard
  Then the "All" filter is active
  And all 4 active position cards are visible
  And the closed position (AMD) is not shown in the active grid

Scenario: Filter to CSP_OPEN shows only open puts
  When the trader selects the "Sell Put" phase filter
  Then only AAPL and GOOG cards are visible
  And MSFT and TSLA cards are hidden

Scenario: Filter to HOLDING_SHARES shows only share-holding positions
  When the trader selects the "Holding" phase filter
  Then only TSLA card is visible

Scenario: Filter to CC_OPEN shows only open calls
  When the trader selects the "Sell Call" phase filter
  Then only MSFT card is visible

Scenario: Filter to CLOSED shows completed wheels
  When the trader selects the "Closed" filter
  Then only AMD card is visible

Scenario: Filter pill shows count of matching positions
  When the trader views the filter bar
  Then "All" shows count 4
  And "Sell Put" shows count 2
  And "Holding" shows count 1
  And "Sell Call" shows count 1
  And "Closed" shows count 1

Scenario: Selecting the active filter again resets to All
  Given the "Sell Put" filter is active
  When the trader selects "Sell Put" again
  Then the filter resets to "All"
  And all active positions are visible

Scenario: Empty filter result shows inline message
  Given no positions are in CC_OPEN phase
  When the trader selects the "Sell Call" filter
  Then a message appears: "No positions in this phase"
  And no cards are rendered
```

---

## Technical Notes

- **Renderer-only story.** Filtering is client-side on the existing `PositionListItem[]` returned by `listPositions()`. The `phase` field is already available.
- **Phase grouping:** Map the detailed phases to display groups:
  - "Sell Put" → `CSP_OPEN` (includes positions whose active leg is a rolled CSP)
  - "Holding" → `HOLDING_SHARES`
  - "Sell Call" → `CC_OPEN` (includes positions whose active leg is a rolled CC)
  - "Closed" → `status === 'CLOSED'` (any terminal phase: `WHEEL_COMPLETE`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`, etc.)
- **Filter bar component:** Horizontal row of pill buttons above the card grid. Each pill shows the phase label and a count badge. Active pill uses gold highlight.
- **State management:** `useState<PhaseFilter>` in `DashboardPage`. No URL persistence needed (resets on nav away).
- **Interaction with sort (US-21):** Filter and sort are independent — filtering reduces the set, sorting reorders it.
- **Summary bar (US-19):** Summary bar always reflects all active positions regardless of filter. Only the card grid is filtered.

---

## Out of Scope

- Multi-select filtering (e.g., CSP_OPEN + CC_OPEN simultaneously)
- Filter by ticker or other fields
- Persisting filter state across navigation
- Filter by strategy type (WHEEL vs. PMCC — Epic 09)

---

## Dependencies

- US-18: Position card grid must exist to filter

---

## Estimate

2 points

## Mockup

`mockups/us-20-filter-by-phase.mdx`
