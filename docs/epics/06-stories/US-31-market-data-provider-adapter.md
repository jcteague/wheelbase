# US-31 (rewrite): Split MarketDataProvider from BrokerProvider interfaces

**As a** developer building a trading management app that uses different vendors for market data and broker operations,
**I want** market data access and broker/account access to live behind two independent adapter interfaces,
**So that** I can swap market data providers (Massive, IEX, Tastytrade) without touching broker code, and vice versa.

---

## Context

Epic 06 originally defined a single `MarketDataProvider` that mixed real-time quotes/Greeks with broker concerns (`getAccountInfo`, `getActivities`). With Massive selected for market data and Alpaca retained for trading/account operations, those two concerns now belong to different vendors and must not share an interface. A consumer that needs option Greeks should not depend on a broker; a consumer that needs buying power should not be tied to a quote vendor.

This story replaces the original US-31 interface definition. No implementations ship here — `MassiveMarketDataProvider` (US-39) and `AlpacaBrokerProvider` (US-40) implement the interfaces in follow-on stories. No UI ships.

---

## Acceptance Criteria

```gherkin
Background:
  Given MarketDataProvider is defined in src/main/integrations/market-data-provider.ts
  And BrokerProvider is defined in src/main/integrations/broker-provider.ts
  And neither interface imports the other

Scenario: MarketDataProvider exposes stock quote retrieval
  When a consumer calls getStockQuotes(["AAPL", "MSFT"])
  Then the provider returns a map of ticker → { price, bid, ask, timestamp }
  And each numeric field is a string with 2 decimal places

Scenario: MarketDataProvider exposes option contract snapshot
  Given an OCC option symbol "AAPL250620C00200000"
  When a consumer calls getOptionSnapshot(symbol)
  Then the provider returns { bid, ask, mid, lastTrade, openInterest, volume, greeks?: { delta, gamma, theta, vega }, impliedVolatility?, timestamp }
  And greeks and impliedVolatility are optional because some contracts (e.g. deep ITM) lack them

Scenario: MarketDataProvider exposes option chain snapshot with filters
  Given an underlying "SPY" with expiration window 2026-06-01..2026-07-01 and contract type "put"
  When a consumer calls getOptionChainSnapshot({ underlying, expirationFrom, expirationTo, type })
  Then the provider returns a paginated array of option contract snapshots matching the filter

Scenario: MarketDataProvider declares streaming capability
  When a consumer calls supportsStreaming("stockQuotes")
  Then it returns a boolean
  When a consumer calls supportsStreaming("optionQuotes")
  Then it returns a boolean

Scenario: BrokerProvider exposes account info
  When a consumer calls getAccountInfo()
  Then the provider returns { buyingPower, portfolioValue, cash, environment: "paper" | "live", accountNumberMasked }
  And accountNumberMasked is first 2 chars + "…" + last 3 chars

Scenario: BrokerProvider exposes broker activity polling
  Given an activity type "OPASN" and a sinceDate "2026-04-20"
  When a consumer calls getActivities({ type: "OPASN", since: sinceDate })
  Then the provider returns an array of { activityId, activityType, symbol, qty, price, transactionTime } sorted by transactionTime descending

Scenario: BrokerProvider exposes market status
  When a consumer calls getMarketStatus()
  Then it returns { isOpen, nextOpen, nextClose, session: "regular" | "pre" | "post" | "closed" }

Scenario: Interfaces remain independent
  Given a consumer that only needs option Greeks
  When the consumer imports MarketDataProvider
  Then it does not transitively import BrokerProvider or any broker SDK
```

---

## Technical Notes

- Files: `src/main/integrations/market-data-provider.ts`, `src/main/integrations/broker-provider.ts`
- `getMarketStatus` lives on `BrokerProvider` because Alpaca already exposes it and Massive's market-status endpoint is per-asset-class (less convenient). Revisit if Massive becomes the source of truth.
- All numeric financial fields are strings (4 dp) to match the existing `decimal.js` convention.
- `accountNumberMasked` enables environment confirmation in settings UI without leaking the full identifier.

---

## Out of Scope

- Concrete provider implementations (covered by US-39, US-40)
- Settings UI for selecting providers (US-37)
- Order execution interface (Phase 4)

---

## Dependencies

None — pure interface definitions.

---

## Estimate

3 points
