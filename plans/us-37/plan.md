# Implementation Plan: US-37 — Paper/Live Broker Environment Toggle

## Summary

Build a settings workflow that stores Alpaca paper/live credentials, lets the trader switch the active Alpaca broker environment, and keeps broker state visually distinct from shared Massive market-data status. Done means Alpaca credentials are encrypted in the main process, broker provider reinitialization is scoped to broker changes, the settings UI matches the revised mockup intent, and every current acceptance criterion has an e2e test or an explicit superseded note.

## Supporting Documents

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-37-paper-live-environment-toggle.md`
- **Mockup:** `mockups/us-37-credentials-and-broker-environment.mdx`
- **Research & Design Decisions:** `plans/us-37/research.md`
- **Data Model:** `plans/us-37/data-model.md`
- **API Contract:** `plans/us-37/contracts/settings-ipc.md`
- **Quickstart & Verification:** `plans/us-37/quickstart.md`

## Prerequisites

- US-31/US-39/US-40 provider split exists in `src/main/integrations/market-data-provider.ts`, `massive-market-data.ts`, `broker-provider.ts`, and `alpaca-broker.ts`.
- `src/main/index.ts` currently registers market-data and broker IPC once at startup; this story changes settings/provider wiring so runtime credential changes are visible.
- The app already uses hash routing through `useHashLocation` in `src/renderer/src/App.tsx`.
- Product clarification after the story was written: Massive credentials are shared for all users and are not stored or edited in settings. Massive-related save/remove ACs from the story are superseded by this plan.

## Implementation Areas

### 1. Alpaca Credential Persistence And Encryption

**Files to create or modify:**

- `migrations/006_add_credential_settings.sql` — create generic `credential_settings` and `app_settings`; only Alpaca rows are written in this story
- `src/main/services/settings.ts` — new credential/settings service
- `src/main/services/settings.test.ts` — new tests

**Red — tests to write:**

- `settings.test.ts` "saveAlpacaCredentials stores paper and live credential rows independently" — save both envs and assert status returns both configured.
- `settings.test.ts` "saved secrets load as configured/missing metadata only, never plaintext" — status returns masks and booleans, not decrypted keys.
- `settings.test.ts` "removeAlpacaCredentials deletes only the requested environment and sets active env to none when removing the active broker".
- `settings.test.ts` "active broker environment persists between service instances".
- `settings.test.ts` "Massive status is read from app configuration and does not create a credential_settings row".

**Green — implementation:**

- Add the SQLite migration per `plans/us-37/data-model.md`.
- Implement pure-ish service functions around DB statements: `getCredentialStatus`, `saveAlpacaCredentials`, `removeAlpacaCredentials`, `setActiveBrokerEnvironment`, and Alpaca credential loaders for factories.
- Keep `safeStorage.encryptString` / `decryptString` calls in this service boundary.
- Return only `CredentialStatus` metadata to callers.

**Refactor — cleanup to consider:**

- Extract small helpers for `trimRequired`, `encryptSecret`, `decryptSecret`, and `maskAccountNumber`.
- Confirm no logging statement includes plaintext payloads.

**Acceptance criteria covered:**

- Credentials are stored securely for Alpaca paper/live.
- App remembers the last active broker environment between launches.

### 2. Connection Probe Helpers

**Files to create or modify:**

- `src/main/services/settings-connections.ts` — new probe service
- `src/main/services/settings-connections.test.ts` — new tests
- `src/main/integrations/alpaca-broker.ts` — expose/reuse account mask and environment mismatch mapping if needed
- `src/main/integrations/massive-market-data.ts` — expose/reuse HTTP error mapping if needed

**Red — tests to write:**

- `settings-connections.test.ts` "testMassiveConnection calls /v3/reference/tickers/AAPL with the shared configured app key".
- `settings-connections.test.ts` "Massive 200 returns connected".
- `settings-connections.test.ts` "Massive 401 returns auth_failed message Authentication failed (401)".
- `settings-connections.test.ts` "Massive 429 returns rate_limited message Rate limited — please try again".
- `settings-connections.test.ts` "testAlpacaConnection calls paper-api.alpaca.markets for paper and api.alpaca.markets for live".
- `settings-connections.test.ts` "Alpaca success returns first2 ellipsis last3 accountNumberMasked".
- `settings-connections.test.ts` "Alpaca test connection does not call activities import or getActivity".
- `settings-connections.test.ts` "live keys submitted to paper return environment_mismatch with exact UI message".

**Green — implementation:**

- Implement Massive fixed reference probe described in `plans/us-37/contracts/settings-ipc.md`; it accepts no user-entered key.
- Implement Alpaca candidate credential probe against the requested environment.
- Use typed result objects so IPC can surface exact messages without parsing thrown errors.

**Refactor — cleanup to consider:**

- Share HTTP status to error-code mapping with provider classes only if it reduces duplication cleanly.

**Acceptance criteria covered:**

- Test connection for Massive uses a fixed reference probe.
- Test connection for Alpaca surfaces the account identifier and environment.
- Test connection detects environment mismatch.

### 3. Runtime Provider Factories

**Files to create or modify:**

- `src/main/integrations/market-data-factory.ts` — keep loading Massive key from shared app configuration
- `src/main/integrations/broker-factory.ts` — load active Alpaca credential pair from settings service and allow runtime recreate
- `src/main/integrations/market-data-factory.test.ts` — update
- `src/main/integrations/broker-factory.test.ts` — update
- `src/main/index.ts` — register handlers with provider accessors instead of stale startup instances

**Red — tests to write:**

- `market-data-factory.test.ts` "create returns MassiveMarketDataProvider from shared configured Massive key".
- `market-data-factory.test.ts` "missing shared Massive key surfaces auth/configuration error without consulting user settings".
- `broker-factory.test.ts` "create returns AlpacaBrokerProvider for persisted active paper credentials".
- `broker-factory.test.ts` "set active live recreates broker provider without touching marketDataFactory".
- `broker-factory.test.ts` "no Alpaca credentials returns a typed not configured BrokerError instead of leaving broker IPC unregistered".

**Green — implementation:**

- Change factories to accept loader functions or a settings service dependency where tests can inject an in-memory DB.
- Preserve fake providers for test env vars.
- Adjust `registerMarketDataHandlers` and `registerBrokerHandlers` usage so handlers resolve current provider at call time or receive a stable provider manager.
- On broker switch or Alpaca credential replacement, call only `brokerFactory.recreate`; no settings action recreates `marketDataFactory`.

**Refactor — cleanup to consider:**

- Keep direct `@alpacahq/typescript-sdk` imports only in `src/main/integrations/alpaca-broker.ts`.
- Keep provider managers small; do not introduce a global service container.

**Acceptance criteria covered:**

- Confirming the switch reinitialises only the BrokerProvider.
- Market data is independent of broker configuration.
- Expired Massive or Alpaca credentials surface a re-entry prompt, provider side.

### 4. Settings IPC And Preload API

**Files to create or modify:**

- `src/main/ipc/settings.ts` — new handlers
- `src/main/ipc/settings.test.ts` — new tests
- `src/main/schemas.ts` — add Zod payload schemas and response types
- `src/preload/index.ts` — expose `api.settings`
- `src/preload/index.d.ts` — expose typed settings API
- `src/main/index.ts` — register settings handlers

**Red — tests to write:**

- `settings.test.ts` "registers all settings:* channels from the contract".
- `settings.test.ts` "settings:get-credential-status returns ok true with status".
- `settings.test.ts` "settings:save-alpaca-credentials validates environment/keyId/secret and returns Zod errors on invalid payload".
- `settings.test.ts` "settings:set-active-broker-environment rejects live when live credentials are missing".
- `settings.test.ts` "settings:test-connection returns typed failure instead of throwing".

**Green — implementation:**

- Add schemas matching `plans/us-37/contracts/settings-ipc.md`.
- Register settings channels for status, Alpaca save/remove, active broker environment, and test connection.
- Wire settings mutations to provider factory recreate hooks.
- Expose `window.api.settings.status/saveAlpaca/removeAlpaca/setActiveBrokerEnvironment/testConnection`.

**Refactor — cleanup to consider:**

- Keep handler bodies thin: validate payload, call service, return result.
- Confirm all failures use `{ ok: false, errors: [...] }`.

**Acceptance criteria covered:**

- Settings page surfaces both vendors independently, data contract side.
- Massive status/test is available without storing Massive credentials in settings.
- Switching broker environment to LIVE requires confirmation, persistence side.
- Switching back to Paper is immediate, persistence side.

### 5. Renderer Settings API, Hooks, And Query Keys

**Files to create or modify:**

- `src/renderer/src/api/settings.ts` — new API adapter
- `src/renderer/src/api/settings.test.ts` — new tests
- `src/renderer/src/hooks/settingsQueryKeys.ts` — new
- `src/renderer/src/hooks/brokerQueryKeys.ts` — new or extracted
- `src/renderer/src/hooks/marketDataQueryKeys.ts` — rename first segment to `'market'` and remove broker key
- `src/renderer/src/hooks/useSettings.ts` — new status/mutation hooks
- `src/renderer/src/hooks/useSettings.test.ts` — new tests
- `src/renderer/src/hooks/useMarketStatus.ts` — use broker query keys

**Red — tests to write:**

- `settings.test.ts` "getCredentialStatus calls window.api.settings.status and unwraps status".
- `useSettings.test.ts` "setActiveBrokerEnvironment invalidates only queries whose first key segment is broker".
- `useSettings.test.ts` "Alpaca credential replacement invalidates only queries whose first key segment is broker".
- `useSettings.test.ts` "settings mutations refresh settings status after success".
- `marketDataQueryKeys.test.ts` "market data keys start with market, not broker or market-data".
- `brokerQueryKeys.test.ts` "broker account/activities/market-status keys start with broker".

**Green — implementation:**

- Add renderer API functions for every settings IPC channel.
- Add mutation hooks with vendor-scoped invalidation predicates.
- Update existing stock quote/option snapshot hooks to use `['market', ...]`.
- Update market status to use `brokerQueryKeys.marketStatus`.

**Refactor — cleanup to consider:**

- Keep query-key modules simple object literals.
- Avoid invalidating positions unless a specific settings action needs journal data refreshed.

**Acceptance criteria covered:**

- Confirming the switch reinitialises only the BrokerProvider.
- TanStack Query keys prefixed broker are invalidated.
- TanStack Query keys prefixed market are not invalidated.

### 6. Header Badge, Market Data Dot, And App Shell Route

**Files to create or modify:**

- `src/renderer/src/components/EnvironmentBadge.tsx` — new
- `src/renderer/src/components/EnvironmentBadge.test.tsx` — new
- `src/renderer/src/components/MarketDataStatusDot.tsx` — new
- `src/renderer/src/components/MarketDataStatusDot.test.tsx` — new
- `src/renderer/src/App.tsx` — add header/status area and settings route/nav
- `src/renderer/src/pages/SettingsPage.tsx` — route target shell

**Red — tests to write:**

- `EnvironmentBadge.test.tsx` "paper renders high-visibility amber PAPER with animate-wb-pulse".
- `EnvironmentBadge.test.tsx` "live renders subtle green LIVE without pulse".
- `EnvironmentBadge.test.tsx` "none renders NO BROKER with neutral styling and tooltip text".
- `EnvironmentBadge.test.tsx` "badge label and styling do not change when Massive status changes".
- `App.test.tsx` or route test "settings route #/settings renders SettingsPage under hash router".

**Green — implementation:**

- Translate mockup `BrokerBadge` and `MassiveDot` into Tailwind classes using `wb-*` tokens.
- Add Settings nav item and route at `/settings`.
- Ensure the badge is visible on every page in the app shell, not only settings.
- Use `useSettingsStatus` in the shell, with a stable loading fallback of `NO BROKER`.

**Refactor — cleanup to consider:**

- Keep the badge component purely presentational and pass `activeBrokerEnv`.

**Acceptance criteria covered:**

- Broker environment badge is always visible and clearly distinguished.
- Market data is independent of broker configuration.
- App remembers the last active broker environment between launches, renderer side.

### 7. Settings Page Forms And Confirmation Dialog

**Files to create or modify:**

- `src/renderer/src/pages/SettingsPage.tsx` — implement page
- `src/renderer/src/pages/SettingsPage.test.tsx` — new tests
- `src/renderer/src/components/LiveBrokerConfirmDialog.tsx` — new
- `src/renderer/src/components/LiveBrokerConfirmDialog.test.tsx` — new
- `src/renderer/src/components/CredentialCard.tsx` — new if split from page
- `src/renderer/src/components/MassiveStatusSection.tsx` — new if split from page

**Red — tests to write:**

- `SettingsPage.test.tsx` "renders Market Data (Massive) as shared app status with a Test connection button and no key input".
- `SettingsPage.test.tsx` "renders Broker (Alpaca) with Paper and Live credential cards, each with API Key ID, Secret Key, and Test connection".
- `SettingsPage.test.tsx` "renders Active Broker Environment Paper/Live segmented control above credential cards".
- `SettingsPage.test.tsx` "empty state banner explains Massive is app-provided and Alpaca setup is optional".
- `SettingsPage.test.tsx` "saved Alpaca secrets render bullet mask and Replace control, not decrypted values".
- `SettingsPage.test.tsx` "Massive 401/429 test results render exact red messages".
- `SettingsPage.test.tsx` "Alpaca verified result renders ✓ Verified — Account PA…ABC (paper)".
- `SettingsPage.test.tsx` "Paper card environment mismatch renders exact red mismatch message and does not call save".
- `LiveBrokerConfirmDialog.test.tsx` "dialog title/body/bullets/footer match story copy".
- `LiveBrokerConfirmDialog.test.tsx` "confirm button uses gold primary styling, not red destructive styling".
- `LiveBrokerConfirmDialog.test.tsx` "open-position warning renders with count when positions exist".
- `SettingsPage.test.tsx` "switching from live to paper calls mutation immediately without opening dialog".

**Green — implementation:**

- Use React Hook Form with Zod resolver for each Alpaca card; Massive status/test has no credential form.
- Implement mockup shapes: `MassiveSection`, `CredentialCard`, `EnvironmentSegmented`, `NotConfiguredCard`, `OnboardingBanner`, and `ConfirmDialog`.
- Use exact visible labels and dialog copy from the story and mockup.
- Use existing position hook data to compute `{N}` open positions for LIVE confirmation warning.
- Use Tailwind utility classes and `wb-*` tokens only; avoid inline colors from the mockup.

**Refactor — cleanup to consider:**

- Split components only where tests or readability benefit; avoid a component per div.
- Keep form state inside React Hook Form, not hand-managed `useState`.

**Acceptance criteria covered:**

- Settings page surfaces both vendors independently.
- Switching broker environment to LIVE requires confirmation.
- LIVE confirmation includes position-reconciliation warning when positions exist.
- Switching back to Paper is immediate.
- Alpaca credentials are stored securely, UI side.
- Empty-state on first launch.

### 8. Market Data And Broker Degraded States

**Files to create or modify:**

- `src/renderer/src/pages/PositionsListPage.tsx` — show setup banner and placeholders
- `src/renderer/src/components/PositionCard.tsx` or price cells — show stale/placeholder behavior
- `src/renderer/src/components/StaleDataBanner.tsx` — adjust if needed
- `src/renderer/src/hooks/useStockQuotes.ts` — surface auth failure state
- `src/renderer/src/hooks/useOptionSnapshots.ts` — surface auth failure state
- `src/main/ipc/market-data.ts` — ensure auth errors map cleanly
- `src/main/ipc/broker.ts` — ensure no-broker errors map cleanly

**Red — tests to write:**

- `PositionsListPage.test.tsx` "when shared Massive is unavailable and no Alpaca credentials exist, live data columns show em dash".
- `PositionsListPage.test.tsx` "setup banner copy links Alpaca setup to settings and explains Massive market data is app-provided".
- `PositionsListPage.test.tsx` "Massive configured and no Alpaca still renders live prices/Greeks from market hooks".
- `PositionsListPage.test.tsx` "broker-only buying power/activity surface renders Connect Alpaca to enable when broker missing".
- `useStockQuotes.test.ts` "auth_failed mid-session triggers vendor auth toast contract or returned error state".
- `PositionCard.test.tsx` "after Massive auth failure, cached price can show stale badge before unavailable dash on next render".

**Green — implementation:**

- Add credential status awareness to positions page without coupling market data to broker config.
- Preserve cached quote data briefly when Massive auth/config failure occurs and mark it stale; render `—` after next unavailable state.
- Show broker placeholders on broker-only surfaces when active broker env is `"none"`.
- Emit or route auth-failure toast copy by vendor: Alpaca uses `Alpaca authentication failed — check your key in Settings`; Massive uses `Market data authentication failed — shared Massive configuration needs attention`.

**Refactor — cleanup to consider:**

- Centralize vendor auth failure messaging so Massive and Alpaca copy stays consistent.

**Acceptance criteria covered:**

- Market data is independent of broker configuration.
- Empty-state on first launch.
- Shared Massive auth/config failure disables market data with stale fallback.
- Expired Massive or Alpaca credentials surface a re-entry prompt.

### 9. E2e Tests

**Files to create or modify:**

- `e2e/settings-environment.spec.ts` — new
- `e2e/provider-split.spec.ts` — update only if shared helpers need credential settings

**Red — tests to write:**

- `settings-environment.spec.ts` "Settings page surfaces Massive status and Alpaca credentials independently" — covers the shared Massive status section, Paper/Live credential cards, and global active broker toggle.
- `settings-environment.spec.ts` "Shared Massive configuration enables market data" — provide mocked app-level Massive config, successful test status, and live price refresh without any settings save.
- `settings-environment.spec.ts` "Test connection for Massive uses a fixed reference probe" — assert AAPL reference probe with configured app key and 200/401/429 UI states via mocked fetch.
- `settings-environment.spec.ts` "Test connection for Alpaca surfaces the account identifier and environment" — Paper candidate shows `✓ Verified — Account PA…ABC (paper)` and no activities call.
- `settings-environment.spec.ts` "Test connection detects environment mismatch" — live keys in Paper card show exact mismatch copy and remain unsaved.
- `settings-environment.spec.ts` "Switching broker environment to LIVE requires confirmation" — assert title, body, bullets, footer, and gold confirm button.
- `settings-environment.spec.ts` "LIVE confirmation includes position-reconciliation warning when positions exist" — seed open positions and assert count warning.
- `settings-environment.spec.ts` "Confirming the switch reinitialises only the BrokerProvider" — assert badge changes, broker calls refresh, market calls remain uninterrupted.
- `settings-environment.spec.ts` "Switching back to Paper is immediate" — from Live, click Paper and assert no dialog.
- `settings-environment.spec.ts` "Broker environment badge is always visible and clearly distinguished" — navigate multiple pages and assert Paper/Live/No Broker badge behavior independent of Massive.
- `settings-environment.spec.ts` "Market data is independent of broker configuration" — shared Massive configured, no Alpaca, positions render live data while broker surfaces show placeholders.
- `settings-environment.spec.ts` "Alpaca credentials are stored securely per environment" — save credentials, reload settings, assert bullets/Replace and no plaintext in test DB/log capture.
- `settings-environment.spec.ts` "App remembers the last active broker environment between launches" — persist Paper, restart app, badge is `PAPER` immediately.
- `settings-environment.spec.ts` "Empty-state on first launch" — clean DB shows exact setup banner and live data dashes.
- `settings-environment.spec.ts` "Shared Massive auth failure disables market data with stale fallback" — mocked mid-session Massive failure shows stale badge then dashes and auth error on request.
- `settings-environment.spec.ts` "Expired Massive or Alpaca credentials surface a re-entry prompt" — mocked mid-session 401 shows toast and vendor status degrades.

**Green — implementation:**

- Add e2e fixtures/test helpers for clean DB, seeded Alpaca credentials, mocked shared Massive responses, mocked Alpaca account responses, and open positions.
- Map each e2e test name to one current acceptance criterion scenario, using the revised Massive wording where product clarification superseded the original story text.

**Refactor — cleanup to consider:**

- Reuse existing e2e bootstrapping from provider and position specs.
- Keep real network disabled; use fake providers or mocked IPC/fetch fixtures.

**Acceptance criteria covered:**

- Every current acceptance criterion from `docs/epics/06-stories/US-37-paper-live-environment-toggle.md`, with Massive save/remove scenarios explicitly superseded by product clarification.

## AC Audit

- Settings page surfaces both vendors independently — covered by revised E2E "Settings page surfaces Massive status and Alpaca credentials independently".
- Saving Massive credentials enables market data — superseded by product clarification; covered by revised E2E "Shared Massive configuration enables market data".
- Test connection for Massive uses a fixed reference probe — covered by E2E test with same name.
- Test connection for Alpaca surfaces the account identifier and environment — covered by E2E test with same name.
- Test connection detects environment mismatch — covered by E2E test with same name.
- Switching broker environment to LIVE requires confirmation — covered by E2E test with same name.
- LIVE confirmation includes position-reconciliation warning when positions exist — covered by E2E test with same name.
- Confirming the switch reinitialises only the BrokerProvider — covered by E2E test with same name.
- Switching back to Paper is immediate — covered by E2E test with same name.
- Broker environment badge is always visible and clearly distinguished — covered by E2E test with same name.
- Market data is independent of broker configuration — covered by E2E test with same name.
- Credentials are stored securely per vendor — revised to Alpaca-only secure storage; covered by E2E "Alpaca credentials are stored securely per environment".
- App remembers the last active broker environment between launches — covered by E2E test with same name.
- Empty-state on first launch — covered by E2E test with same name.
- Removing Massive credentials disables market data with stale fallback — superseded by product clarification; covered by E2E "Shared Massive auth failure disables market data with stale fallback".
- Expired Massive or Alpaca credentials surface a re-entry prompt — covered by E2E test with same name.
