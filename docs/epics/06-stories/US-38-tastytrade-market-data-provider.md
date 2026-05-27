# US-38: Add Tastytrade Market Data Provider

**As a** trader using a Tastytrade brokerage account,
**I want to** configure Wheelbase to use Tastytrade instead of Alpaca as the market data and broker activity source,
**So that** I can track live prices, Greeks, and assignment events without needing a separate Alpaca account.

---

## Context

US-31 defined a `MarketDataProvider` interface explicitly designed to allow swapping or adding providers. This story delivers the second concrete implementation: `TastytradeMarketDataProvider`. It covers REST-based polling for stock quotes, option snapshots (including Greeks and open interest), account info, market status, and account activity (assignment detection). WebSocket streaming via Tastytrade's DXLink protocol is deferred to a follow-up story.

Tastytrade supports **standard OAuth 2.0 authorization code flow**. The user authenticates entirely through Tastytrade's own login page (`https://my.tastytrade.com/auth.html`) — the app never sees the user's password. The app receives a short-lived `access_token` (15 min) and a long-lived `refresh_token`. Only the `refresh_token` is persisted, using Electron's built-in `safeStorage` (OS keychain-backed). The `access_token` is held in memory and refreshed automatically before it expires.

For Electron (desktop, no embedded browser), the OAuth redirect is captured via a temporary localhost HTTP server spun up on a random port. The registered redirect URI in the Tastytrade developer console must include `http://localhost`.

Paper and live environments use entirely separate base URLs.

---

## Acceptance Criteria

```gherkin
Background:
  Given the MarketDataProvider interface is defined in src/main/integrations/market-data-provider.ts
  And TastytradeMarketDataProvider implements it in src/main/integrations/tastytrade-market-data.ts

Scenario: Provider selected via environment configuration
  Given MAIN_VITE_MARKET_DATA_PROVIDER is "tastytrade"
  And MAIN_VITE_TASTYTRADE_CLIENT_ID, MAIN_VITE_TASTYTRADE_CLIENT_SECRET,
      and MAIN_VITE_TASTYTRADE_ACCOUNT_NUMBER are set
  When the app starts and createMarketDataProvider is called
  Then a TastytradeMarketDataProvider is returned
  And no username or password is read from environment variables

Scenario: First-launch OAuth — no stored refresh-token
  Given no refresh-token is stored in safeStorage
  When connect() is called
  Then the provider starts a temporary localhost HTTP server to receive the OAuth callback
  And opens the system browser to https://my.tastytrade.com/auth.html with client_id, redirect_uri, scope, and state
  When the user authenticates in the browser and Tastytrade redirects back
  Then the provider exchanges the authorization code for access_token and refresh_token
  And stores only the refresh_token in electron.safeStorage
  And holds the access_token in memory
  And shuts down the temporary localhost server

Scenario: Subsequent-launch OAuth — valid refresh-token exists
  Given a valid refresh-token is stored in safeStorage
  When connect() is called
  Then the provider POSTs to /oauth/token with grant_type=refresh_token
  And silently obtains a new access_token without opening a browser

Scenario: Access-token auto-refreshed mid-session
  Given an active session where the access_token is about to expire (< 60s remaining)
  When any REST method is about to be called
  Then the provider first refreshes the access_token using the stored refresh_token
  And uses the new access_token for the request

Scenario: Refresh-token expired — re-run OAuth flow
  Given a stored refresh-token that the server rejects (401)
  When connect() is called and the silent refresh fails
  Then the stored refresh-token is cleared from safeStorage
  And the provider re-runs the full browser OAuth flow

Scenario: Stock quotes retrieved via REST
  Given a TastytradeMarketDataProvider with a valid access_token
  When getStockQuotes(["AAPL", "MSFT"]) is called
  Then the provider GETs /market-data/quotes?symbols[]=AAPL&symbols[]=MSFT
  And returns a Map of ticker → { price, bid, ask, change, changePercent, prevClose, volume, timestamp }
  And all price fields are strings with 2 decimal places

Scenario: Option snapshots with open interest and Greeks retrieved
  Given a TastytradeMarketDataProvider with a valid access_token
  And standard OCC symbols ["AAPL250516C00200000"]
  When getOptionSnapshots(contractIds) is called
  Then the symbols are translated to Tastytrade format (".AAPL250516C00200000")
  And the provider GETs /market-data/options/snapshots
  And returns bid, ask, mid, lastTrade, openInterest, volume, and greeks
  And openInterest is populated (not null) from the Tastytrade response

Scenario: Account info retrieved
  Given a TastytradeMarketDataProvider with a valid access_token
  When getAccountInfo() is called
  Then the provider GETs /customers/me/accounts and /accounts/{accountNumber}/balances
  And returns { buyingPower, portfolioValue, cash, environment }
  And environment is "paper" when paper: true, "live" when paper: false

Scenario: Market status retrieved
  Given a TastytradeMarketDataProvider with a valid access_token
  When getMarketStatus() is called
  Then the provider GETs /market-data/conditions
  And returns { isOpen, session, nextOpen, nextClose }

Scenario: Account activities polled for assignment detection
  Given a TastytradeMarketDataProvider with a valid access_token
  When getActivities({ type: "Receive Deliver" }) is called
  Then the provider GETs /accounts/{accountNumber}/transactions?transaction-type=Receive+Deliver
  And returns BrokerActivity[] sorted by transactionTime descending

Scenario: Auth error on OAuth flow rejection
  Given the user denies authorization in the browser
  When the callback returns an error parameter
  Then connect() throws a MarketDataError with code "auth_failed"

Scenario: Rate limit error thrown on 429
  Given the Tastytrade API returns 429 Too Many Requests
  When any provider method is called
  Then a MarketDataError with code "rate_limited" is thrown

Scenario: Network error thrown when API is unreachable
  Given the Tastytrade API is unreachable
  When any provider method is called
  Then a MarketDataError with code "network_error" is thrown

Scenario: Streaming is not supported (REST-only implementation)
  Given a TastytradeMarketDataProvider
  When supportsStreaming("stockQuotes") is called
  Then it returns false
  When stream("stockQuotes", [...]) is called
  Then it throws a MarketDataError with code "streaming_unsupported"

Scenario: OCC symbol translated to Tastytrade format
  Given standard OCC symbol "AAPL250516C00200000"
  Then toTastytradeSymbol("AAPL250516C00200000") returns ".AAPL250516C00200000"
  And fromTastytradeSymbol(".AAPL250516C00200000") returns "AAPL250516C00200000"

Scenario: Disconnect clears access-token and refresh-token
  Given the provider has an active session and a stored refresh-token
  When disconnect() is called
  Then the provider POSTs to revoke the token (if supported) or simply clears state
  And removes the refresh-token from safeStorage
  And clears the in-memory access_token
```

