# US-37 — Paper/Live Broker Environment Toggle — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Massive credentials are shared app configuration. Do not add Massive save/remove credential storage in settings.

---

## Layer 1 — Foundation (No Dependencies)

> These areas can be started immediately and run in parallel.

### Alpaca Credential Persistence And Encryption

- [ ] **[Red]** Write failing tests — `src/main/services/settings.test.ts`
  - Test cases: `saveAlpacaCredentials` stores paper/live rows independently in generic `credential_settings`; saved secrets expose only configured/missing metadata; plaintext never appears in SQLite; removing active env sets active broker env to `none`; active broker env persists; Massive status reads shared config and creates no `credential_settings` row.
  - Run `pnpm test -- src/main/services/settings.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `migrations/006_add_credential_settings.sql`, `src/main/services/settings.ts` _(depends on: Alpaca Credential Persistence And Encryption Red ✓)_
  - Create generic `credential_settings` keyed by `(vendor, environment)` plus `app_settings`.
  - Implement `getCredentialStatus`, `saveAlpacaCredentials`, `removeAlpacaCredentials`, `setActiveBrokerEnvironment`, and Alpaca credential loaders.
  - Use `safeStorage.encryptString` / `decryptString` only in the main-process service boundary.
  - Run `pnpm test -- src/main/services/settings.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/services/settings.ts` _(depends on: Alpaca Credential Persistence And Encryption Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check helpers for trim/encrypt/decrypt/account masking and confirm no plaintext logging.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Connection Probe Helpers

- [ ] **[Red]** Write failing tests — `src/main/services/settings-connections.test.ts`
  - Test cases: Massive probe calls `/v3/reference/tickers/AAPL` using shared configured app key; Massive 200/401/429 map to exact statuses/messages; Alpaca probe uses paper/live account hosts; Alpaca success returns `PA…ABC`; Alpaca probe never imports activities; live keys submitted to paper return exact environment mismatch message.
  - Run `pnpm test -- src/main/services/settings-connections.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/services/settings-connections.ts`, `src/main/integrations/alpaca-broker.ts`, `src/main/integrations/massive-market-data.ts` _(depends on: Connection Probe Helpers Red ✓)_
  - Implement Massive fixed reference probe with no user-entered Massive key.
  - Implement Alpaca candidate credential probe for requested environment.
  - Return typed connection results from `plans/us-37/contracts/settings-ipc.md`.
  - Run `pnpm test -- src/main/services/settings-connections.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — `src/main/services/settings-connections.ts` _(depends on: Connection Probe Helpers Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share error mapping only where it reduces duplication cleanly.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Main-Process Integration (Depends On Layer 1)

> These areas can run in parallel with each other after the relevant Layer 1 Green tasks are complete.

### Runtime Provider Factories

**Requires:** Alpaca Credential Persistence And Encryption Green ✓

- [ ] **[Red]** Write failing tests — `src/main/integrations/market-data-factory.test.ts`, `src/main/integrations/broker-factory.test.ts` _(depends on: Alpaca Credential Persistence And Encryption Green ✓)_
  - Test cases: market factory returns Massive from shared app config; missing Massive shared key does not consult user settings; broker factory returns Alpaca provider for persisted active paper credentials; active live recreates broker without touching market factory; no Alpaca credentials returns typed not-configured `BrokerError`.
  - Run `pnpm test -- src/main/integrations/market-data-factory.test.ts src/main/integrations/broker-factory.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/integrations/market-data-factory.ts`, `src/main/integrations/broker-factory.ts`, `src/main/index.ts` _(depends on: Runtime Provider Factories Red ✓)_
  - Keep Massive app-config driven.
  - Load active Alpaca credential pair from settings service.
  - Register handlers with current provider accessors or a small provider manager.
  - Recreate only `BrokerProvider` on broker switch or Alpaca credential replacement.
  - Run `pnpm test -- src/main/integrations/market-data-factory.test.ts src/main/integrations/broker-factory.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — provider factory files _(depends on: Runtime Provider Factories Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep `@alpacahq/typescript-sdk` isolated to integration files and avoid a service-container abstraction.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Settings IPC And Preload API

**Requires:** Alpaca Credential Persistence And Encryption Green ✓, Connection Probe Helpers Green ✓

- [ ] **[Red]** Write failing tests — `src/main/ipc/settings.test.ts` _(depends on: Alpaca Credential Persistence And Encryption Green ✓, Connection Probe Helpers Green ✓)_
  - Test cases: registers settings channels; `settings:get-credential-status` returns status; `settings:save-alpaca-credentials` validates env/keyId/secret; `settings:set-active-broker-environment` rejects missing live creds; `settings:test-connection` returns typed failure without throwing.
  - Run `pnpm test -- src/main/ipc/settings.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/main/ipc/settings.ts`, `src/main/schemas.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/index.ts` _(depends on: Settings IPC And Preload API Red ✓)_
  - Add schemas and handlers from `plans/us-37/contracts/settings-ipc.md`.
  - Expose `window.api.settings.status/saveAlpaca/removeAlpaca/setActiveBrokerEnvironment/testConnection`.
  - Do not add Massive save/remove channels.
  - Run `pnpm test -- src/main/ipc/settings.test.ts` — all tests must pass
- [ ] **[Refactor]** `/refactor` — settings IPC/preload files _(depends on: Settings IPC And Preload API Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep handlers thin and ensure failures return `{ ok: false, errors: [...] }`.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Renderer Data Plumbing (Depends On Layer 2)

> Renderer API and query-key work can start after settings IPC/preload exists.

### Renderer Settings API, Hooks, And Query Keys

**Requires:** Settings IPC And Preload API Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/api/settings.test.ts`, `src/renderer/src/hooks/useSettings.test.ts`, `src/renderer/src/hooks/marketDataQueryKeys.test.ts`, `src/renderer/src/hooks/brokerQueryKeys.test.ts` _(depends on: Settings IPC And Preload API Green ✓)_
  - Test cases: settings API unwraps status; broker environment mutation invalidates only `queryKey[0] === 'broker'`; Alpaca credential replacement invalidates only broker queries; settings mutations refresh status; market keys start with `market`; broker keys start with `broker`.
  - Run `pnpm test -- src/renderer/src/api/settings.test.ts src/renderer/src/hooks/useSettings.test.ts src/renderer/src/hooks/marketDataQueryKeys.test.ts src/renderer/src/hooks/brokerQueryKeys.test.ts` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/api/settings.ts`, `src/renderer/src/hooks/settingsQueryKeys.ts`, `src/renderer/src/hooks/brokerQueryKeys.ts`, `src/renderer/src/hooks/marketDataQueryKeys.ts`, `src/renderer/src/hooks/useSettings.ts`, `src/renderer/src/hooks/useMarketStatus.ts` _(depends on: Renderer Settings API, Hooks, And Query Keys Red ✓)_
  - Add settings API adapters and hooks for status, Alpaca save/remove, active broker env, and connection test.
  - Normalize market keys to `['market', ...]` and broker keys to `['broker', ...]`.
  - Scope query invalidation by first key segment.
  - Run focused renderer hook/API tests — all tests must pass
- [ ] **[Refactor]** `/refactor` — renderer API/hooks/query keys _(depends on: Renderer Settings API, Hooks, And Query Keys Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep query key modules as simple object literals and avoid unnecessary positions invalidation.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Renderer UI (Depends On Layer 3)

> These UI areas can run in parallel after renderer settings hooks and query keys exist.

### Header Badge, Market Data Dot, And App Shell Route

**Requires:** Renderer Settings API, Hooks, And Query Keys Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/components/EnvironmentBadge.test.tsx`, `src/renderer/src/components/MarketDataStatusDot.test.tsx`, route coverage in `src/renderer/src/App.test.tsx` or existing app-shell test _(depends on: Renderer Settings API, Hooks, And Query Keys Green ✓)_
  - Test cases: paper renders high-visibility amber `PAPER` with `animate-wb-pulse`; live renders subtle green `LIVE`; none renders `NO BROKER` with tooltip; badge ignores Massive status; `#/settings` renders `SettingsPage`.
  - Run focused component/route tests — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/components/EnvironmentBadge.tsx`, `src/renderer/src/components/MarketDataStatusDot.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/pages/SettingsPage.tsx` _(depends on: Header Badge, Market Data Dot, And App Shell Route Red ✓)_
  - Translate mockup `BrokerBadge` and `MassiveDot` into Tailwind `wb-*` token classes.
  - Add Settings nav item and route at `/settings`.
  - Keep badge visible on every page.
  - Run focused component/route tests — all tests must pass
- [ ] **[Refactor]** `/refactor` — app shell/status components _(depends on: Header Badge, Market Data Dot, And App Shell Route Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep badge presentational and avoid inline colors.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Settings Page Forms And Confirmation Dialog

**Requires:** Renderer Settings API, Hooks, And Query Keys Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/pages/SettingsPage.test.tsx`, `src/renderer/src/components/LiveBrokerConfirmDialog.test.tsx` _(depends on: Renderer Settings API, Hooks, And Query Keys Green ✓)_
  - Test cases: Massive section is shared app status with Test connection and no key input; Paper/Live cards each show API Key ID, Secret Key, Test connection; active environment segmented control is above cards; empty banner says Massive is app-provided and Alpaca optional; saved Alpaca secrets show bullets and Replace; Massive 401/429 render exact red messages; Alpaca verified result renders `✓ Verified — Account PA…ABC (paper)`; paper-card mismatch message does not save; LIVE dialog exact title/body/bullets/footer; confirm is gold not destructive red; open-position warning includes count; live-to-paper switch has no dialog.
  - Run `pnpm test -- src/renderer/src/pages/SettingsPage.test.tsx src/renderer/src/components/LiveBrokerConfirmDialog.test.tsx` — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/components/LiveBrokerConfirmDialog.tsx`, optional `CredentialCard.tsx`, optional `MassiveStatusSection.tsx` _(depends on: Settings Page Forms And Confirmation Dialog Red ✓)_
  - Use React Hook Form + Zod resolver for Alpaca cards only.
  - Implement revised mockup sections: Massive status/test, broker credential cards, environment segmented control, onboarding banner, and LIVE confirm dialog.
  - Use existing positions data to compute open-position warning.
  - Use Tailwind utility classes and `wb-*` tokens.
  - Run focused page/dialog tests — all tests must pass
- [ ] **[Refactor]** `/refactor` — settings page/dialog components _(depends on: Settings Page Forms And Confirmation Dialog Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Split components only where readability/tests benefit and keep form state inside React Hook Form.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Market Data And Broker Degraded States

**Requires:** Renderer Settings API, Hooks, And Query Keys Green ✓

- [ ] **[Red]** Write failing tests — `src/renderer/src/pages/PositionsListPage.test.tsx`, `src/renderer/src/hooks/useStockQuotes.test.ts`, `src/renderer/src/components/PositionCard.test.tsx` _(depends on: Renderer Settings API, Hooks, And Query Keys Green ✓)_
  - Test cases: unavailable shared Massive + no Alpaca shows em dash live columns; setup banner links Alpaca setup and explains Massive is app-provided; Massive configured + no Alpaca still renders live prices/Greeks; broker-only surfaces show "Connect Alpaca to enable"; mid-session `auth_failed` routes vendor auth state/toast; cached price shows stale badge before unavailable dash after Massive auth failure.
  - Run focused page/hook/card tests — all new tests must fail
- [ ] **[Green]** Implement — `src/renderer/src/pages/PositionsListPage.tsx`, `src/renderer/src/components/PositionCard.tsx`, `src/renderer/src/components/StaleDataBanner.tsx`, `src/renderer/src/hooks/useStockQuotes.ts`, `src/renderer/src/hooks/useOptionSnapshots.ts`, `src/main/ipc/market-data.ts`, `src/main/ipc/broker.ts` _(depends on: Market Data And Broker Degraded States Red ✓)_
  - Add credential status awareness without coupling market data to broker config.
  - Preserve cached quote data briefly on Massive auth/config failure, mark stale, then render `—`.
  - Show broker placeholders when active broker env is `none`.
  - Use vendor-specific auth copy from the plan.
  - Run focused page/hook/card tests — all tests must pass
- [ ] **[Refactor]** `/refactor` — degraded-state files _(depends on: Market Data And Broker Degraded States Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Centralize vendor auth messaging if it simplifies behavior.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [ ] **[Red]** Write failing e2e tests — `e2e/settings-environment.spec.ts` _(depends on: all previous Green tasks ✓)_
  - One `it()` per current AC scenario, using revised Massive wording where product clarification superseded original save/remove text.
  - AC coverage:
    - Settings page surfaces both vendors independently → `it('Settings page surfaces Massive status and Alpaca credentials independently')`
    - Saving Massive credentials enables market data, superseded → `it('Shared Massive configuration enables market data')`
    - Test connection for Massive uses a fixed reference probe → `it('Test connection for Massive uses a fixed reference probe')`
    - Test connection for Alpaca surfaces the account identifier and environment → `it('Test connection for Alpaca surfaces the account identifier and environment')`
    - Test connection detects environment mismatch → `it('Test connection detects environment mismatch')`
    - Switching broker environment to LIVE requires confirmation → `it('Switching broker environment to LIVE requires confirmation')`
    - LIVE confirmation includes position-reconciliation warning when positions exist → `it('LIVE confirmation includes position-reconciliation warning when positions exist')`
    - Confirming the switch reinitialises only the BrokerProvider → `it('Confirming the switch reinitialises only the BrokerProvider')`
    - Switching back to Paper is immediate → `it('Switching back to Paper is immediate')`
    - Broker environment badge is always visible and clearly distinguished → `it('Broker environment badge is always visible and clearly distinguished')`
    - Market data is independent of broker configuration → `it('Market data is independent of broker configuration')`
    - Credentials are stored securely per vendor, revised to Alpaca-only → `it('Alpaca credentials are stored securely per environment')`
    - App remembers the last active broker environment between launches → `it('App remembers the last active broker environment between launches')`
    - Empty-state on first launch → `it('Empty-state on first launch')`
    - Removing Massive credentials disables market data, superseded → `it('Shared Massive auth failure disables market data with stale fallback')`
    - Expired Massive or Alpaca credentials surface a re-entry prompt → `it('Expired Massive or Alpaca credentials surface a re-entry prompt')`
  - Run `pnpm test:e2e` — all new tests must fail
- [ ] **[Green]** Make e2e tests pass — `e2e/settings-environment.spec.ts` _(depends on: E2E Tests Red ✓)_
  - Add fixtures/helpers for clean DB, seeded Alpaca credentials, mocked shared Massive responses, mocked Alpaca account responses, and open positions.
  - Keep real network disabled.
  - Run `pnpm test:e2e` — all tests must pass
- [ ] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Tests Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Reuse existing e2e bootstrapping from provider/position specs where practical.
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every current AC, with Massive save/remove scenarios explicitly superseded
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
