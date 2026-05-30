# US-40: Implement AlpacaBrokerProvider

**As a** trader using the app,
**I want** account info, broker activities, and market status sourced from Alpaca,
**So that** the app shows accurate buying power, can detect future broker-side events, and knows when the market is open.

---

## Context

With market data moved to Massive (US-39), Alpaca is retained for trading-side concerns: account balances, broker activity history (assignments, fills, dividends), and market status. This story extracts those responsibilities from the original Alpaca adapter into `AlpacaBrokerProvider`, the implementation of `BrokerProvider` (defined in US-31 rewrite).

Existing Alpaca credentials handling (paper/live env, key + secret) stays as-is and continues to be configured through `safeStorage`. Order execution methods are explicitly out of scope until Phase 4.

---

## Acceptance Criteria

```gherkin
Background:
  Given AlpacaBrokerProvider is defined in src/main/integrations/alpaca-broker.ts
  And it implements the BrokerProvider interface
  And Alpaca credentials (key, secret, environment) are stored in safeStorage

Scenario: getAccountInfo returns balances, environment, and masked account number
  Given valid paper credentials
  When the provider calls GET /v2/account
  Then it returns { buyingPower, portfolioValue, cash, environment: "paper", accountNumberMasked: "PA…ABC" }
  And all monetary fields are strings with 4 dp
  And accountNumberMasked is first 2 chars + "…" + last 3 chars of the account number

Scenario: getActivities returns OPASN activities filtered by date
  Given activity type "OPASN" and since "2026-04-20"
  When the provider calls GET /v2/account/activities/OPASN?date=2026-04-20
  Then it returns an array of { activityId, activityType: "OPASN", symbol, qty, price, transactionTime }
  And results are sorted by transactionTime descending

Scenario: getMarketStatus returns current session
  When the provider calls GET /v2/clock
  Then it returns { isOpen, nextOpen, nextClose, session: "regular" | "pre" | "post" | "closed" }
  And session is derived from clock.is_open and the current time vs. nextOpen/nextClose

Scenario: Missing Alpaca credentials surface typed error
  Given no Alpaca credentials in safeStorage
  When any provider method is called
  Then it throws BrokerAuthError with message "Alpaca credentials not configured"
  And the error includes a settings deeplink "settings/credentials/alpaca"

Scenario: Environment is sourced from stored credentials
  Given credentials stored with environment "live"
  When getAccountInfo is called
  Then the provider issues the request to api.alpaca.markets (not paper-api.alpaca.markets)
  And the returned environment field is "live"

Scenario: Credential environment mismatch is detectable
  Given a candidate keyId labeled as "paper" but matching a live account
  When the provider authenticates the call against paper-api.alpaca.markets
  Then the response surfaces an environment-mismatch error
  And the error type allows the settings UI (US-37) to display "Environment mismatch — these are LIVE keys, not paper keys"
```

---

## Technical Notes

- File: `src/main/integrations/alpaca-broker.ts`
- Old `src/main/integrations/alpaca.ts` becomes credential management only, or merges into the broker provider — implementer's choice during refactor.
- Keep using `@alpacahq/typescript-sdk` — no change to dependency.
- Polling cadence for `getActivities` is owned by services that consume the provider, not the provider itself.
- First-call activity ingestion should be bounded by the caller (US-37 test-connection does not import; first scheduled collection bounds to "since today" or earliest position created_at).

---

## Out of Scope

- Order placement / cancellation (Phase 4)
- Streaming account updates
- Assignment detection logic (would build on top of this; not currently in Epic 06 backlog)

---

## Dependencies

- US-31 (rewrite) — interface definition
- Existing Alpaca credential storage (already implemented)

---

## Estimate

3 points
