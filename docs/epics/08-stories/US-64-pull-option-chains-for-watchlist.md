# US-64: Pull option chains from Massive for watchlist tickers

**As a** wheel trader with a curated watchlist,
**I want** the screener to pull live put option chains for each watchlist ticker,
**So that** candidate strikes carry current marks, Greeks, and liquidity data to screen against.

---

## Context

Screening needs raw material: for each watchlist ticker the screener fetches the put side of the option chain within the configured DTE window, capturing per-strike bid/ask, mark, delta, open interest, and volume. This data comes from the **Massive** market-data provider through the `MarketDataProvider` adapter (US-39) — chains and quotes only. IV rank is **not** part of the chain and is fetched separately from the volatility service (US-45); earnings dates come from a separate calendar dependency. This is a batch job over the watchlist, so it must isolate per-ticker failures and degrade a provider outage to an explicit "unavailable" state rather than a misleading empty result.

---

## Acceptance Criteria

```gherkin
Background:
  Given the watchlist contains AAPL, MSFT, and XYZ
  And screening criteria default to a 30–45 DTE window

Scenario: Pull put chains for each watchlist ticker
  Given Massive returns put chains for AAPL and MSFT
  When the screener refreshes candidate data
  Then each AAPL and MSFT put strike within 30–45 DTE carries bid, ask, mark, delta, open interest, and volume
  And mark is computed as (bid + ask) / 2 with HALF_UP rounding to 2 dp
  And each strike carries the quote timestamp from Massive

Scenario: A single ticker failing does not suppress the others
  Given Massive returns a chain for AAPL and MSFT
  And Massive returns a 404 for XYZ
  When the screener refreshes candidate data
  Then AAPL and MSFT candidates are still produced
  And XYZ is marked "data unavailable"
  And the engine logs the XYZ failure at debug level

Scenario: Whole-provider outage is distinguished from zero results
  Given Massive is unreachable for all tickers
  When the screener refreshes candidate data
  Then the screener reports "market data unavailable"
  And it does not report "no candidates found"

Scenario: A ticker with no listed options is skipped, not failed
  Given XYZ has no options listed on Massive
  When the screener refreshes candidate data
  Then XYZ is marked "no options listed"
  And it remains on the watchlist

Scenario: Zero-bid and one-sided strikes are dropped
  Given an AAPL put strike returns bid 0.00 and ask 0.15
  When the screener refreshes candidate data
  Then that strike is excluded because no reliable mark can be computed
```

---

## Technical Notes

- Source chains through the `MarketDataProvider` adapter (Massive, US-39). Do **not** call the Massive SDK from the screener; go through the adapter so a provider swap doesn't touch screener code.
- Only the **put** side is needed for CSP screening; fetch strikes within the configured DTE window (US-67 criteria; default 30–45).
- Follow the failure-isolation rule (see the alert-evaluation-failure-isolation ADR): evaluate each ticker in its own `try/catch`; boundary I/O degrades to empty + log; one bad ticker or provider outage never suppresses the rest.
- Distinguish three no-result states explicitly so the UI (US-66) can render them differently: `provider_unavailable`, `no_options_listed`, and per-ticker `data_unavailable`.
- IV rank (US-45) and earnings dates are fetched by their own services and joined in during scoring (US-65) — this story only fetches the chain.

---

## Out of Scope

- Scoring or ranking candidates (US-65)
- IV rank and earnings joins (US-65 consumes those services)
- Call-side chains / PMCC screening (Epic 09)
- WebSocket streaming; this is an on-demand/polled fetch

---

## Dependencies

- US-63: watchlist provides the ticker universe
- US-39: MassiveMarketDataProvider (chain snapshots, Greeks, OI/volume)

---

## Estimate

5 points

## Mockup

None — pulled chain data is surfaced in the US-66 ranked-results mockup.
