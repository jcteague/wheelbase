# US-32: Display live underlying price on position list with market status indicator

**As a** wheel trader scanning my active positions,
**I want to** see the current underlying stock price on each position row,
**So that** I can instantly gauge whether each position is moving in my favor or against me without leaving the app.

---

## Context

Today the position list shows only static data from the database: strike, DTE, premium, cost basis. The trader has no price context — they must mentally recall or check their broker to know where the stock is relative to their strike. Adding the live underlying price to each row turns the position list into a real-time dashboard. This is the first story that wires live data from the MarketDataProvider (US-31) to the renderer.

When the market is closed, the last known price is still displayed with a visual indicator so the trader always has context. Extended hours prices are shown when available since the underlying can move significantly overnight.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has 3 active positions:
    | ticker | phase          | strike |
    | AAPL   | CSP_OPEN       | 180.00 |
    | MSFT   | CC_OPEN        | 420.00 |
    | TSLA   | HOLDING_SHARES | —      |
  And the MarketDataProvider is configured and returning data

Scenario: Position rows show live underlying price during market hours
  Given the market is open (regular session)
  And AAPL is trading at $182.45, MSFT at $418.30, TSLA at $248.10
  When the trader views the position list
  Then each row displays the current stock price in a "Price" column
  And the AAPL row shows "$182.45"
  And a green "LIVE" dot indicator appears next to the price

Scenario: Price updates on polling interval without full page reload
  Given AAPL was showing $182.45
  When the next 60-second poll completes and AAPL is now $183.10
  Then the AAPL row updates to show "$183.10"
  And no loading spinner or page flash occurs

Scenario: Price shows daily change amount and direction
  Given AAPL opened at $181.00 and is now trading at $182.45
  When the trader views the position list
  Then the AAPL row shows "+$1.45" in green text next to the price
  And when a stock is down (MSFT at $418.30, opened at $420.00)
  Then the MSFT row shows "-$1.70" in red text

Scenario: Market closed — show last closing price with indicator
  Given the market is closed (weekend or after 8:00 PM ET)
  And AAPL last closed at $182.00
  When the trader views the position list
  Then the AAPL row shows "$182.00"
  And a gray "CLOSED" indicator appears instead of the green dot

Scenario: Extended hours — show pre/post market price
  Given the market is in extended hours (pre-market or after-hours)
  And AAPL closed at $182.00 but is trading at $183.50 in after-hours
  When the trader views the position list
  Then the AAPL row shows "$183.50"
  And an amber "EXT" indicator appears

Scenario: Price data unavailable — show dash with tooltip
  Given the MarketDataProvider returns no quote for TSLA (API error or timeout)
  When the trader views the position list
  Then the TSLA price column shows "—"
  And a tooltip or subtle message indicates "Price unavailable"
  And all other position data (strike, DTE, premium) still displays normally

Scenario: Stale data warning when last update exceeds 5 minutes
  Given the last successful price poll was more than 5 minutes ago
  When the trader views the position list
  Then a subtle banner appears: "Prices may be delayed — last updated 6m ago"
  And the market status dot changes to amber
```

---

## Technical Notes

- **New IPC channel:** `market-data:stock-quotes` — returns `Record<string, StockQuote>` from the MarketDataProvider for all active position tickers. Called by the renderer on an interval.
- **New IPC channel:** `market-data:market-status` — returns `MarketStatus` so the renderer knows which indicator to display.
- **TanStack Query:** Create a `useStockQuotes(tickers)` hook with `refetchInterval` set dynamically based on market status (60s regular, 300s extended, disabled when closed). Use `staleTime: 30_000` to prevent redundant fetches.
- **Renderer changes:** Add a `Price` column to `PositionRow` and the table header in `PositionsListPage`. The price data comes from the query, not from the IPC `listPositions` call (they're separate concerns — position data is DB, price data is live).
- **Market status indicator:** A small colored dot component: green = live, amber = extended/stale, gray = closed. Reuse across position cards and detail pages.
- **Preload:** Add `getStockQuotes` and `getMarketStatus` to the contextBridge API in `src/preload/index.ts`.

---

## Out of Scope

- Option prices and Greeks (US-33, US-34)
- Unrealized P&L calculation (US-33)
- Distance-to-strike gauge (already planned in US-22 from Epic 04)
- Price alerts or notifications
- Historical price charts

---

## Dependencies

- US-31 (MarketDataProvider interface and Alpaca implementation)

---

## Estimate

5 points

## Mockup

- `mockups/us-32-live-underlying-price.mdx`
