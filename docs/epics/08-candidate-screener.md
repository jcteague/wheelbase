# Epic: Candidate Screener and Watchlist

## Phase

Phase 3

## Goal

A trader can maintain a watchlist of tickers they're evaluating, screen them against configurable criteria (IV rank, delta, DTE, premium yield, liquidity), and promote a screened candidate directly into the trade entry form with fields pre-filled.

## Success Criteria

- Trader manages a watchlist of tickers under consideration for new wheels
- Screener pulls option chains from Alpaca for each watchlist ticker and evaluates candidates
- Screening criteria are configurable: delta range, DTE window, minimum premium yield, minimum open interest, IV rank range, earnings proximity exclusion, price ceiling
- Results display as a ranked table sorted by risk-adjusted premium yield
- Each result shows: ticker, recommended strike, expiration, premium, delta, IV rank, open interest, bid-ask spread
- One-click promotion from screener result to the new wheel form with fields pre-filled
- Screener distinguishes wheel candidates from PMCC candidates (different criteria sets)

## Vertical Slice

| Layer       | What ships                                                                                                                                                                                                  |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration | Massive adapter: option-chain snapshots (bid/ask/mark, Greeks, OI/volume) via `MarketDataProvider` (US-39); IV rank from the volatility service (US-45); earnings dates from a separate calendar dependency |
| Core engine | `src/main/core/screener.ts`: score and rank candidates against criteria (pure, no I/O)                                                                                                                      |
| IPC         | `watchlist:list/add/remove/update`, `screener:results`                                                                                                                                                      |
| Frontend    | Watchlist manager, screener results table with ranking, criteria settings, promote-to-trade button                                                                                                          |

## Stories

> Story numbers were shifted from US-50–57 to US-63–70 to avoid a collision with Epic 07 (Management Alerts), which consumed US-50–62.

- [ ] US-63: Create and remove watchlist entries (ticker + optional thesis + entry conditions)
- [ ] US-64: Pull option chains from Massive for watchlist tickers
- [ ] US-65: Score wheel candidates against configurable screening criteria
- [ ] US-66: Display ranked screener results with key metrics (delta, premium yield, IV rank, OI, spread)
- [ ] US-67: Configure screening defaults (delta band, DTE window, liquidity gates, price ceiling, earnings handling)
- [ ] US-68: Promote a screener result to the new wheel form with pre-filled fields
- [ ] US-69: Edit a watchlist entry (thesis + entry conditions in the shared form)
- [ ] US-70: Warn when a candidate has earnings within the DTE window
- [ ] US-96: View the watchlist with live prices, IV-rank, earnings, and a Signal verdict

> The watchlist stories are organized by action on an **entry** (ticker + thesis + conditions): create/remove (US-63), edit (US-69), view with live data + Signal (US-96); promote happens downstream from a screener result (US-68). US-96 is numbered out of epic sequence (71–95 were claimed by Epics 09–12); it was split out after the shared watchlist mockup outgrew US-63's scope.

## Dependencies

- Epic 06: Live Market Data (Massive provider adapter for option chains — US-39; IVR service — US-45)
- Epic 12: Volatility Analytics (IVR/IVP data feed — Alpaca does not provide historical IV; the screener's IV rank column and filter consume the volatility service rather than computing rank inline)
- Epic 01: Open and Track a CSP (trade entry form to promote into)
- **External (unowned):** an earnings-calendar data source for US-70 — Massive supplies chains/quotes only, not earnings dates. Needs an owner before US-70 can ship.

## Strategy

Classic Wheel (PMCC screening criteria ship with Epic 09)

## Out of Scope

- PMCC-specific screening criteria (Epic 09)
- AI-driven trade idea generation (future)
- Automated trade placement from screener (Epic 10)
