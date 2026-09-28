---
page: docs/spec/features/us-48-scheduler-settings-fixes.md
audited_at: 2026-09-28
findings: 3
---

# Audit: us-48-scheduler-settings-fixes.md

## Verified (7)

- ✓ All three listed source files exist: `src/main/services/polling-scheduler.ts`, `src/main/services/scheduler-instance.ts`, `src/renderer/src/pages/SettingsPage.tsx`.
- ✓ The scheduler dependency is a getter resolved fresh per call in both `reschedule()` and `startAfterClose()` — `getStatusSource().getMarketStatus()` at `src/main/services/polling-scheduler.ts:174,212`. (The getter's type has changed; see Drift.)
- ✓ The singleton passes a getter through rather than calling it at import time — `src/main/services/scheduler-instance.ts:36`.
- ✓ `stop()` captures the drain-fallback timer id and clears it in `.finally` — `polling-scheduler.ts:265-272`; the 5 s fallback still resolves `stop()` when the drain stalls (`:266-268`).
- ✓ `handleTestConnection` wraps its await in try/catch and sets `{ tone: 'error', text: getApiErrorMessage(error) }` — `SettingsPage.tsx:153-173`.
- ✓ `handleStoredConnectionTest` does the same — `SettingsPage.tsx:192-212`.
- ✓ `getApiErrorMessage` falls back to `'Unable to complete the request'` — `SettingsPage.tsx:58-70`.

## Drift (3)

- ✗ **The getter type is no longer a broker.** The page says the signature is `(getBroker: () => BrokerProvider, clock?)` and that the call sites are `getBroker().getMarketStatus()`. The code has `createPollingScheduler(getStatusSource: () => MarketStatusSource, clock)` — `src/main/services/polling-scheduler.ts:111-114`. Market status now comes from the market-data port.
- ✗ **`getSafeBroker` no longer exists.** The page says `scheduler-instance.ts` calls `createPollingScheduler(getSafeBroker)` and that `getSafeBroker` returns a stub `BrokerProvider` before `brokerFactory.configure()`. The code has `createPollingScheduler(() => statusSource)`, where `statusSource` wraps `marketDataFactory.create()` and degrades only on `MarketDataError` `auth_failed` — `src/main/services/scheduler-instance.ts:23-36`. A grep for `getSafeBroker` in `src/` returns nothing.
- ✗ **`handleMassiveTestConnection` does not exist.** The page (What was built, Source files) lists it as a current handler in `SettingsPage.tsx`, and one AC names a "Market Data → Massive" Test Connection. A grep for `handleMassiveTestConnection` in `src/renderer` returns nothing; Massive was retired by US-99. That AC and handler should be framed as history or removed.

## Unverifiable (2)

- ? "swapping broker credentials propagates without app restart" is a runtime behaviour. The getter structure supports it, but it cannot be verified statically.
- ? The handlers are described as wrapping `mutateAsync` directly. The code awaits `onTestConnection` / `onTestStoredConnection` props (`SettingsPage.tsx:155,194`), whose implementations were not traced.

## Missing files (0)
