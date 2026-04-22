# US-23: Handle empty state when no positions exist with prompt to create first wheel

**As a** new trader opening the app for the first time,
**I want to** see a helpful empty state instead of a blank page when I have no positions,
**So that** I know what the app does and how to get started.

---

## Context

Every new user's first experience is the empty dashboard. If it's just a blank grid, the app feels broken. The empty state is an onboarding moment — it should explain what a wheel position is (briefly), and provide a clear call-to-action to open the first wheel. This also applies to returning traders who have closed all their positions.

---

## Acceptance Criteria

```gherkin
Scenario: Empty state displayed when no positions exist
  Given the trader has zero positions (neither active nor closed)
  When the trader views the dashboard
  Then the summary bar shows all zeroes ($0.00 capital, $0.00 premium, 0 active)
  And the card grid area shows an empty state illustration or icon
  And a heading reads "No positions yet"
  And a subheading reads "Start your first wheel by selling a cash-secured put"
  And a primary CTA button reads "Open Your First Wheel"

Scenario: CTA navigates to the new wheel form
  Given the empty state is displayed
  When the trader clicks "Open Your First Wheel"
  Then the app navigates to the new wheel page (/new)

Scenario: Empty state disappears after creating a position
  Given the empty state is displayed
  When the trader creates a new CSP position and returns to the dashboard
  Then the empty state is replaced by the position card grid
  And the new position card is visible

Scenario: All-closed state shows a different message
  Given the trader has 2 positions but both are CLOSED (WHEEL_COMPLETE)
  And no ACTIVE positions exist
  When the trader views the dashboard with the "All" (active) filter
  Then the card grid area shows: "All wheels complete — nice work"
  And a CTA reads "Start a New Wheel"

Scenario: Filtered empty state shows phase-specific message
  Given the trader has 3 active positions but none in CC_OPEN phase
  When the trader selects the "Sell Call" filter
  Then a message appears: "No positions in this phase"
  And no CTA is shown (this is not a zero-data state, just an empty filter)
```

---

## Technical Notes

- **Renderer-only story.** The `listPositions()` call returns an empty array; no backend changes needed.
- **Empty state component:** `DashboardEmptyState` — centered layout with icon, heading, subheading, and `FormButton` CTA.
- **Condition logic in `DashboardPage`:**
  - If `positions.length === 0`: full empty state with onboarding copy
  - If `activePositions.length === 0 && closedPositions.length > 0`: "all complete" variant
  - If filtered positions are empty but unfiltered are not: inline "no positions in this phase" message (lighter treatment)
- **Navigation:** CTA uses wouter's `useLocation` to navigate to `#/new`.
- **Visual treatment:** Keep the summary bar visible even in empty state (shows zeroes) — this establishes the page structure so it doesn't feel jarring when the first position appears.

---

## Out of Scope

- Onboarding tutorial or walkthrough
- Sample/demo data mode
- Links to educational content about the wheel strategy

---

## Dependencies

- US-18: Dashboard page and card grid layout must exist
- US-19: Summary bar (shows zeroes in empty state)
- US-20: Phase filter (for filtered-empty-state variant)

---

## Estimate

2 points

## Mockup

`mockups/us-23-empty-state.mdx`
