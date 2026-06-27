---
page: docs/spec/architecture/02-adrs/polling-scheduler-settimeout-chain.md
audited_at: 2026-06-27
findings: 0
---

# Audit: polling-scheduler-settimeout-chain.md

## Verified (3)

- ✓ Scheduler uses `setTimeout` (injectable `clock.setTimeout`), not `setInterval` (`src/main/services/polling-scheduler.ts:83,110`). Grep for `setInterval` in the file returns NONE.
- ✓ Next tick is scheduled after the handler settles, forming a chain: `state.timerId = clock.setTimeout(() => void tick(state), delayMs)` re-armed inside `tick` (`src/main/services/polling-scheduler.ts:110-114`).
- ✓ `node-cron` and `rxjs` are not used by the scheduler — grep of the file finds neither import; only plain timer primitives.

## Drift (0)

## Unverifiable (2)

- ? "logged WARN on rejection" — plausible but the specific WARN log path was not grepped here; narrative-adjacent.
- ? "system sleep cannot accumulate missed ticks" — a behavioral property of one pending timer per job; consistent with the single-`timerId`-per-job design (`src/main/services/polling-scheduler.ts:89`) but not directly testable by grep.

## Missing files (0)
