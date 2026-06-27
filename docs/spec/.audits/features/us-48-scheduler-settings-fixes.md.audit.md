---
page: docs/spec/features/us-48-scheduler-settings-fixes.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-48-scheduler-settings-fixes.md

## Verified (10)

- ✓ All 3 source files exist: `src/main/services/polling-scheduler.ts`, `src/main/services/scheduler-instance.ts`, `src/renderer/src/pages/SettingsPage.tsx`.
- ✓ `createPollingScheduler` signature is `(getBroker: () => BrokerProvider, clock?)` (polling-scheduler.ts:99-100) — matches the documented getter-injection change.
- ✓ Both internal call sites resolve fresh: `getBroker().getMarketStatus()` in `reschedule()` (line 145) and in `startAfterClose()` (line 188).
- ✓ `scheduler-instance.ts` passes the getter through: `createPollingScheduler(getSafeBroker)` (line 26), and `getSafeBroker()` returns a stub `BrokerProvider` (line 18).
- ✓ `stop()` timeout cleanup: captures `timeoutId` from `setTimeout(resolve, 5_000)` (lines 240-243) and clears it in `.finally(() => { if (timeoutId !== null) clock.clearTimeout(timeoutId) })` (lines 246-247).
- ✓ `stop()` fallback still fires: `Promise.race([drainPromise, timeoutPromise])` retains the 5s fallback (line 246).
- ✓ SettingsPage handlers all exist and wrap `mutateAsync` in try/catch surfacing `getApiErrorMessage(error)`: `handleTestConnection` (line 149, catch 169-170), `handleStoredConnectionTest` (191, catch 211-212), `handleMassiveTestConnection` (386, catch 397-398).
- ✓ `getApiErrorMessage` is an existing helper in SettingsPage.tsx (line 54).
- ✓ Spec link `./us-46-polling-scheduler.md` resolves.

## Drift (0)

None.

## Unverifiable (1)

- ? "swapping broker credentials propagates without app restart" — behavioral claim; the getter-per-tick structure supports it but the end-to-end propagation is not mechanically grepable.

## Missing files (0)

None.
