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

| Layer | What ships |
|---|---|
| Integration | alpaca.py: get_option_chain(), get_iv_rank(), get_earnings_calendar() |
| Core engine | screener.py: score and rank candidates against criteria |
| API | GET /api/watchlist, POST /api/watchlist, GET /api/screener/results |
| Frontend | Watchlist manager, screener results table with ranking, filter controls, promote-to-trade button |

## Stories

- [ ] US-50: Add and remove tickers from the watchlist
- [ ] US-51: Pull option chains from Alpaca for watchlist tickers
- [ ] US-52: Score wheel candidates against configurable screening criteria
- [ ] US-53: Display ranked screener results with key metrics (delta, premium yield, IV rank, OI, spread)
- [ ] US-54: Configure screening defaults (delta range, DTE window, premium yield floor, earnings exclusion)
- [ ] US-55: Promote a screener result to the new wheel form with pre-filled fields
- [ ] US-56: Store per-ticker notes on the watchlist (why it's being considered)
- [ ] US-57: Warn when a candidate has earnings within the DTE window

## Dependencies

- Epic 06: Live Market Data (Alpaca integration for option chains)
- Epic 01: Open and Track a CSP (trade entry form to promote into)

## Strategy

Classic Wheel (PMCC screening criteria ship with Epic 09)

## Out of Scope

- PMCC-specific screening criteria (Epic 09)
- AI-driven trade idea generation (future)
- Automated trade placement from screener (Epic 10)
