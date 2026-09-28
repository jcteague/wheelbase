---
page: docs/spec/architecture/02-adrs/runtime-broker-provider-refresh.md
audited_at: 2026-09-28
findings: 1
---

# Audit: runtime-broker-provider-refresh.md

## Verified (9)

- ✓ Broker handlers wired against an accessor `() => brokerFactory.create()` — `src/main/index.ts:166`.
- ✓ `onBrokerProviderChanged` calls `brokerFactory.recreate()` then `marketData.restartStockQuoteStream()`; market-data provider not recreated — `index.ts:175-191`.
- ✓ `restartStockQuoteStream` tears down and reconnects with remembered tickers — `src/main/services/market-data.ts:136-152`.
- ✓ `settings:set-active-broker-environment` always calls `onBrokerProviderChanged()` after parse — `src/main/ipc/settings.ts:90-99`.
- ✓ Save refreshes only when `result.refreshBroker`; remove refreshes only when the changed env was or became active (`refreshBrokerIfActive`) — `ipc/settings.ts:35-46, 61-87`.
- ✓ `activeBrokerEnv: 'none'` state — `src/main/services/settings.ts:8, 124, 145`; `marketData` is `'missing'` when `'none'` and no env fallback — `settings.ts:168`.
- ✓ Both factories default to `loadAlpacaCredentialsFromEnv` — `src/main/integrations/broker-factory.ts:6, 13`; `market-data-factory.ts:11-13`; market-data factory never throws.
- ✓ e2e `Switching broker environment restarts market data with the new keys` — `e2e/settings-environment.spec.ts:450`.
- ✓ `LiveBrokerConfirmDialog` copy "Market data reconnects with your live keys" — `src/renderer/src/components/LiveBrokerConfirmDialog.tsx:58`.

## Drift (1)

- ✗ Line 28: factories "are configured from `settings.loadActiveAlpacaCredentials()` in `index.ts`". They are configured with the shared `resolveAlpacaCredentials = () => settings.loadActiveAlpacaCredentials() ?? loadAlpacaCredentialsFromEnv()` — saved credentials first, then `.env` fallback — `src/main/index.ts:151-158`. Suggested fix: mention the env fallback (it is also why `marketData` can be `'configured'` with `activeBrokerEnv: 'none'`, `settings.ts:168`).

## Unverifiable (2)

- ? "Market-data requests continue uninterrupted" during a broker change — runtime behaviour.
- ? Rejected alternatives (restart app, service container) — design history.

## Missing files (0)

None.
