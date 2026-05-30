# US-39: Implement MassiveMarketDataProvider

**As a** trader using the app,
**I want** live stock and option quotes plus Greeks sourced from Massive's API,
**So that** the position list, P&L, and Greeks panels reflect current market data.

---

## Context

Massive (formerly Polygon) provides REST endpoints for stock quotes, option contract snapshots, and option chain snapshots — the per-contract snapshot returns Greeks (`delta`, `gamma`, `theta`, `vega`) and `implied_volatility`. Massive also offers WebSocket streaming for stock and option quotes. This story implements `MarketDataProvider` (from US-31) backed by Massive.

Authentication: API key from the Massive dashboard, passed either via `?apiKey=…` query string or `Authorization` header. Store the key in OS keychain via Electron `safeStorage`; never log it.

Greeks may be absent in the chain snapshot response for deep ITM contracts. The implementation must surface `greeks` and `impliedVolatility` as optional fields rather than fabricating zeros.

---

## Acceptance Criteria

```gherkin
Background:
  Given MassiveMarketDataProvider is defined in src/main/integrations/massive-market-data.ts
  And it implements the MarketDataProvider interface

Scenario: getStockQuotes returns NBBO for each ticker
  Given an API key stored in safeStorage
  And tickers ["AAPL", "MSFT"]
  When the provider calls GET /v3/quotes/{ticker}/last for each ticker
  Then it returns a map { AAPL: { price, bid, ask, timestamp }, MSFT: { ... } }
  And mid price is (bid + ask) / 2 with HALF_UP rounding to 2 dp

Scenario: getOptionSnapshot returns full snapshot including Greeks when present
  Given an option contract "AAPL250620C00200000" on underlying "AAPL"
  When the provider calls GET /v3/snapshot/options/AAPL/AAPL250620C00200000
  And the response includes greeks and implied_volatility
  Then the provider returns { bid, ask, mid, lastTrade, openInterest, volume, greeks: { delta, gamma, theta, vega }, impliedVolatility, timestamp }

Scenario: getOptionSnapshot omits Greeks when absent
  Given a deep ITM option contract
  When the provider calls the snapshot endpoint
  And the response omits the greeks field
  Then the provider returns the snapshot with greeks undefined and impliedVolatility undefined
  And no zeros or placeholder values are fabricated

Scenario: getOptionChainSnapshot filters by strike, expiration, and contract type
  Given an underlying "SPY", expirationFrom "2026-06-01", expirationTo "2026-07-01", type "put"
  When the provider calls GET /v3/snapshot/options/SPY with query params expiration_date.gte, expiration_date.lte, contract_type=put, limit=250
  Then it returns the first page of matching contracts
  And follows next_url for additional pages until exhausted or until a caller-supplied page limit is reached

Scenario: API key is loaded once per process and reused
  When the provider is instantiated
  Then it reads the API key from safeStorage once
  And subsequent requests reuse the cached key without re-reading storage

Scenario: Missing API key surfaces a typed error
  Given no API key is stored in safeStorage
  When any provider method is called
  Then it throws MarketDataAuthError with message "Massive API key not configured"
  And the error includes a settings deeplink "settings/credentials/massive"

Scenario: Massive 429 rate limit response is retried with backoff
  Given the API responds with HTTP 429
  When the provider receives the response
  Then it waits the duration in Retry-After (or 1s default)
  And retries up to 2 additional times before throwing MarketDataRateLimitError

Scenario: Massive 401/403 surfaces auth error
  When the API responds with HTTP 401 or 403
  Then the provider throws MarketDataAuthError with the response body included

Scenario: supportsStreaming declares streamable feeds
  When supportsStreaming("stockQuotes") is called
  Then it returns true
  When supportsStreaming("optionQuotes") is called
  Then it returns true
  When supportsStreaming("activities") is called
  Then it returns false (activities are on the BrokerProvider, not this interface)
```

---

## Technical Notes

- File: `src/main/integrations/massive-market-data.ts`
- Use platform `fetch`; the official Massive SDK is not yet confirmed for Node — story does not depend on it.
- WebSocket streaming is **out of scope for this story**; implement REST-only first, with `supportsStreaming` returning true so a follow-on story wires the actual subscription. Polling consumers work today; streaming is an optimization.
- Base URL: `https://api.massive.com` (verify against Massive quickstart).
- Auth header form: `Authorization: Bearer YOUR_API_KEY` preferred over query string to keep keys out of logs.
- Greeks-may-be-missing: applies primarily to chain snapshot for deep ITM; the single-contract snapshot endpoint typically includes Greeks but story still treats them as optional.

---

## Out of Scope

- WebSocket streaming subscription (follow-up story).
- Historical aggregates / OHLC.
- Multi-region failover.

---

## Dependencies

- US-31 (rewrite) — interface definition

---

## Estimate

8 points
