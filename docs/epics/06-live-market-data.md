# Epic: Live Market Data and IVR Foundation

## Phase

Phase 2

## Goal

Position list updates with real-time prices, Greeks, and unrealized P&L via provider-agnostic adapter interfaces. **Market data** comes from Massive (formerly Polygon); **broker** data (account, activities) comes from Alpaca. The two concerns are isolated behind independent interfaces so either vendor can be swapped without touching the other. IVR is collected daily from Market Chameleon's public pages and made available through a query service so the Phase 3 candidate screener and Epic 12 display surfaces can consume it without duplicating scraping logic.

## Success Criteria

- Position list shows live underlying price and option mid-price during market hours (Massive)
- Unrealized P&L calculates in real-time based on current prices vs. entry prices
- Greeks (delta, theta, gamma, vega, IV) display on the position detail page for open option legs (Massive option snapshots)
- Account balances, buying power, and broker activities surface from Alpaca with paper / live toggle
- Massive and Alpaca credentials are configured independently — market data continues to work even with no broker connected
- IVR snapshots are collected daily after market close for every underlying with an active position (Market Chameleon free pages)
- Current IVR is queryable per ticker through `volatility-service` for Phase 3 screener consumption
- Polling adapts to market session: 60s regular hours, 5min extended hours, on-launch-only when closed
- All market data flows through `MarketDataProvider`; all broker calls flow through `BrokerProvider` — no direct Massive or Alpaca imports in services or UI

## Vertical Slice

| Layer       | What ships                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration | `MarketDataProvider` + `MassiveMarketDataProvider`; `BrokerProvider` + `AlpacaBrokerProvider`; `fetchMarketChameleonIVR` scraper module             |
| Database    | `ivr_snapshot` table + index                                                                                                                        |
| Main        | Polling scheduler, IVR collector, environment/credentials management for two vendors                                                                |
| IPC         | market-data:stock-quotes, market-data:option-snapshots, broker:account, broker:activities, broker:market-status, volatility:get-ivr, settings:\*    |
| Renderer    | Live price + P&L on position rows, Greeks panel on detail page, two-vendor settings page with broker paper/live toggle and "NO BROKER" header state |

## Stories

### Foundation (no UI)

- [ ] **US-31 (rewrite):** Split `MarketDataProvider` and `BrokerProvider` interfaces
- [ ] **US-39:** Implement `MassiveMarketDataProvider` (REST quotes, option snapshots, option chains)
- [ ] **US-40:** Implement `AlpacaBrokerProvider` (account, activities, market status)

### Live Data Display

- [ ] US-32: Display live underlying price on position list with market status indicator
- [ ] US-33: Show current option mid-price and unrealized P&L for open legs
- [ ] US-34: Display Greeks on position detail page for open option legs

### IVR Foundation (new)

- [ ] **US-43:** Scrape current IV Rank from Market Chameleon for a single ticker
- [ ] **US-44:** Persist IVR snapshots and schedule daily collection
- [ ] **US-45:** Expose current IVR through a service + IPC for downstream consumers

### Background Infrastructure (new)

- [ ] **US-46:** Shared polling scheduler service (consumed by US-35 + US-44)

### Configuration

- [ ] **US-37 (revised):** Configure separate Massive (market data) and Alpaca (broker) credentials with a broker paper/live toggle
- [ ] US-38: Configure polling frequency for market hours, extended hours, and closed market

### Dependency Graph

```
US-31 (interfaces) ──┬── US-39 (Massive)  ── US-32 ── US-33 ── US-34
                     ├── US-40 (Alpaca broker)
                     └── US-37 (credentials + env toggle, requires both)

US-43 (MC scraper) ── US-44 (snapshot store) ── US-45 (query service)
                            │
                            └── US-46 (scheduler) ── runs US-44 collector + US-35 detector
                                  │
                                  └── US-40 (BrokerProvider.getMarketStatus for session awareness)
```

### Story Files

| Story     | File                                                              | Points |
| --------- | ----------------------------------------------------------------- | ------ |
| US-31     | `docs/epics/06-stories/US-31-market-data-provider-adapter.md`     | 3      |
| US-32     | `docs/epics/06-stories/US-32-live-underlying-price.md`            | 5      |
| US-33     | `docs/epics/06-stories/US-33-option-price-unrealized-pnl.md`      | 5      |
| US-34     | `docs/epics/06-stories/US-34-greeks-display.md`                   | 3      |
| US-37     | `docs/epics/06-stories/US-37-paper-live-environment-toggle.md`    | 8      |
| US-38     | `docs/epics/06-stories/US-38-polling-frequency-configuration.md`  | 5      |
| US-39     | `docs/epics/06-stories/US-39-massive-market-data-provider.md`     | 8      |
| US-40     | `docs/epics/06-stories/US-40-alpaca-broker-provider.md`           | 3      |
| US-43     | `docs/epics/06-stories/US-43-market-chameleon-ivr-scraper.md`     | 5      |
| US-44     | `docs/epics/06-stories/US-44-ivr-snapshot-store-and-scheduler.md` | 5      |
| US-45     | `docs/epics/06-stories/US-45-ivr-query-service-and-ipc.md`        | 3      |
| US-46     | `docs/epics/06-stories/US-46-polling-scheduler.md`                | 5      |
| **Total** |                                                                   | **58** |

## Dependencies

- Epic 01: Open and Track a CSP (positions to enrich, `assignCspPosition` service to reuse)
- Massive API key (free or paid tier — REST quote + option snapshot access required)
- Alpaca API credentials (paper account minimum) — only required for broker surfaces; market data works without it
- Market Chameleon public IVR pages — no authentication required
- `@alpacahq/typescript-sdk` already installed; `cheerio` to be added for MC scraping

## Strategy

Both

## Out of Scope

- Order placement (Epic 10)
- Option chain browsing for trade entry (Epic 10)
- Candidate screening (Epic 08 — consumes US-45 IVR service)
- WebSocket streaming for Massive (REST polling is sufficient for Phase 2; follow-up story)
- Tagging positions with the broker environment they were recorded under, plus "Paper position" chip on cards (follow-up story noted in US-37)
- Settings opt-out: "I execute trades outside Wheelbase — hide the broker badge" (follow-up story noted in US-37)
- Assignment detection by polling broker activities (was US-35/36 — removed from current Epic 06 scope; may return as follow-up under `BrokerProvider`)
- IVR display surfaces (badges, sparklines, alerts) — Epic 12, Phase 3
- IVR computation from raw IV time series — Market Chameleon publishes IVR directly, so Epic 12 stories US-86/US-87 will need revision
- Greeks-based alerts (Epic 08 — Alert Engine)

## Notes on Architectural Pivot

Epic 06 was originally written around Alpaca as the sole vendor (market data + broker). The pivot to Massive for market data split US-31 into two interfaces and introduced US-39 (Massive) and US-40 (Alpaca-broker) as the concrete implementations. US-35 and US-36 (assignment detection via Alpaca polling) were removed from current scope; if they return, they will live under `BrokerProvider`.

Market Chameleon scraping for IVR (US-43, US-44, US-45) landed in Phase 2 rather than Epic 12 because the Phase 3 candidate screener (Epic 08) depends on IVR being available at query time. Scraping public IVR values is simpler than the original Epic 12 plan of storing raw IV and computing IVR locally — Epic 12 will be revised to remove that computation.
