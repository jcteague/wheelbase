---
page: docs/spec/architecture/02-adrs/runtime-broker-provider-refresh.md
audited_at: 2026-06-27
findings: 0
---

# Audit: runtime-broker-provider-refresh.md

## Verified (5)

- ✓ `broker-factory.ts` exists and reloads the active Alpaca environment from persisted settings via `loadActiveAlpacaCredentials()` (`src/main/integrations/broker-factory.ts:8,12,25`).
- ✓ `src/main/index.ts` wires broker IPC handlers against a current-provider accessor: `registerBrokerHandlers(() => brokerFactory.create())` (`src/main/index.ts:156`).
- ✓ Settings mutations trigger broker refresh only when broker state changed: `onBrokerProviderChanged` hook calls `brokerFactory.recreate()` (`src/main/index.ts:160-162`); IPC layer gates via `refreshBrokerIfActive` / `result.refreshBroker` (`src/main/ipc/settings.ts:29,62,78`).
- ✓ `settings:set-active-broker-environment` handler registered and triggers refresh after validation (`src/main/ipc/settings.ts:83,90`).
- ✓ Broker-unconfigured state represented as `'none'`: `ActiveBrokerEnvironment = BrokerEnvironment | 'none'` (`src/main/services/settings.ts:8`), default/fallback to `'none'` (`:121,142,143,240`).

## Drift (0)

## Unverifiable (1)

- ? "Market-data requests continue uninterrupted / market-data factories unaffected by broker mutations" — the broker refresh path (`recreate()`) is isolated to the broker factory, consistent with the claim, but the non-interruption of market data is a behavioral property not directly grep-provable.

## Missing files (0)
