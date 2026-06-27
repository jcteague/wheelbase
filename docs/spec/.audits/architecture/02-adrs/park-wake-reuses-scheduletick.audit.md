---
page: docs/spec/architecture/02-adrs/park-wake-reuses-scheduletick.md
audited_at: 2026-06-27
findings: 1
---

# Audit: park-wake-reuses-scheduletick.md

## Verified (5)

- ✓ Park-wake reuses `scheduleTick(state, delayMs)` rather than a separate `state.parkTimerId` — `parkUntilNextOpen` calls `scheduleTick` for both the valid-nextOpen and fallback cases; `JobState` has only `timerId`, no `parkTimerId` — `src/main/services/polling-scheduler.ts:89,108,131,137`.
- ✓ Valid future `nextOpen` → `scheduleTick(state, wakeDelayMs)` + INFO log "job {name} parked until next market open at {nextOpen}" — `polling-scheduler.ts:124-131`.
- ✓ Stale/missing `nextOpen` → fallback `scheduleTick(state, marketOpenMs)` + WARN log — `polling-scheduler.ts:134-137`.
- ✓ `stop()` clears `state.timerId` unconditionally (single cleanup surface) — `polling-scheduler.ts:232`.
- ✓ e2e suite `e2e/polling-scheduler.spec.ts` exists.

## Drift (1)

- ✗ Minor: Page Consequences (line 19) says the logic is "`reschedule()` ... extended with an **`else` branch inside the interval-job block**". It was instead factored into a dedicated helper `parkUntilNextOpen(state, status, marketOpenMs)` called from `reschedule` (`polling-scheduler.ts:123-139,164`), not an inline `else` branch. Also the WARN message text in code reads "...scheduling fallback re-check **at marketOpenMs**" (line 135), a slightly longer string than the page's "...scheduling fallback re-check". Suggested fix: describe the `parkUntilNextOpen` helper and update the quoted log string.

## Unverifiable (1)

- ? "The e2e suite gained 3 new AC scenarios verifying park-wake timing" — exact scenario count not verified (file exists but scenarios not counted). Flag for human review.
