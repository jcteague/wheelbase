---
page: docs/spec/architecture/02-adrs/shared-massive-app-configuration.md
audited_at: 2026-06-27
findings: 0
---

# Audit: shared-massive-app-configuration.md

## Verified (5)

- ✓ Massive key loaded from shared app config, not user settings — `src/main/services/settings.ts:163` (`massive: loadMassiveApiKey().trim() ? 'configured' : 'missing'`).
- ✓ `CredentialStatus.massive` reports only `configured` or `missing` — `settings.ts:12` (`massive: CredentialState`), set at `:163`.
- ✓ `CredentialStatus.massiveLastCheckedAt` exists but is always `null` — `settings.ts:16` (field) and `:167` (`massiveLastCheckedAt: null`).
- ✓ Massive settings IPC flow is `settings:test-connection` with `{ vendor: 'massive' }` — `src/main/schemas.ts:434-436` (`TestConnectionPayloadSchema` discriminated union with `vendor: z.literal('massive')`); handled in `src/main/ipc/settings.ts:96-105` and `src/main/index.ts:84,101`.
- ✓ No save/remove Massive flow — save/remove/setActive credential functions in `settings.ts` (`:173,233,251`) are Alpaca-only; no Massive write path found.

## Drift (0)

None. No `credential_settings` Massive row found (`grep massive migrations/` returns nothing; only `006_add_credential_settings.sql` exists, Alpaca-oriented).

## Unverifiable (3)

- ? "broker changes recreate only the broker provider, while market data stays tied to shared configuration" — runtime lifecycle claim, partially covered by other ADRs; narrative here.
- ? "Massive auth failures drive quote-surface degraded states and `StaleDataBanner` but do not change `EnvironmentBadge`" — cross-component behavioral claim, not verified in this page's scope.
- ? "loads from shared app configuration/env/packaging" — `loadMassiveApiKey()` confirmed as the loader, but the specific env/packaging source is internal to that function.

## Missing files (0)

- `../../.extracts/us-37.md`, feature page — references.
