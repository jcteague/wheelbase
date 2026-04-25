# US-31: Define MarketDataProvider adapter interface with Alpaca implementation

**As a** developer building a trading management app that may integrate with multiple brokers,
**I want to** consume live market data through a provider-agnostic interface that supports both streaming and request/response access,
**So that** I can swap or add data providers in the future without modifying services, IPC handlers, or UI code.

---

## Context

Epic 06 introduces live market data — prices, Greeks, and broker activity detection. All downstream stories (US-32 through US-38) depend on a clean integration layer. Today `src/main/integrations/alpaca.ts` contains only a lazy client factory. This story replaces that with a typed `MarketDataProvider` interface and an `AlpacaMarketDataProvider` that implements it. Every service that needs live data will depend on the interface, never on Alpaca directly. This is the foundation — no UI ships in this story.

The interface is designed around a **capability-based pattern**: providers declare which data feeds they can stream in real time via `supportsStreaming(feed)`. Consumers check the capability and either subscribe for push updates or fall back to request/response polling. This keeps consuming code provider-agnostic — it reacts to data updates regardless of the delivery mechanism.

Alpaca supports WebSocket streaming for stock quotes (JSON format) and option quotes/trades (MessagePack format via a separate endpoint). Broker activities and market status remain request/response only.

---

## Acceptance Criteria

```gherkin
Background:
  Given the MarketDataProvider interface is defined in src/main/integrations/market-data-provider.ts
  And AlpacaMarketDataProvider implements the interface in src/main/integrations/alpaca-market-data.ts

Scenario: Interface exposes stock quote retrieval
  Given a list of ticker symbols ["AAPL", "MSFT", "TSLA"]
  When a consumer calls getStockQuotes(tickers)
  Then the provider returns a map of ticker → { price, change, changePercent, volume, timestamp }
  And each price is a string with 2 decimal places

Scenario: Interface exposes option snapshot retrieval
  Given an option contract identifier (OCC symbol or equivalent)
  When a consumer calls getOptionSnapshots(contractIds)
  Then the provider returns a map of contractId → { bid, ask, mid, lastTrade, openInterest, volume, greeks: { delta, gamma, theta, vega, iv }, timestamp }
  And the mid price equals (bid + ask) / 2

Scenario: Interface exposes broker activity polling
  Given an activity type filter "OPASN" and a sinceDate of "2026-04-20"
  When a consumer calls getActivities({ type: "OPASN", since: sinceDate })
  Then the provider returns an array of { activityId, activityType, symbol, qty, price, transactionTime }
  And results are sorted by transactionTime descending

Scenario: Interface exposes account info retrieval
  When a consumer calls getAccountInfo()
  Then the provider returns { buyingPower, portfolioValue, cash, environment }
  And environment is either "paper" or "live"

Scenario: Interface exposes market status check
  When a consumer calls getMarketStatus()
  Then the provider returns { isOpen, nextOpen, nextClose, session }
  And session is one of "regular", "pre", "post", or "closed"

Scenario: Provider declares streaming capabilities per feed
  When a consumer calls supportsStreaming("stockQuotes")
  Then the Alpaca provider returns true
  When a consumer calls supportsStreaming("optionQuotes")
  Then the Alpaca provider returns true
  When a consumer calls supportsStreaming("optionTrades")
  Then the Alpaca provider returns true

Scenario: Provider connects and streams stock quotes
  Given the provider's connect() method has been called
  When a consumer calls subscribe("stockQuotes", ["AAPL", "MSFT"], callback)
  Then the provider establishes a WebSocket connection to the stock data stream
  And pushes StockQuote events to the callback as they arrive
  And the subscription object includes an unsubscribe() method

Scenario: Provider streams option quotes via MessagePack
  Given the provider's connect() method has been called
  When a consumer calls subscribe("optionQuotes", ["AAPL260516P00180000"], callback)
  Then the provider establishes a WebSocket connection to the option data stream
  And decodes MessagePack-encoded messages into OptionSnapshot events
  And pushes them to the callback as they arrive

Scenario: Unsubscribe stops receiving events for those symbols
  Given the consumer is subscribed to stockQuotes for ["AAPL", "MSFT"]
  When the consumer calls subscription.unsubscribe()
  Then the callback no longer receives events for AAPL or MSFT
  And the WebSocket connection remains open for other active subscriptions

Scenario: Disconnect closes all streams
  Given the provider has active stream connections
  When a consumer calls disconnect()
  Then all WebSocket connections are closed
  And all active subscriptions are invalidated

Scenario: Alpaca implementation connects using configured credentials
  Given ALPACA_KEY_ID and ALPACA_SECRET_KEY are set in environment variables
  And ALPACA_PAPER is "true"
  When AlpacaMarketDataProvider is instantiated
  Then it connects to the paper trading API endpoint
  And getAccountInfo() returns environment "paper"

Scenario: Provider returns structured error when credentials are invalid
  Given ALPACA_KEY_ID is set to an invalid value
  When a consumer calls getAccountInfo()
  Then the provider throws a MarketDataError with code "auth_failed"
  And the error message includes "authentication"

Scenario: Provider returns structured error when API is unreachable
  Given the Alpaca API is unreachable (network error)
  When a consumer calls getStockQuotes(["AAPL"])
  Then the provider throws a MarketDataError with code "network_error"
  And the error message includes context about the failed endpoint

Scenario: Provider emits error event when stream disconnects unexpectedly
  Given the consumer is subscribed to stockQuotes for ["AAPL"]
  When the WebSocket connection drops unexpectedly
  Then the provider emits a StreamError event with code "stream_disconnected"
  And the error includes the feed name and a reconnectable flag

Scenario: Provider handles unknown ticker gracefully
  Given ticker "ZZZZZ" does not exist
  When a consumer calls getStockQuotes(["AAPL", "ZZZZZ"])
  Then the result contains a quote for "AAPL"
  And "ZZZZZ" is absent from the result (not an error)

Scenario: Subscribe rejects unsupported feed
  Given a hypothetical provider that does not support streaming for "optionQuotes"
  When a consumer calls supportsStreaming("optionQuotes") and it returns false
  Then calling subscribe("optionQuotes", ...) throws a MarketDataError with code "streaming_unsupported"
```

