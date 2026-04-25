# US-33: Show current option mid-price and unrealized P&L for open legs

**As a** wheel trader monitoring my open option positions,
**I want to** see the current market value of each option and my unrealized P&L,
**So that** I can decide whether to take profit, roll, or hold without checking my broker platform.

---

## Context

A wheel trader's most frequent decision is: "Should I close this now, roll it, or let it ride?" That decision requires knowing the unrealized P&L on the current option leg. Today the app shows the premium received at entry but has no sense of the option's current value. This story adds the live option mid-price and computes unrealized P&L for every open leg.

For short options (CSPs and CCs — which is all a wheel trader holds), P&L is positive when the option has decayed (costs less to buy back than what was received). The app also surfaces when the position has reached the trader's profit target (default 50%, configurable per position), which is the most common trigger for closing or rolling.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has an open CSP on AAPL:
    | strike | expiration | contracts | premium_per_contract |
    | 180.00 | 2026-05-16 | 1         | 3.50                 |
  And the MarketDataProvider is returning option snapshots

Scenario: Position row shows option mid-price for the open leg
  Given the current option bid is $1.20 and ask is $1.40
  When the trader views the position list
  Then the AAPL row shows the option mid-price as "$1.30"
  And the mid-price label reads "Opt Mid"

Scenario: Unrealized P&L displays as green when profitable
  Given entry premium was $3.50 and current mid-price is $1.30
  When the trader views the position list
  Then the unrealized P&L shows "+$220.00" in green
  And the P&L calculation is: ($3.50 − $1.30) × 1 × 100 = $220.00

Scenario: Unrealized P&L displays as red when at a loss
  Given entry premium was $3.50 and current mid-price is $5.20
  When the trader views the position list
  Then the unrealized P&L shows "-$170.00" in red
  And the P&L calculation is: ($3.50 − $5.20) × 1 × 100 = −$170.00

Scenario: Profit target badge appears when threshold is reached
  Given the global profit target is 50%
  And the AAPL position has no per-position override
  And the max profit is $350.00 (premium × contracts × 100)
  And the current unrealized P&L is $220.00 (62.9% of max)
  When the trader views the position list
  Then a gold "TARGET" badge appears on the AAPL row
  And hovering the badge shows "62.9% of max profit ($350) — target is 50%"

Scenario: Per-position profit target overrides global default
  Given the global profit target is 50%
  And the AAPL position has a per-position profit target of 25%
  And the unrealized P&L is $100.00 (28.6% of max)
  When the trader views the position list
  Then the gold "TARGET" badge appears (28.6% > 25%)

Scenario: Position detail page shows P&L in the Open Leg section
  Given the trader navigates to the AAPL position detail page
  When the page loads with live option data
  Then the Open Leg section shows an additional "Current Mid" stat with "$1.30"
  And shows an "Unrealized P&L" stat with "+$220.00" in green
  And shows "% of Max Profit" stat with "62.9%"

Scenario: Wide bid-ask spread shows warning
  Given the option bid is $0.50 and ask is $1.50 (spread > 10% of mid)
  When the trader views the position list
  Then the mid-price "$1.00" displays with an amber spread-warning icon
  And hovering the icon shows "Wide spread: $0.50 × $1.50 — P&L may be unreliable"

Scenario: No bid on deep OTM option near expiration
  Given the option bid is $0.00 and ask is $0.05
  When the trader views the position list
  Then the mid-price shows "$0.03"
  And the unrealized P&L shows "+$347.50" in green
  And a "no bid" indicator appears

Scenario: HOLDING_SHARES position shows no option P&L
  Given the position is in HOLDING_SHARES phase with no open option leg
  When the trader views the position list
  Then the option mid-price column shows "—"
  And the unrealized P&L column shows "—"

Scenario: Option data unavailable falls back gracefully
  Given the MarketDataProvider returns no snapshot for the AAPL option
  When the trader views the position list
  Then the option mid-price shows "—"
  And the unrealized P&L shows "—"
  And all other position data displays normally
```

---

## Technical Notes

- **New IPC channel:** `market-data:option-snapshots` — accepts an array of OCC-style option symbols, returns `Record<string, OptionSnapshot>` from the MarketDataProvider.
- **Option symbol construction:** The service needs to build the OCC symbol from the leg's ticker, expiration, strike, and instrument type (PUT/CALL). Add a pure utility `buildOccSymbol(ticker, expiration, strike, type)` in `src/main/core/`.
- **P&L is a pure calculation:** Add `computeUnrealizedPnl(entryPremium, currentMid, contracts)` to `src/main/core/costbasis.ts` — it returns `{ pnl: string, pnlPercent: string, maxProfit: string }`. No I/O.
- **Profit target storage:** Add `profit_target_percent` column to the `positions` table (nullable, INTEGER). When null, use the global default from app settings. Migration needed.
- **TanStack Query:** Create `useOptionSnapshots(legs)` hook that extracts contract IDs from active legs and polls on the same interval as stock quotes.
- **Renderer changes:** Add "Opt Mid" and "P&L" columns to `PositionRow` and `PositionsListPage` table header. Add stats to `PositionDetailContent`'s Open Leg section.
- **Spread warning threshold:** If `(ask - bid) / mid > 0.10`, show the warning icon. This is a constant, not configurable.

---

## Out of Scope

- Greeks display (US-34)
- P&L for closed legs or overall position P&L (includes share appreciation — that's a separate concern)
- Automatic closing or rolling based on profit target (Epic 10 — order execution)
- Historical P&L chart

---

## Dependencies

- US-31 (MarketDataProvider adapter)
- US-32 (live price infrastructure — IPC channels, TanStack Query patterns, market status indicator)

---

## Estimate

5 points

## Mockup

- `mockups/us-33-option-price-unrealized-pnl.mdx`
