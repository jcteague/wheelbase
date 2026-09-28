---
page: docs/spec/architecture/02-adrs/polling-scheduler-settimeout-chain.md
audited_at: 2026-09-28
findings: 3
---

# Audit: polling-scheduler-settimeout-chain.md

## Verified (3)

- ✓ No `setInterval` in `src/main/services/polling-scheduler.ts`; each job has a single `clock.setTimeout` chain via `scheduleTick` — `polling-scheduler.ts:120-127`.
- ✓ Handler rejection is caught and logged at WARN — `polling-scheduler.ts:141-148`.
- ✓ Per-tick cadence re-evaluated against the current market session before scheduling the successor (`reschedule` → `decideNextCadenceMs`) — `polling-scheduler.ts:169-199`.

## Drift (1)

- ✗ Alternatives (line 18): "rxjs `interval()` … the project does not already use rxjs". `rxjs` `^7.8.2` is a dependency (`package.json:51`) and is used by the market-data stream (`Subject`, `defer`, `filter` in `src/main/integrations/alpaca-market-data.ts:69, 519-521`; `Subscription` in `src/main/services/market-data.ts:22`). Suggested fix: drop or reword the "does not use rxjs" reason.

## Unverifiable (2)

- ? "System sleep cannot accumulate missed ticks" — runtime behaviour, not mechanically checked.
- ? `node-cron` rejection rationale — design history.

## Missing files (2)

- ✗ Source `plans/us-35/research.md` — `plans/us-35/` no longer exists.
- ✗ Source `plans/us-35/green-phase-results.md` — same.
