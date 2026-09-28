---
page: docs/spec/architecture/02-adrs/shared-massive-app-configuration.md
audited_at: 2026-09-28
findings: 1
---

# Audit: shared-massive-app-configuration.md

## Verified (6)

- ✓ Superseded banner: no Massive code remains — `grep -rli "massive\|syncswimmer" src` returns nothing (no `CredentialStatus.massive`, no `testMassiveConnection`).
- ✓ `CredentialStatus.marketData: 'configured' | 'missing'` — `src/main/services/settings.ts:9,12`; derived as `activeBrokerEnv !== 'none' || hasFallbackCredentials()` — `settings.ts:168`.
- ✓ `settings:test-connection` accepts only `{ vendor: 'alpaca', environment, keyId, secret }` — `TestConnectionPayloadSchema`, `src/main/schemas.ts:491-496`; handler at `src/main/ipc/settings.ts:103-112`.
- ✓ Settings "Market Data — Alpaca" region explains IEX stock prices, indicative option quotes and Greeks from Alpaca using the active broker credentials, with no test button (only "Refresh IVR now") — `src/renderer/src/pages/SettingsPage.tsx:545-575`.
- ✓ Links `./alpaca-sole-market-data-vendor.md` and `./market-data-lazy-credentials-stream-restart.md` exist.
- ✓ Links `../../.extracts/us-37.md`, `../../.extracts/us-99.md`, `../../features/us-37-paper-live-broker-environment-toggle.md`, `../../features/us-99-alpaca-market-data-provider.md` exist.

## Drift (0)

None. The Decision / Context / Alternatives sections are explicitly marked "(historical)" and are not present-tense claims about the code.

## Unverifiable (1)

- ? "The broker environment toggle does now affect market-data auth … and restarts the stock stream" — delegated to the linked ADR; not re-audited here.

## Missing files (0)

None.
