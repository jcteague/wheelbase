# US-37: Paper/Live Broker Environment Toggle

<!-- generated:from us-37 -->
## Summary

US-37 adds a dedicated settings experience for broker credentials and active-broker switching while keeping shared market-data configuration separate. Massive remains app-provided and shared across users: the settings page can show its status and run a fixed probe, but it does not let the user save or remove a Massive key. Alpaca paper and live credentials are stored per environment in SQLite using `safeStorage` encryption, the active broker environment is persisted across launches, and the broker provider can be recreated at runtime without resetting stock/option market-data flows. On the renderer side the app now exposes `#/settings`, always shows a broker environment badge, uses a separate market-data status dot, invalidates only broker-prefixed queries after broker changes, and prompts before switching to LIVE.

## Acceptance criteria

- **Settings page surfaces Massive and Alpaca independently** — `SettingsPage` has a shared Massive status/test section with no credential inputs, plus separate paper/live Alpaca credential cards and an active-environment segmented control.
- **Shared Massive configuration enables market data** — with a configured shared Massive key, price and option-mid surfaces continue to work even when no Alpaca credentials are configured.
- **Massive test connection uses a fixed reference probe** — `settings:test-connection` with `{ vendor: 'massive' }` probes `GET /v3/reference/tickers/AAPL` and returns `connected`/typed errors.
- **Alpaca test connection surfaces account identity and environment** — testing paper/live candidate credentials returns `✓ Verified — Account XX…YYY (paper|live)` without importing activities.
- **Environment mismatch is detected** — live keys entered in the paper card return `environment_mismatch` with the exact UI message `Environment mismatch — these are LIVE keys, not paper keys`.
- **Switching broker environment to LIVE requires confirmation** — the renderer shows a gold-accent confirmation dialog before invoking the live switch.
- **LIVE confirmation warns when Wheelbase has open positions** — the dialog includes an open-position count based on existing journal data and reminds the trader that Wheelbase positions are not synchronized to Alpaca.
- **Confirming the switch refreshes broker state only** — account/buying-power/activity surfaces refresh, but market-data polling and displayed quotes continue uninterrupted.
- **Switching back to paper is immediate** — moving from live to paper does not show the confirmation dialog.
- **Broker badge is always visible and clearly distinct from market-data status** — `EnvironmentBadge` reflects `PAPER`, `LIVE`, or `NO BROKER` independently of Massive state.
- **Market data is independent of broker configuration** — shared Massive quotes can remain healthy while broker state is unconfigured or degraded.
- **Alpaca credentials are stored securely per environment** — plaintext credentials are trimmed, encrypted, never surfaced back to the renderer, and stored separately for paper and live.
- **App remembers the last active broker environment between launches** — the active broker environment persists via `app_settings`.
- **Empty-state onboarding explains the split** — first launch copy explains that Massive is app-provided and Alpaca setup is optional but required for broker-only surfaces.
- **Expired Massive or Alpaca credentials surface re-entry prompts** — Massive auth failures degrade quote surfaces with stale/unavailable messaging, while broker auth failures prompt the user to check Alpaca keys in Settings.

The shipped e2e coverage in `e2e/settings-environment.spec.ts` contains one scenario per acceptance criterion above.

## What was built

### Persistence and runtime settings services

- Migration `006_add_credential_settings.sql` adds:
  - `credential_settings` — generic encrypted credential rows keyed by `(vendor, environment)`
  - `app_settings` — key/value settings rows used for `active_broker_environment`
- `src/main/services/settings.ts` owns:
  - `getCredentialStatus()`
  - `saveVerifiedAlpacaCredentials()` / `saveAlpacaCredentials()`
  - `removeAlpacaCredentials()`
  - `setActiveBrokerEnvironment()`
  - `loadAlpacaCredentials()` / `loadActiveAlpacaCredentials()`
- `src/main/services/settings-connections.ts` adds settings-specific probe helpers for Massive and Alpaca.

### IPC and preload surface

- `settings:get-credential-status`
- `settings:save-alpaca-credentials`
- `settings:remove-alpaca-credentials`
- `settings:set-active-broker-environment`
- `settings:test-connection`
- `settings:test-stored-alpaca-connection`

All handlers use `handleIpcCall`, validate with Zod, and return the standard `{ ok: true, ... } | { ok: false, errors }` envelope.

