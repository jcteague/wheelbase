# Option Wheel Manager — Initial Feature Definition

*Based on research into CoveredWheel, WingmanTracker, TrackTheta, and the gaps they leave.*

---

## What the Existing Tools Taught Us

The landscape splits into two camps. **CoveredWheel** is free, simple, and wheel-specific — but limited in analytics. **WingmanTracker** is the most polished paid option, with automatic trade grouping and roll tracking. **TrackTheta** sits in between. The consistent pain points users report across all of them are: cost basis tracking through multiple rolls/assignments, understanding *cumulative* P&L per wheel (not just per leg), and lack of actionable management signals. That's where your app has room to be genuinely better.

---

## Core Concept: The Wheel as a Unit

The most important architectural decision is treating **each wheel as a single entity with a lifecycle**, not as a series of disconnected option trades. Every feature flows from this.

```
CSP Opened → Expired / Closed → OR → Assigned (shares held)
                                           ↓
                                      CC Opened → Called Away / Closed → Repeat
```

Each wheel accumulates: total premium collected, current cost basis, net P&L, and days active. This is the number that actually matters.

---

## Feature Set — Organized by Priority

### Tier 1 — Core (Must Have)

**Position & Lifecycle Management**

Every wheel position needs to track: ticker, current phase (CSP / Holding Shares / CC / Closed), number of contracts, strike price, expiration date, premium collected or paid, open date, and a running cost basis that automatically adjusts when a new leg is added or a roll occurs. The app must support rolling (closing one leg and opening a replacement) while preserving the full history of that wheel and updating cumulative P&L correctly.

**Cost Basis Engine**

This is the single hardest thing to get right and where every spreadsheet falls apart. The engine needs to: start with the initial CSP strike as cost basis, subtract every premium collected, add back any debit paid on rolls, reset to the assignment price when stock is taken, then continue subtracting CC premiums. The displayed "effective cost basis" should always reflect what you'd need the stock to be at to break even on the entire wheel, not just the most recent leg.

**Dashboard / Portfolio View**

A single-screen summary showing all active wheels with: ticker, current phase, DTE (days to expiration), current underlying price vs. strike, premium collected this wheel cycle, total income YTD, and a visual indicator of how close each position is to being tested (e.g., underlying within 3% of a CSP strike).

**Manual Trade Entry**

Clean form for entering: open a new CSP, record assignment, open a CC, close/roll a position, record expiration. This should require minimal fields — the app should calculate and fill in what it can.

---

### Tier 2 — Performance Analytics

**Per-Wheel P&L History**

A drill-down view for any ticker showing every leg ever traded on that wheel — dates, strikes, premiums, outcomes — with the cumulative income and effective cost basis plotted over time.

**Portfolio-Level Income Reporting**

Total premium collected broken down by: this week / this month / YTD / all time. Average income per day (annualized). Win rate (positions closed at max profit or expired worthless vs. closed at a loss or assigned). Income by underlying — so you can see which tickers are actually generating returns.

**Capital Efficiency**

How much buying power / cash is deployed vs. idle. Return on capital per wheel (annualized). Comparison of wheels by efficiency so you can make allocation decisions.

---

### Tier 3 — Active Management Tools

**Expiration Calendar**

A calendar or timeline view showing every position's expiration date, color-coded by phase. Positions expiring within 7 days should be prominently flagged. This prevents the classic mistake of forgetting a position into expiration without a plan.

**Management Alerts**

Configurable thresholds that trigger a notification (in-app, email, or push): position has reached X% of max profit (typical rule: close at 50%), DTE is below a threshold (e.g., 21 DTE for early management), underlying has moved more than Y% against the position, earnings date is approaching for a held position.

**Roll Tracking**

When a position is rolled, the app should: close the old leg at market, open the new leg, carry forward all cumulative P&L, and show the net debit/credit of the roll. Rolling forward in time vs. rolling to a different strike should both be supported.

**Notes & Thesis Log**

Per-wheel free-text field for recording your original thesis, any changes to plan, and management decisions. This is invaluable for reviewing what worked and what didn't.

---

### Tier 4 — Data & Integrations

**Live Price Data**

Integration with a market data source (Alpaca, Tradier, or Yahoo Finance as a fallback) to show current underlying price, option mid-price for open positions, and unrealized P&L in real time.

**Broker Import**

CSV import from major brokers (Schwab, TD/Ameritrade, Tastytrade, Robinhood, IBKR) so trades don't need to be re-entered manually. The import should be smart enough to recognize legs that belong to the same wheel and group them automatically.

**Broker API Sync** *(Advanced)*

Direct API connection (Alpaca first, as it's the most accessible) to auto-populate positions and trades without any manual entry.

**Export**

CSV/Excel export of trade history and P&L reports for tax prep or external analysis.

---

### Tier 5 — Nice to Have / Differentiators

**Watchlist / Candidates**

A separate list of tickers you're considering for future wheels, with IV rank, current price, and a note on why it's on the radar. This keeps your hunting list separate from your active positions.

**IV & Greeks Display**

For open options positions: current IV, delta, theta, and days of theta decay collected to date. Useful for deciding whether to roll or hold.

**Trade Idea Generator** *(AI-assisted)*

Given a ticker you're considering, suggest an appropriate CSP strike and expiration based on current IV, delta target (e.g., 0.30 delta), and your preferred return target. This goes beyond what any current free tool offers.

**Multi-Account Support**

Track positions across multiple brokerage accounts, with portfolio view filterable by account or aggregated.

**Scenario Modeling**

"What if" analysis — if I get assigned on this CSP, what CC strike do I need to sell to recover my cost basis within N weeks?

---

## Gaps vs. Existing Tools — Your Differentiation Opportunities

| Gap in existing tools | How your app addresses it |
|---|---|
| Cost basis resets on assignment, losing wheel history | Continuous cost basis across the full wheel lifecycle |
| No signal for *when* to manage | Configurable alerts at 21 DTE, 50% profit, etc. |
| Trade journal is disconnected from P&L | Notes live inside the wheel, tied to performance |
| No candidate / watchlist pipeline | Integrated watchlist with IV rank |
| Hard to see capital efficiency | Annualized return per wheel, deployed vs. idle capital |
| No scenario modeling for rolls | What-if calculator built in |

---

## Suggested Build Order

The most logical sequence would be: core data model and lifecycle management first (the wheel entity and cost basis engine) → then the dashboard and manual entry → then the analytics views → then live data and alerts → then integrations. Getting the data model right in phase 1 is critical, because every other feature builds on it. If the wheel entity doesn't correctly accumulate cost basis across assignments and rolls from the start, retrofitting it later is painful.
