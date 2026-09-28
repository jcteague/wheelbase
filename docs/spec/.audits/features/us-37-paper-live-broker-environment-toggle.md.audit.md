---
page: docs/spec/features/us-37-paper-live-broker-environment-toggle.md
audited_at: 2026-09-28
findings: 30
---

# Audit: docs/spec/features/us-37-paper-live-broker-environment-toggle.md

## Verified (19)

- ✓ All 21 "Source code references" paths exist (migration 006, settings/settings-connections/save-verified-alpaca-credentials services, ipc/settings.ts, broker + market-data factories, index.ts, schemas.ts, preload, renderer api/hooks/components, SettingsPage, `e2e/settings-environment.spec.ts`).
- ✓ Migration `006_add_credential_settings.sql` creates `credential_settings` (vendor, environment, key_id_encrypted, secret_encrypted, last_verified_at, account_number_masked, created_at, updated_at; PK (vendor, environment)) and `app_settings` (key, value, updated_at). Columns match the page exactly.
- ✓ `active_broker_environment` is the app_settings key: `src/main/services/settings.ts:89`.
- ✓ All six IPC channels are registered: `src/main/ipc/settings.ts:55,61,76,90,103,114`, each wrapped in `handleIpcCall`.
- ✓ `settings:save-alpaca-credentials` delegates to `saveVerifiedAlpacaCredentials` and returns `{ status, test }`, calling `onBrokerProviderChanged` when `refreshBroker` is true: `src/main/ipc/settings.ts:61-73`.
- ✓ `isLikelyLiveKey` / `isLikelyPaperKey` and both mismatch messages exist verbatim: `src/main/services/settings-connections.ts:36-37,84,88,116-130`.
- ✓ Credentials are trimmed and then encrypted with `safeStorage`: `src/main/services/settings.ts:91-96,179-182`.
- ✓ `CredentialState = 'configured' | 'missing'` and `ActiveBrokerEnvironment = 'paper' | 'live' | 'none'`: `src/main/services/settings.ts:7-9`.
- ✓ `broker-factory.ts` loads active Alpaca credentials and supports `recreate()`. `onBrokerProviderChanged` calls `brokerFactory.recreate()`: `src/main/index.ts:175-177`.
- ✓ Query key prefixes: `brokerQueryKeys` uses `['broker', ...]` and `marketDataQueryKeys` uses `['market', ...]` (`src/renderer/src/hooks/brokerQueryKeys.ts`, `marketDataQueryKeys.ts`).
- ✓ The `#/settings` route exists: `src/renderer/src/App.tsx:104`. `EnvironmentBadge` and `MarketDataStatusDot` are mounted in the shell: `App.tsx:5-6`.
- ✓ `EnvironmentBadge` has the labels PAPER / LIVE / NO BROKER: `src/renderer/src/components/EnvironmentBadge.tsx:7,14,21`.
- ✓ `LiveBrokerConfirmDialog` uses the gold accent (`bg-wb-gold`, `text-wb-gold`) and is rendered from SettingsPage: `LiveBrokerConfirmDialog.tsx:51,72`; `SettingsPage.tsx:14,686`.
- ✓ `StaleDataBanner` exists and is used by `PositionsListPage.tsx`.
- ✓ e2e covers: LIVE confirmation (`e2e/settings-environment.spec.ts:366`), position warning (`:396`), switching back to paper (`:478`), badge (`:495`), secure per-environment storage (`:533`), persisted environment (`:580`), environment mismatch (`:345`), Alpaca test-connection identity (`:324`).
- ✓ The ADR pages `runtime-broker-provider-refresh`, `vendor-scoped-query-keys`, `save-verified-alpaca-service` and `shared-massive-app-configuration` exist under `docs/spec/architecture/02-adrs/`.
- ✓ The contracts and schema link targets exist (`contracts/ipc-handlers.md`, `zod-schemas.md`, `alpaca-integration.md`, `schema/tables.md`, `migrations.md`).

## Drift (8)

- ✗ **Massive is described as the live market-data vendor, in the present tense throughout** (Summary; AC 1–3, 10, 11, 14, 15; "Provider lifecycle split"; Decisions). No Massive code remains: `grep -rniI massive src/` returns nothing outside tests. `market-data-factory.ts` builds `AlpacaMarketDataProvider` from the active Alpaca credentials (`src/main/integrations/market-data-factory.ts:17-22`). Massive was retired by US-99. Suggested fix: reframe the Massive material as history and describe Alpaca market data as the current source.
- ✗ **`settings:test-connection` is said to accept `{ vendor: 'massive' }` and probe `GET /v3/reference/tickers/AAPL`.** The schema accepts only `vendor: z.literal('alpaca')`: `src/main/schemas.ts:491-496`. No reference-tickers probe exists in `settings-connections.ts`.
- ✗ **`CredentialStatus` contract.** The page lists `massive` and `massiveLastCheckedAt` fields. The actual type has `marketData` in place of `massive` and has no `massiveLastCheckedAt`: `src/main/services/settings.ts:11-18`. The Decisions bullet about `massiveLastCheckedAt` staying null is therefore also stale.
- ✗ **"market-data-factory.ts continues loading Massive from shared app configuration."** Both factories share one `resolveAlpacaCredentials` resolver: `src/main/index.ts:151-158`.
- ✗ **"Confirming the switch refreshes broker state only — market-data polling … continue[s] uninterrupted" / "Market data is independent of broker configuration."** Market data now uses the active broker credentials (`src/main/index.ts:153-157`). The e2e test is titled "Switching broker environment restarts market data with the new keys" (`e2e/settings-environment.spec.ts:450`).
- ✗ **"invalidates only broker-prefixed queries after broker changes."** `hasVendorQueryKey` invalidates both the `broker` and `market` prefixes: `src/renderer/src/hooks/useSettings.ts:34-36,46`.
- ✗ **"Shared Massive configuration enables market data … even when no Alpaca credentials are configured."** The opposite now holds. The e2e test "Market data is enabled by the active Alpaca credentials" is at `e2e/settings-environment.spec.ts:309`, and the SettingsPage copy says "Connect Alpaca to enable market data" (`SettingsPage.tsx:539`).
- ✗ **"e2e … contains one scenario per acceptance criterion above."** The scenario titles no longer map to the Massive ACs: `:269` "Settings names Alpaca as the market-data source", `:598` "shows the Connect Alpaca banner", `:621` "Positions auth prompt names Alpaca". There is no Massive probe or shared-key scenario.

## Unverifiable (3)

- ? "The plan checklist is stale (`plans/us-37/tasks.md`)". The plan dirs have been deleted, so this is historical narrative.
- ? "plaintext credentials … never surfaced back to the renderer". This would need a full review of the IPC payloads. `CredentialStatus` carries only masked account numbers.
- ? The exact re-entry prompt wording for broker auth failures. It is partially covered by e2e `:656`.

## Missing files (0)

None.
