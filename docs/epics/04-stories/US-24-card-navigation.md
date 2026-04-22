# US-24: Navigate from position card to position detail page

**As a** wheel trader who spots a position needing attention on the dashboard,
**I want to** click a position card to go directly to that position's detail page,
**So that** I can take action (roll, close, record assignment) without searching or navigating through menus.

---

## Context

The dashboard card grid is a scanning surface — the trader glances at cards to find the one that needs action, then drills in. The click-to-navigate interaction must feel instant and obvious. The card should have a hover state that signals it's clickable, and the navigation should land on the existing position detail page (from Epic 01, US-3) with full context loaded.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an active position on AAPL with id "pos-abc-123"

Scenario: Clicking a position card navigates to the detail page
  When the trader clicks the AAPL position card
  Then the app navigates to the position detail page at route "/positions/pos-abc-123"
  And the position detail page loads with AAPL's full data

Scenario: Card shows hover state indicating interactivity
  When the trader hovers over the AAPL position card
  Then the card border brightens or a subtle highlight appears
  And the cursor changes to pointer

Scenario: Keyboard navigation works for accessibility
  When the trader focuses the AAPL card with Tab
  And presses Enter
  Then the app navigates to "/positions/pos-abc-123"

Scenario: Navigation preserves dashboard state in browser history
  Given the trader is on the dashboard
  When the trader clicks the AAPL card and views the detail page
  And then clicks the browser back button (or breadcrumb "← Positions")
  Then the dashboard is displayed
```

---

## Technical Notes

- **Renderer-only story.** Uses wouter's `useLocation` to navigate to `#/positions/${id}`.
- **Card wrapper:** The entire `PositionCard` should be wrapped in an `<a>` or use `onClick` with `navigate`. Prefer a semantic `<a href="#/positions/${id}">` for accessibility.
- **Hover style:** Add `hover:border-[var(--wb-gold)]` or equivalent transition on the card border. Keep it subtle — a slight border color shift from `--wb-border` to a brighter tone.
- **Focus style:** Visible focus ring for keyboard navigation. Use existing Tailwind `focus-visible:ring` utilities.
- **Existing detail page:** The `PositionDetailPage` at `/positions/:id` already exists and handles all position data loading via `usePosition(id)`. No changes needed to the detail page itself.

---

## Out of Scope

- Right-click context menu on cards
- Quick-action buttons on the card itself (e.g., "Roll" directly from card)
- Swipe gestures for touch
- Opening detail in a side panel instead of full page navigation

---

## Dependencies

- US-18: Position card component must exist
- US-3 (Epic 01): Position detail page must exist (already complete)

---

## Estimate

1 point

## Mockup

`mockups/us-18-position-cards.mdx` (navigation behavior is demonstrated within the position cards mockup)
