---
page: docs/spec/architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md
audited_at: 2026-06-27
findings: 0
---

# Audit: ivr-non-trading-day-guard-in-collector.md

## Verified (3)

- ✓ Guard runs at the top of `collectIVRSnapshots(...)`: `const marketStatus = await brokerProvider.getMarketStatus()` at `src/main/services/ivr-collector.ts:112`, before any fetch loop.
- ✓ Short-circuits with `skippedReason: 'market_closed'` (`ivr-collector.ts:120`; the batch-result type declares `skippedReason: 'market_closed' | null` at `:15`).
- ✓ Both entry points share the collector: the scheduled job handler in `src/main/index.ts:208-212` resolves the broker and calls `collectIVRSnapshots(...)`; the IPC path is registered via `registerIvrIpc` (`src/main/index.ts:15`). The guard living in the collector means both share the code path as claimed.

## Drift (0)

## Unverifiable (0)

## Missing files (0)

- ✓ `src/main/services/ivr-collector.ts`, `src/main/index.ts`, and `../../features/us-44-ivr-snapshot-store-and-scheduler.md` all exist.

One-line: Audited ivr-non-trading-day-guard-in-collector.md: 3 verified, 0 drift, 0 unverifiable, 0 missing.
