# Epic: Performance Analytics and Reporting

## Phase

Phase 5

## Goal

A trader can review their performance at the position level, portfolio level, and strategy level with clear visualizations of income, cost basis progression, capital efficiency, and win/loss patterns. Reports are exportable for tax preparation and external analysis.

## Success Criteria

- Per-position P&L waterfall chart shows how each leg progressively reduced cost basis
- Income dashboard shows monthly premium collected as bar chart, broken down by strategy type, ticker, and phase (CSP vs. CC premium)
- Running YTD premium total is prominently displayed
- Capital efficiency report shows: capital deployed, total premium, days active, and annualized return per position — sortable to find best and worst performers
- Win/loss analysis shows: win rate, average win, average loss, expected value — broken out by strategy type
- Strategy comparison view: Wheel vs. PMCC side-by-side on the same ticker showing income per dollar deployed
- CSV/Excel export of trade history, P&L reports, and income summaries for tax prep
- All analytics handle both open and closed positions

## Vertical Slice

| Layer    | What ships                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| API      | GET /api/analytics/income, GET /api/analytics/efficiency, GET /api/analytics/winloss, GET /api/analytics/comparison, GET /api/export/csv |
| Frontend | Income dashboard with charts, capital efficiency table, win/loss summary, strategy comparison, per-position waterfall, export buttons    |

## Stories

- [ ] US-77: Display per-position P&L waterfall showing cost basis reduction through each leg
- [ ] US-78: Show monthly income bar chart with breakdown by strategy, ticker, and leg type
- [ ] US-79: Display YTD premium total prominently on dashboard and analytics page
- [ ] US-80: Calculate and display capital efficiency per position (annualized return on deployed capital)
- [ ] US-81: Show win/loss analysis with win rate, average win/loss, and expected value
- [ ] US-82: Compare Wheel vs. PMCC performance side-by-side for shared tickers
- [ ] US-83: Export trade history as CSV with all leg details
- [ ] US-84: Export income and P&L reports as CSV for tax preparation
- [ ] US-85: Filter analytics by date range, ticker, strategy type, and phase

## Dependencies

- Epic 01-03: Complete wheel cycle data (need trade history to analyze)
- Epic 09: PMCC Strategy (for strategy comparison view)

## Strategy

Both

## Out of Scope

- Tax liability calculation (the app tracks data, not tax advice)
- Broker CSV import (separate future epic)
- Real-time portfolio Greeks aggregation (future)
- Scenario modeling / what-if analysis (future)
