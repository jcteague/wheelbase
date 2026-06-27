---
page: docs/spec/features/us-44-ivr-snapshot-store-and-scheduler.md
audited_at: 2026-06-27
findings: 0
---

# Audit: us-44-ivr-snapshot-store-and-scheduler.md

## Verified (16)

- ✓ All 18 listed source files exist.
- ✓ Migration `007_create_ivr_snapshot.sql` creates `ivr_snapshot` with `underlying, observed_at, ivr, nullable ivp/iv30, source TEXT NOT NULL DEFAULT 'barchart'`, PK `(underlying, observed_at)` — `migrations/007_create_ivr_snapshot.sql:1-8`.
- ✓ Index `idx_ivr_snapshot_underlying_observed_at_desc ON ivr_snapshot (underlying, observed_at DESC)` — `migrations/007_create_ivr_snapshot.sql:11-12`.
- ✓ `collectIVRSnapshots({ db, brokerProvider, logger, fetchIvr?, clock? })` with injectable `fetchIvr`/`clock` seams — `src/main/services/ivr-collector.ts:104-109,27-28`.
- ✓ `CollectIVRSnapshotsResult` type with `skippedReason: 'market_closed' | null` — `src/main/services/ivr-collector.ts:11-15`.
- ✓ Target selection: distinct tickers `WHERE status != 'CLOSED'` — `src/main/services/ivr-collector.ts:34`.
- ✓ 1 req/sec spacing via `clock.sleep(1000)` between requests — `src/main/services/ivr-collector.ts:98-100`.
- ✓ IPC handler `ivr:collect-now` calls `scheduler.runNow(IVR_COLLECT_JOB_NAME)` and validates via `CollectIvrNowBatchSchema` — `src/main/ipc/ivr.ts:8,13`.
- ✓ `runNow` resets cadence (clears existing timer, then reschedules) — `src/main/services/polling-scheduler.ts:257-260,270`.
- ✓ `CollectIvrNowBatchSchema` in schemas: non-negative int counts + nullable `skippedReason` enum `['market_closed']` — `src/main/schemas.ts:147-151`.
- ✓ Job `ivr-collect` registered with `{ kind: 'afterClose', offsetMinutes: 60 }` and resolves broker at run time — `src/main/index.ts:20,209`.
- ✓ Preload exposes `window.api.ivr.collectNow()` — `src/preload/index.ts:71-72`.
- ✓ `CollectIvrNowResult` renderer type + `collectIvrNow()` adapter — `src/renderer/src/api/ivr.ts:5,12-13`.
- ✓ `useCollectIvrNow` mutation hook — `src/renderer/src/hooks/useCollectIvrNow.ts:4`.
- ✓ Dev-only `_test:ivr-*` IPC exists (`test-ivr.ts`, preload lines 80-81).
- ✓ All `../`-relative links resolve (`schema/tables.md`, `schema/migrations.md`, `contracts/ipc-handlers.md`, `contracts/zod-schemas.md`, `features/us-43-...`, `features/us-46-...`).

## Drift (0)

## Unverifiable (1)

- ? Same-day overwrite "delete-then-insert keyed on UTC calendar date" and the non-trading-day guard logging are described in prose and present structurally in `ivr-collector.ts`; exact transactional/UTC-date behavior is exercised by the e2e/unit tests rather than confirmed by static grep.

## Missing files (0)
