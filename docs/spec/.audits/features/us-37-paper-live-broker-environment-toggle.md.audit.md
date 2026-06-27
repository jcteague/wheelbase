---
page: docs/spec/features/us-37-paper-live-broker-environment-toggle.md
audited_at: 2026-06-27
findings: 1
---

# Audit: us-37-paper-live-broker-environment-toggle.md

## Verified (24)

- ✓ All 21 listed source files exist (migration, services, ipc, integrations, renderer, e2e).
- ✓ Migration `006_add_credential_settings.sql` creates `credential_settings` with columns `vendor, environment, key_id_encrypted, secret_encrypted, last_verified_at, account_number_masked, created_at, updated_at` and PK `(vendor, environment)` — `migrations/006_add_credential_settings.sql:1-10`.
- ✓ Migration creates `app_settings` with `key (PK), value, updated_at` — `migrations/006_add_credential_settings.sql:13-16`.
- ✓ All 6 IPC handlers registered: `settings:get-credential-status`, `:save-alpaca-credentials`, `:remove-alpaca-credentials`, `:set-active-broker-environment`, `:test-connection`, `:test-stored-alpaca-connection` — `src/main/ipc/settings.ts:48,54,69,83,96,109`.
- ✓ Settings service exposes `getCredentialStatus`, `saveAlpacaCredentials`, `removeAlpacaCredentials`, `setActiveBrokerEnvironment`, `loadAlpacaCredentials`, `loadActiveAlpacaCredentials` — `src/main/services/settings.ts:284-290`.
- ✓ Mismatch helpers `isLikelyLiveKey`/`isLikelyPaperKey` exist and are used per-environment — `src/main/services/settings-connections.ts:93,97,162,170`.
- ✓ `save-verified-alpaca-credentials.ts` returns `{ status, test, refreshBroker }` — `src/main/services/save-verified-alpaca-credentials.ts:68-70`.
- ✓ `CredentialStatus` shape matches documented fields including `massiveLastCheckedAt: null` in current impl — `src/main/services/settings.ts:12-18,167`.
- ✓ All `../`-relative links resolve (`contracts/ipc-handlers.md`, `contracts/zod-schemas.md`, `contracts/alpaca-integration.md`, `schema/tables.md`, `schema/migrations.md`).
- ✓ All 4 `[[wikilink]]` ADR targets exist: `shared-massive-app-configuration.md`, `runtime-broker-provider-refresh.md`, `vendor-scoped-query-keys.md`, `save-verified-alpaca-service.md` in `docs/spec/architecture/02-adrs/`.

## Drift (1)

- ✗ Page (line 27) claims `e2e/settings-environment.spec.ts` "contains one scenario per acceptance criterion above" (14 ACs). The spec actually has 17 `test(`/`it(` blocks — more coverage than stated. Minor; the claim understates rather than overstates. Suggested fix: soften to "at least one scenario per AC".

## Unverifiable (0)

## Missing files (0)
