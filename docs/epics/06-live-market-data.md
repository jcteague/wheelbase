# Epic: Live Market Data and Assignment Detection

## Phase

Phase 2

## Goal

Position list updates with real-time prices, Greeks, and unrealized P&L via a provider-agnostic market data interface (adapter pattern). The app automatically detects assignments by polling broker activity, eliminating the need for the trader to manually record every event. Alpaca is the first data provider, but the architecture supports swapping or adding providers without modifying services, IPC handlers, or UI code.

## Success Criteria

- Position list shows live underlying price and option mid-price during market hours
- Unrealized P&L calculates in real-time based on current prices vs. entry prices
- Greeks (delta, theta, gamma, vega, IV) display on the position detail page for open option legs
- Background polling detects assignment events and surfaces them for trader confirmation
- Confirmed assignment auto-transitions the position to HOLDING_SHARES with notification
- Paper vs. live environment toggle is clearly visible and prevents accidental cross-environment actions
- Polling adapts to market session: 60s regular hours, 5min extended hours, on-launch-only when closed
- All market data flows through a `MarketDataProvider` interface — no direct Alpaca imports in services or UI

## Vertical Slice

| Layer       | What ships                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Integration | `MarketDataProvider` interface + `AlpacaMarketDataProvider`: getStockQuotes, getOptionSnapshots, getActivities       |
| Main        | Polling scheduler, assignment detection service, environment/credentials management                                  |
| IPC         | market-data:stock-quotes, market-data:option-snapshots, market-data:market-status, assignments:\*, settings:\*       |
| Renderer    | Live price + P&L on position rows, Greeks panel on detail page, assignment notification banner, environment switcher |

## Stories

### Foundation (no UI)

- [ ] US-31: Define MarketDataProvider adapter interface with Alpaca implementation

### Live Data Display

- [ ] US-32: Display live underlying price on position list with market status indicator
- [ ] US-33: Show current option mid-price and unrealized P&L for open legs
- [ ] US-34: Display Greeks on position detail page for open option legs

### Assignment Automation

- [ ] US-35: Poll broker activities to detect option assignment events
- [ ] US-36: Auto-transition position to HOLDING_SHARES on detected assignment with notification

### Configuration

- [ ] US-37: Toggle between paper and live broker environments with clear visual indicator
- [ ] US-38: Configure polling frequency for market hours, extended hours, and closed market

### Dependency Graph

```
US-31 (adapter) ──┬── US-32 (stock price) ── US-33 (option price + P&L) ── US-34 (Greeks)
                  ├── US-37 (environment) ── US-38 (polling) ── US-35 (detection) ── US-36 (notification)
                  └── US-37 (environment)
```

### Story Files

| Story     | File                                                                     | Points |
| --------- | ------------------------------------------------------------------------ | ------ |
| US-31     | `docs/epics/06-stories/US-31-market-data-provider-adapter.md`            | 5      |
| US-32     | `docs/epics/06-stories/US-32-live-underlying-price.md`                   | 5      |
| US-33     | `docs/epics/06-stories/US-33-option-price-unrealized-pnl.md`             | 5      |
| US-34     | `docs/epics/06-stories/US-34-greeks-display.md`                          | 3      |
| US-35     | `docs/epics/06-stories/US-35-assignment-detection-polling.md`            | 5      |
| US-36     | `docs/epics/06-stories/US-36-auto-transition-assignment-notification.md` | 5      |
| US-37     | `docs/epics/06-stories/US-37-paper-live-environment-toggle.md`           | 5      |
| US-38     | `docs/epics/06-stories/US-38-polling-frequency-configuration.md`         | 5      |
| **Total** |                                                                          | **38** |

## Dependencies

- Epic 01: Open and Track a CSP (positions to enrich, `assignCspPosition` service to reuse)
- Alpaca API credentials configured (paper account minimum)
- `@alpacahq/typescript-sdk` already installed

## Strategy

Both

## Out of Scope

- Order placement (Epic 10)
- Option chain browsing for trade entry (Epic 10)
- Candidate screening (Epic 08)
- WebSocket streaming (polling is sufficient for Phase 2)
- IV rank / IV percentile — see Epic 12 (Volatility Analytics and IV-Aware Management) for snapshot store, IVR/IVP computation, and consumption surfaces
- Greeks-based alerts (Epic 08 — Alert Engine)
