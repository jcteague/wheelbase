---
page: docs/spec/architecture/02-adrs/alpaca-credentials-runtime-env-only.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/alpaca-credentials-runtime-env-only.md

## Verified (9)

- ✓ `loadAlpacaCredentialsFromEnv()` in `src/main/integrations/alpaca-credentials.ts:22`.
- ✓ Shared default for both factories — `src/main/integrations/broker-factory.ts:6,13` and `src/main/integrations/market-data-factory.ts:3,12`.
- ✓ Reads only `process.env.ALPACA_KEY_ID`, `ALPACA_SECRET_KEY`, `ALPACA_PAPER`; empty value → `null` — `alpaca-credentials.ts:23-32`. No `import.meta.env` read of Alpaca keys in `src/main` (only Finnhub/log level use it: `src/main/integrations/finnhub-credentials.ts:4`, `src/main/logger.ts:9`).
- ✓ `.env.example` says there is deliberately no way to configure Alpaca from the file and shows the export form — `.env.example:18,25`.
- ✓ Saved (safeStorage) credentials take priority — `src/main/index.ts:152` (`settings.loadActiveAlpacaCredentials() ?? loadAlpacaCredentialsFromEnv()`).
- ✓ `CredentialStatus.marketData = activeBrokerEnv !== 'none' || hasFallbackCredentials()` — `src/main/services/settings.ts:168`.
- ✓ `hasFallbackCredentials` is a required option (`() => boolean`, no `?`) — `src/main/services/settings.ts:78`; wired in `src/main/index.ts:145` to `loadAlpacaCredentialsFromEnv() !== null`.
- ✓ e2e harness `buildLaunchEnv` / `withoutBrokerCredentials` — `e2e/assignment-helpers.ts:54,126,147`.
- ✓ `src/main/env.d.ts:3-5` still declares `MAIN_VITE_ALPACA_*` types, and no code reads them.

## Drift (0)

## Unverifiable (2)

- ? electron-vite build-time inlining behaviour of `MAIN_VITE_*` / computed `import.meta.env[name]` — toolchain behaviour, not code.
- ? History that market data once read `.env` while the broker ignored it — narrative.

## Missing files (0)

- (none) — `docs/us-99-implementation.md`, `../../.extracts/us-99.md`, `../../features/us-99-alpaca-market-data-provider.md` exist.