### Provider lifecycle split

- `market-data-factory.ts` continues loading Massive from shared app configuration.
- `broker-factory.ts` loads the active Alpaca credential pair from settings and supports runtime recreation.
- `src/main/index.ts` now registers broker operations against the current provider so broker changes take effect without restarting the app.

### Renderer plumbing and UI

- New settings API adapter and `useSettings*` hooks expose status, save/remove, environment switching, and connection tests.
- Query keys are normalized by vendor:
  - broker: `['broker', ...]`
  - market: `['market', ...]`
- `SettingsPage` renders:
  - onboarding banner
  - shared Massive status/test section
  - paper/live Alpaca credential cards
  - active broker environment segmented control
  - `LiveBrokerConfirmDialog`
- `EnvironmentBadge` stays visible in the shell.
- `MarketDataStatusDot` stays separate from the broker badge.
- Degraded-state UI adds `StaleDataBanner` and vendor-specific re-entry prompts.

## Architecture decisions

- Shared Massive app configuration, not per-user settings → [[shared-massive-app-configuration]]
- Runtime broker-only provider refresh → [[runtime-broker-provider-refresh]]
- Vendor-scoped query keys and invalidation → [[vendor-scoped-query-keys]]

## Contracts

- `CredentialStatus`
  ```ts
  {
    massive: 'configured' | 'missing'
    alpacaPaper: 'configured' | 'missing'
    alpacaLive: 'configured' | 'missing'
    activeBrokerEnv: 'paper' | 'live' | 'none'
    massiveLastCheckedAt: string | null
    alpacaPaperAccountNumberMasked: string | null
    alpacaLiveAccountNumberMasked: string | null
  }
  ```
- `settings:save-alpaca-credentials` returns both `{ status, test }`, where `test` is the successful Alpaca verification result used by the UI.
- `settings:test-connection` accepts either `{ vendor: 'massive' }` or `{ vendor: 'alpaca', environment, keyId, secret }`.
- `settings:test-stored-alpaca-connection` accepts `{ environment }` and probes saved encrypted credentials without exposing them.

See [contracts/ipc-handlers.md](../contracts/ipc-handlers.md), [contracts/zod-schemas.md](../contracts/zod-schemas.md), and [contracts/alpaca-integration.md](../contracts/alpaca-integration.md).

## Schema changes

- New table `credential_settings`
  - `vendor`
  - `environment`
  - `key_id_encrypted`
  - `secret_encrypted`
  - `last_verified_at`
  - `account_number_masked`
  - `created_at`
  - `updated_at`
- New table `app_settings`
  - `key`
  - `value`
  - `updated_at`

See [schema/tables.md](../schema/tables.md) and [schema/migrations.md](../schema/migrations.md).

## Decisions & tradeoffs

- **Massive status is observable but not editable.** This preserves the shared deployment model and keeps user settings broker-focused.
- **Stored Massive probe timestamps are not yet persisted.** `massiveLastCheckedAt` exists in the status shape but remains `null` in the current implementation.
- **A stored-credential re-test channel shipped beyond the original contract draft.** The extra `settings:test-stored-alpaca-connection` handler supports post-save verification and degraded-state recovery.
- **The plan checklist is stale.** `plans/us-37/tasks.md` still shows Layer 5 unchecked even though the e2e spec exists and covers the intended scenarios.

## Source code references

- `migrations/006_add_credential_settings.sql`
- `src/main/services/settings.ts`
- `src/main/services/settings-connections.ts`
- `src/main/ipc/settings.ts`
- `src/main/integrations/broker-factory.ts`
- `src/main/integrations/market-data-factory.ts`
- `src/main/index.ts`
- `src/main/schemas.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/settings.ts`
- `src/renderer/src/hooks/useSettings.ts`
- `src/renderer/src/hooks/brokerQueryKeys.ts`
- `src/renderer/src/hooks/marketDataQueryKeys.ts`
- `src/renderer/src/components/EnvironmentBadge.tsx`
- `src/renderer/src/components/MarketDataStatusDot.tsx`
- `src/renderer/src/components/LiveBrokerConfirmDialog.tsx`
- `src/renderer/src/components/StaleDataBanner.tsx`
- `src/renderer/src/pages/SettingsPage.tsx`
- `e2e/settings-environment.spec.ts`
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
