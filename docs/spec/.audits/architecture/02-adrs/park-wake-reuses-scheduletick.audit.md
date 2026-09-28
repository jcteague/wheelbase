---
page: docs/spec/architecture/02-adrs/park-wake-reuses-scheduletick.md
audited_at: 2026-09-28
findings: 0
---

# Audit: park-wake-reuses-scheduletick.md

## Verified (7)

- ✓ `scheduleTick(state, delayMs)` holds the single pending timer in `state.timerId` — `src/main/services/polling-scheduler.ts:120-125`; no `parkTimerId` exists in the file.
- ✓ `parkUntilNextOpen(state, status, marketOpenMs)` helper called from `reschedule()` when `decideNextCadenceMs` returns `null` — `polling-scheduler.ts:152-167, 187-193`.
- ✓ Valid future `nextOpen` → `scheduleTick(state, wakeDelayMs)` + INFO `job {name} parked until next market open at {nextOpen}` — `polling-scheduler.ts:155-160`.
- ✓ Missing/unparseable/past `nextOpen` (NaN or ≤ 0 delay) → `scheduleTick(state, marketOpenMs)` + WARN `nextOpen was unusable for {name}; scheduling fallback re-check at marketOpenMs` — `polling-scheduler.ts:153-154, 161-166`.
- ✓ `stop()` clears `state.timerId` unconditionally — `polling-scheduler.ts:286-292`.
- ✓ `marketOpenMs` is required on interval cadences — `polling-scheduler.ts:7`.
- ✓ e2e `e2e/polling-scheduler.spec.ts` has three US-49 scenarios (AC-1 park-wake, AC-4 after-hours park, AC-5 clean shutdown with pending park timer) — `:260, :281, :299`.

## Drift (0)

None.

## Unverifiable (2)

- ? Rejection of zero-delay re-fetch (busy-loop risk) — rationale.
- ? "`stop()`, `scheduleTick()`, and the public interface are unchanged" — historical claim relative to US-49.

## Missing files (0)

None.
