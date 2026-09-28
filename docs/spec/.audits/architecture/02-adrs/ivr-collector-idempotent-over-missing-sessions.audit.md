---
page: docs/spec/architecture/02-adrs/ivr-collector-idempotent-over-missing-sessions.md
audited_at: 2026-09-28
findings: 9
---

# Audit: docs/spec/architecture/02-adrs/ivr-collector-idempotent-over-missing-sessions.md

## Verified (8)

- ✓ `collectIvHistoryBatch` takes no `trigger` — `CollectIvHistoryBatchInput`, `src/main/services/ivr-collector.ts:25-39`; `collectIVRSnapshots` absent from `src/`.
- ✓ No closed-day guard — header comment `ivr-collector.ts:5-7`.
- ✓ Step 1: recompute first — `src/main/services/iv-history.ts:206`.
- ✓ Step 2: 253 required sessions (`REQUIRED_SESSIONS = RANK_WINDOW_SESSIONS + 1`, `iv-history.ts:59`), newest counted only `BAR_SETTLE_MINUTES = 45` after close (`:76,80-86`).
- ✓ Step 3/4: subtract readings + gaps, return `up_to_date` with no provider call, else fetch from the oldest missing session — `iv-history.ts:213-226`, `probeMissingSessions` (`:140-143`).
- ✓ `skippedReason` is `'market_data_unavailable' | null` — no `'market_closed'` (`ivr-collector.ts:22`; grep of `market_closed` in non-test `src/` is empty).
- ✓ `JobRunContext.trigger` remains (`src/main/services/polling-scheduler.ts:17`), `_test:scheduler-run-scheduled` exists (`src/main/ipc/test-scheduler.ts:55`), and no job consumes `trigger` (grep).
- ✓ Superseded ADRs and `plans/us-121/contracts/ivr-collect-now.md` exist.

## Drift (0)

None.

## Unverifiable (1)

- ? "A same-session rerun no longer overwrites anything" — follows from the `up_to_date` path, though `persistIvHistory` still upserts (`src/main/services/iv-history-store.ts:62`) when a session is re-probed; not reachable for an already-read session. Flag for review only.

## Missing files (0)

None.
