---
page: docs/spec/architecture/02-adrs/consolidated-before-quit.md
audited_at: 2026-06-27
findings: 1
---

# Audit: consolidated-before-quit.md

## Verified (4)

- ✓ Exactly one `app.on('before-quit', ...)` registration: `src/main/index.ts:259` (only match in the file).
- ✓ Handler calls `e.preventDefault()`: `src/main/index.ts:260`.
- ✓ Handler awaits `Promise.all([...])` of two shutdowns then calls `app.exit(0)`: `src/main/index.ts:261-262`.
- ✓ `scheduler.stop()` is one of the two awaited promises: `src/main/index.ts:261`.

## Drift (1)

- ✗ The ADR states the handler awaits `marketDataProvider.disconnect()`, but the code calls `marketDataFactory.disconnect()`: `src/main/index.ts:261`. The variable is `marketDataFactory`, not `marketDataProvider`. Suggested fix: update the ADR to name `marketDataFactory.disconnect()`.

## Unverifiable (1)

- ? "scheduler's `stop()` drains in-flight handler promises with a 5-second timeout" — drain/timeout behavior lives in the scheduler implementation, not asserted from `index.ts`; narrative for this page.

## Missing files (0)

- ✓ Feature page `../../features/us-46-polling-scheduler.md` and related `scheduler-singleton-safe-broker.md` exist.
