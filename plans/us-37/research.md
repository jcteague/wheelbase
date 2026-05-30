## Existing Provider Split

- **Decision:** Build US-37 on the existing `MarketDataProvider` / `BrokerProvider` split from US-39 and US-40, keeping Massive as shared app-level configuration while moving Alpaca credentials into persisted user settings.
- **Rationale:** `src/main/integrations/market-data-factory.ts` currently creates `MassiveMarketDataProvider` from `MASSIVE_API_KEY`, while `src/main/integrations/broker-factory.ts` creates `AlpacaBrokerProvider` from Alpaca credentials. Product clarification: Massive credentials are the same for all users and should not be stored or managed in user settings. Alpaca paper/live credentials remain user-specific.
- **Alternatives considered:** Store Massive credentials per user as originally drafted in US-37. Rejected because the Massive key is shared across users.

## Credential Storage

- **Decision:** Add a SQLite-backed credential/settings store for Alpaca credentials only; store encrypted strings produced by Electron `safeStorage.encryptString`, never plaintext.
- **Rationale:** Alpaca paper/live credentials are user-specific and must persist across launches. Massive is shared app configuration and should continue to load from app configuration/env/packaging, not user settings.
- **Alternatives considered:** Store Alpaca credentials in environment variables or localStorage. Rejected because env vars cannot be updated from settings, and renderer storage would expose secrets outside the main-process boundary.

## Runtime Provider Reinitialization

- **Decision:** Add explicit runtime recreate methods for broker state; leave Massive provider lifecycle tied to app-level configuration unless a mid-session auth failure degrades market-data status.
- **Rationale:** `src/main/index.ts` currently registers IPC with provider instances created at startup. US-37 now requires Alpaca credential changes and broker environment switches to affect only broker reads. Massive is not changed from settings.
- **Alternatives considered:** Restart the Electron app after saving credentials. Rejected because acceptance criteria require in-flight market data to continue on broker switches and immediate UI updates.

## Connection Tests

- **Decision:** Implement settings-specific probe helpers instead of overloading regular provider methods: Massive probes `GET /v3/reference/tickers/AAPL` with the shared configured app key, while Alpaca probes `GET /v2/account` for the requested environment and returns the masked account number.
- **Rationale:** The Massive reference probe is deterministic and does not depend on user-entered tickers or user-managed credentials. Alpaca test connection must not import activities and should surface environment-specific account identity.
- **Alternatives considered:** Reuse stock quote or account hook calls. Rejected because quote calls use different Massive endpoints and normal broker account calls use the active environment, not the candidate card being tested.

## Query Invalidation

- **Decision:** Normalize renderer query keys to vendor prefixes: broker keys start with `'broker'`, market data keys start with `'market'`; settings mutations invalidate by predicate on `queryKey[0]`.
- **Rationale:** Current keys include `['broker', 'market-status']` and `['market-data', ...]`, with `marketStatus` oddly exported from `marketDataQueryKeys`. US-37 needs clear scoped invalidation: broker switch invalidates broker only and never market data.
- **Alternatives considered:** Invalidate all queries after settings changes. Rejected because the story explicitly says market data requests continue uninterrupted on broker environment switch.

## Settings UI Shape

- **Decision:** Implement the settings page from `mockups/us-37-credentials-and-broker-environment.mdx`, revised so `MassiveSection` is status/test only, while `BrokerSection` keeps paired credential cards, `EnvironmentSegmented`, `BrokerBadge`, `MassiveDot`, onboarding banner, and LIVE confirmation dialog.
- **Rationale:** The mockup directly captures the revised story's vendor separation and the intentionally louder PAPER badge. Renderer implementation should translate the mockup into Tailwind and `wb-*` tokens rather than inline color styles.
- **Alternatives considered:** Use a generic settings form. Rejected because the acceptance criteria require specific status visibility, warning hierarchy, and confirmation copy.

## Open Position Warning

- **Decision:** Use existing position list data to count open positions for the LIVE confirmation warning.
- **Rationale:** `src/main/services/list-positions.ts` already returns position status. The warning needs only a count of open positions, not broker reconciliation or env tagging.
- **Alternatives considered:** Add a new SQL count endpoint. Acceptable as an optimization, but not necessary for the first implementation unless renderer performance or test setup becomes awkward.
