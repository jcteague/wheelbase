# US-18: Display active positions as cards with phase, ticker, strike, DTE, and premium

**As a** wheel trader managing multiple active positions,
**I want to** see all my positions displayed as compact cards showing the key data at a glance,
**So that** I can quickly assess the state of every position without opening each one individually.

---

## Context

The current position list is a table that works fine for a handful of positions but becomes hard to scan as the portfolio grows. A card-based grid gives each position a visual footprint where the phase badge, DTE countdown, and premium collected are immediately visible. This is the foundational story for the dashboard — all other dashboard stories (filtering, sorting, summary bar) build on top of the card grid.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has 3 active positions:
    | ticker | phase          | strike  | expiration  | contracts | premium_collected | effective_cost_basis |
    | AAPL   | CSP_OPEN       | 180.00  | 2026-05-16  | 1         | 3.50              | 176.50               |
    | MSFT   | CC_OPEN        | 420.00  | 2026-05-09  | 2         | 5.20              | 412.80               |
    | TSLA   | HOLDING_SHARES | —       | —           | 1         | 8.00              | 242.00               |

Scenario: Each position renders as a card with required data fields
  When the trader views the dashboard
  Then each active position is displayed as a card
  And each card shows the ticker symbol prominently
  And each card shows a phase badge matching the position's current phase
  And each card shows the active strike price (or "—" if HOLDING_SHARES with no open option)
  And each card shows the active expiration date and DTE countdown (or "—" if no open option)
  And each card shows total premium collected in green
  And each card shows the effective cost basis per share

Scenario: DTE countdown highlights urgency when 7 days or fewer remain
  Given MSFT has 7 days to expiration
  When the trader views the dashboard
  Then the MSFT card shows the DTE value in gold with a visual urgency indicator

Scenario: DTE displays as "—" when position has no active option leg
  Given TSLA is in HOLDING_SHARES with no open covered call
  When the trader views the dashboard
  Then the TSLA card shows "—" for expiration and DTE

Scenario: Cards display in a responsive grid layout
  When the trader views the dashboard at full width
  Then position cards are arranged in a multi-column grid (3–4 cards per row)
  When the trader narrows the window
  Then the grid reflows to fewer columns (down to 1 card per row on narrow widths)

Scenario: Card shows the option type context alongside strike
  Given AAPL has a CSP_OPEN at the $180 strike
  When the trader views the AAPL card
  Then the strike displays as "PUT $180.00"
  And MSFT's CC_OPEN displays as "CALL $420.00"

Scenario: Dashboard replaces the current table-based position list
  When the trader navigates to the root "/" route
  Then the dashboard with card grid is displayed (not the previous table view)
```

---

## Technical Notes

- **Renderer-only story.** All data comes from the existing `listPositions()` IPC call which already returns `PositionListItem` with: `id`, `ticker`, `phase`, `status`, `strike`, `expiration`, `dte`, `premiumCollected`, `effectiveCostBasis`.
- **New component:** `PositionCard` — a self-contained card component receiving a `PositionListItem` prop.
- **Grid layout:** Use CSS Grid with `auto-fill` and `minmax(280px, 1fr)` for responsive reflow. No media queries needed.
- **Reuse existing components:** `PhaseBadge` for phase, `fmtMoney()` for currency, `computeDte()` for DTE calculation (already in `src/renderer/src/lib/format.ts`).
- **Phase-aware display:** When `strike` or `expiration` is null (e.g., HOLDING_SHARES between CC cycles), show "—" in muted text.
- **DTE urgency threshold:** Reuse the existing `≤ 7 days → gold` pattern from `PositionsListPage`.
- **Route change:** The root `/` route switches from `PositionsListPage` to the new `DashboardPage` (which contains the card grid plus summary bar from US-19).
- The existing `PositionsListPage` table may be preserved as an alternate view or removed — depends on user preference after testing.

---

## Out of Scope

- Portfolio summary bar (US-19)
- Filtering by phase (US-20)
- Sorting controls (US-21)
- Distance-to-strike indicator (US-22 — Phase 2)
- Empty state when no positions exist (US-23)
- Click-to-navigate to detail page (US-24 — trivial, but tracked separately)
- Closed positions section (active positions only in this story)

---

## Dependencies

- Epic 01 (positions must exist to display)

---

## Estimate

5 points

## Mockup

- `mockups/us-18-position-cards.mdx` — Phase 1 card (no live prices)
- `mockups/us-04-dashboard-position-card.mdx` — Unified card with all Epic 04 features including Phase 2 distance gauge