---

## Technical Notes

- **New files:**
  - `src/main/integrations/market-data-provider.ts` — TypeScript interface + types:
    - `MarketDataProvider` — the main interface with request/response and streaming methods
    - `DataFeed` — union type: `'stockQuotes' | 'optionQuotes' | 'optionTrades'`
    - `StreamSubscription` — returned by `subscribe()`, includes `unsubscribe()` and metadata
    - `StreamEvent<T>` — pushed to callbacks: `{ feed, symbol, data: T, timestamp }`
    - `StreamError` — emitted on connection failures: `{ feed, code, message, reconnectable }`
    - Existing types: `StockQuote`, `OptionSnapshot`, `BrokerActivity`, `AccountInfo`, `MarketStatus`, `MarketDataError`
  - `src/main/integrations/alpaca-market-data.ts` — `AlpacaMarketDataProvider` implementing the interface:
    - Manages two WebSocket connections: stock stream (JSON) and option stream (MessagePack)
    - Stock stream: `wss://stream.data.alpaca.markets/v2/{feed}` (JSON)
    - Option stream: `wss://stream.data.alpaca.markets/v1beta1/{feed}` (MessagePack via `@msgpack/msgpack`)
    - Tracks active subscriptions per connection, multiplexes subscribe/unsubscribe messages
  - `src/main/integrations/market-data-factory.ts` — Factory function `createMarketDataProvider(config)`. Services import this, never the concrete class.
- **Retire `alpaca.ts`:** The existing `src/main/integrations/alpaca.ts` (lazy client factory) is replaced by the new adapter. Remove or mark deprecated.
- **Error type:** `MarketDataError` extends `Error` with a `code` field (`auth_failed`, `network_error`, `rate_limited`, `stream_disconnected`, `streaming_unsupported`, `subscription_failed`, `unknown`). Services pattern-match on the code.
- **New dependency:** `@msgpack/msgpack` for decoding Alpaca option stream messages.
- **Decimal handling:** All money values returned as strings (consistent with the app's `decimal.js` / TEXT convention). The adapter converts from Alpaca's number format.
- **No caching or reconnection logic in this story.** The adapter provides raw connect/disconnect/subscribe primitives. Reconnection and session management are the responsibility of the data orchestrator (US-38).
- **Tests:** Unit tests mock the WebSocket connections and `@alpacahq/typescript-sdk` client. Integration test with real paper credentials can be a separate optional test file (skipped in CI).

---

## Out of Scope

- UI display of any live data (US-32, US-33, US-34)
- Background polling scheduler or stream lifecycle management (US-38)
- Assignment detection logic (US-35)
- Paper/live toggle UI (US-37)
- Caching or rate-limiting layer
- Reconnection logic with backoff (US-38 manages reconnection)

---

## Dependencies

- Alpaca API credentials configured in `.env`
- `@alpacahq/typescript-sdk` already installed
- `@msgpack/msgpack` (new dependency)

---

## Estimate

8 points