---

## Technical Notes

- **New files:**
  - `src/main/integrations/tastytrade-symbols.ts` — `toTastytradeSymbol` / `fromTastytradeSymbol`
  - `src/main/integrations/tastytrade-oauth.ts` — OAuth 2.0 authorization code flow for Electron: PKCE generation, localhost callback server, code exchange, token refresh, `electron.safeStorage` persistence
  - `src/main/integrations/tastytrade-market-data.ts` — `TastytradeMarketDataProvider` implementing `MarketDataProvider`
  - `src/main/integrations/tastytrade-market-data.e2e.test.ts` — optional integration test (skipped unless `TASTYTRADE_E2E=true`)

- **Modified files:**
  - `src/main/integrations/market-data-factory.ts` — add `tastytrade` case; `MarketDataConfig` becomes a discriminated union
  - `src/main/env.d.ts` — add `MAIN_VITE_MARKET_DATA_PROVIDER`, `MAIN_VITE_TASTYTRADE_CLIENT_ID`, `MAIN_VITE_TASTYTRADE_CLIENT_SECRET`, `MAIN_VITE_TASTYTRADE_ACCOUNT_NUMBER`, `MAIN_VITE_TASTYTRADE_PAPER`
  - `src/main/index.ts` — update `marketDataConfigFromEnv()` to branch on provider

- **OAuth 2.0 endpoints:**
  - Authorization: `https://my.tastytrade.com/auth.html`
  - Token: `https://api.tastyworks.com/oauth/token`

- **Electron redirect URI strategy:** Spin up a Node `http.createServer` on a random port before opening the browser. The registered callback is `http://localhost:{port}/callback`. The server receives the `code` and `state` parameters, resolves a Promise, and immediately shuts down.

- **PKCE:** Generate `code_verifier` (random 43–128 char base64url string) and `code_challenge` (`SHA-256(code_verifier)` base64url-encoded) for each auth flow. Include `code_challenge_method=S256` in the authorization URL.

- **State parameter:** Generate a random state string per flow; verify it matches on callback to prevent CSRF.

- **Token storage:** `electron.safeStorage.encryptString(refreshToken)` → write to `app.getPath('userData')/tastytrade-token`. On startup: read + `decryptString`. No password is ever stored anywhere.

- **Access token lifecycle:** Store `{ accessToken, expiresAt }` in memory. Before each request, if `Date.now() > expiresAt - 60000`, refresh first. `expiresAt = Date.now() + (expires_in * 1000)` from the token response (`expires_in` is 900 seconds / 15 min).

- **API base URLs:**
  - Live: `https://api.tastyworks.com`
  - Paper/cert: `https://api.cert.tastyworks.com`

- **Open interest:** Tastytrade includes `open-interest` in option snapshots. Map to `OptionSnapshot.openInterest` (non-null).

- **Error mapping:** 401/403 → `auth_failed`, 429 → `rate_limited`, network errors → `network_error`, else → `unknown`.

- **No new npm dependencies:** `crypto` (built-in Node) for PKCE; `http` (built-in Node) for localhost callback server; `electron.safeStorage` (built-in Electron).

---

## Out of Scope

- DXLink WebSocket streaming (follow-up story)
- Multiple Tastytrade account selection UI — single `accountNumber` in `.env`
- Rate limiting / request throttling beyond error mapping
- Token revocation endpoint (disconnect simply clears local state)
- Biometric or multi-factor authentication

---

## Prerequisites

- Developer must register an OAuth application at the Tastytrade developer console and obtain `client_id` + `client_secret`. Redirect URI `http://localhost` (wildcard port) must be allowed.
- US-31 complete: `MarketDataProvider` interface defined

---

## Dependencies

- Electron `safeStorage` API (built-in)
- Built-in Node modules: `crypto`, `http`
- No new npm dependencies

---

## Estimate

8 points
