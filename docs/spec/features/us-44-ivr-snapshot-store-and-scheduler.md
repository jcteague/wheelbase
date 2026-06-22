# US-44: IVR snapshot store and scheduler

<!-- generated:from us-44 -->

## Summary

US-44 adds the first persisted IVR storage path to the app. It introduces a SQLite `ivr_snapshot` table, a main-process collector service (`collectIVRSnapshots`) that batches active-position tickers through the existing Barchart scraper, and a registration with the shared polling scheduler so the collection job runs once per market day after close. The collector owns its own rate limiting (1 request/second), same-day overwrite semantics, and a non-trading-day guard so both the scheduled and manual paths stay safe.

It also exposes a manual "Refresh IVR now" action in the Settings page Market Data section. The renderer triggers the same batch path on demand through a dedicated IVR IPC namespace and receives a typed batch summary (success/error/skipped counts) so the user gets inline feedback about the run.

## Acceptance criteria

- **Migration creates `ivr_snapshot`** — a migration creates the table with `underlying`, `observed_at`, `ivr`, nullable `ivp`/`iv30`, and `source DEFAULT 'barchart'`, primary key `(underlying, observed_at)`, plus an index on `(underlying, observed_at DESC)`.
- **Collector runs once per market day after close** — when the scheduler fires (configured for after close on trading days), `collectIVRSnapshots()` is invoked.
- **Collector picks up all active-position underlyings** — for positions in non-CLOSED phases, the collector calls `fetchIVR` for each distinct underlying with requests spaced at least 1 second apart.
- **Successful snapshot is persisted** — an `ok` scraper result is inserted as a row keyed by `(underlying, observed_at)` with the decimal-string `ivr`.
- **Re-running on the same calendar day overwrites the existing row** — a second run the same day replaces the prior row's `observed_at`/`ivr` with no unique-constraint exception.
- **Not-available ticker is recorded but with no row written** — a `not_available` result writes no row and emits an INFO log noting the ticker is not covered by Barchart IVR.
- **Parse error is logged and the collector continues** — a `parse_error` result emits a WARN log and the batch continues to the next ticker without aborting.
- **Manual trigger from settings** — clicking "Refresh IVR now" runs the collector immediately for all active-position underlyings and returns the batch summary (success/error counts) to the renderer.
- **Market is closed on a non-trading day** — on a weekend/holiday the collector calls `BrokerProvider.getMarketStatus()`, detects a non-trading day, exits without any network requests, and logs the skip reason.

## What was built

The collector service `collectIVRSnapshots` lives in `src/main/services/ivr-collector.ts`. Its signature accepts `{ db, brokerProvider, logger, fetchIvr?, clock? }`, where `fetchIvr` and `clock` are optional injectable seams for tests (fake fetch / clock). It derives collection targets directly from the `positions` table — distinct `ticker` values where `status != 'CLOSED'`, normalized to uppercase, de-duplicated, and sorted alphabetically for deterministic batch order — keeping the collector independent of renderer list queries. It builds on `fetchIVR` from `src/main/integrations/barchart-ivr-scraper.ts` (see [US-43](./us-43-barchart-ivr-scraper.md)) and persists `source = 'barchart'`.

The collector enforces the 1 request/second politeness rule itself (a sequential loop with a sleep boundary) so concurrent callers cannot bypass it, even though the scraper module also throttles internally. Each scraper outcome is counted: an `ok` result is persisted and counts as a success; `not_available` writes no row, logs INFO, and counts as skipped; `parse_error`/`network_error`/`rate_limited`/`invalid_input` count as errors, log WARN, and the batch continues. Persistence applies same-day overwrite semantics: inside a transaction it deletes any existing row for the same `(underlying, UTC-calendar-date(observed_at))` before inserting the fresh row, so the latest same-day value wins despite the `(underlying, observed_at)` primary key.

A non-trading-day guard sits at the top of `collectIVRSnapshots`. When `BrokerProvider.getMarketStatus()` reports a closed, non-trading day it returns an `ok` batch summary of `successCount=0, errorCount=0, skippedCount=0, skippedReason='market_closed'` before any fetch. Because the guard lives in the collector, both the scheduled path and the manual trigger share one code path and one logging decision.

The scheduler job `ivr-collect` is registered in `src/main/index.ts` before `scheduler.start()`, with `afterClose` cadence and `offsetMinutes: 60`. The handler resolves the active broker via `brokerFactory.create()` at run time (avoiding a stale captured provider) and calls `collectIVRSnapshots`, returning the batch summary so the manual trigger can surface it. See [US-46](./us-46-polling-scheduler.md) for the shared scheduler.

The manual trigger uses a dedicated IVR IPC namespace: the main handler `ivr:collect-now` in `src/main/ipc/ivr.ts` calls `scheduler.runNow('ivr-collect')` (which also resets the cadence clock to now), validates the resulting batch via `CollectIvrNowBatchSchema`, and returns the summary unchanged. The handler accepts no renderer-supplied tickers or timing overrides — target selection stays in the collector. The preload exposes it as `window.api.ivr.collectNow()`; the renderer adapter in `src/renderer/src/api/ivr.ts` normalizes the envelope to `CollectIvrNowResult` and throws the existing `ApiError` shape on `{ ok: false }`. A small mutation hook, `useCollectIvrNow`, wires the action into the Market Data section of `SettingsPage.tsx`, which shows `successCount`/`errorCount` on success, a muted/warning message when `skippedReason === 'market_closed'`, and `getApiErrorMessage(error)` on rejection. Renderer logic stays thin (no ticker selection or market-status branching in the component). A local `MessageText` helper renders IVR and Massive status messages through one tone-class path.

Known limitation: the trading-day guard only detects weekends, not weekday market holidays. This is deferred — see `docs/epics/06-stories/followup-ivr-trading-day-calendar.md`.

## Architecture decisions

- **Migration numbered 007, not 008** — the `007` slot was an unfilled gap (`006` and `008` already existed); filling it keeps the lexicographically-sorted migration sequence contiguous. See [migrations](../schema/migrations.md).
- **Barchart as the canonical IVR source** — the collector builds on the existing `fetchIVR` typed `IVRResult` union and persists `source = 'barchart'`; no multi-vendor abstraction since only one source exists.
- **Same-day overwrite via delete-then-insert** — because the primary key is `(underlying, observed_at)`, a later-timestamped same-day run will not naturally replace the earlier row; an explicit delete-then-insert keyed on the UTC calendar date makes the latest value win while retaining the exact observation timestamp. See [tables](../schema/tables.md).
- **Collector-level throttling boundary** — the 1 req/sec rule is enforced in the collector (not only in the scraper module) so interleaved invocations cannot bypass batch spacing.
- **Active-underlying selection from `positions`** — targets are distinct `ticker` where `status != 'CLOSED'`, keeping the collector decoupled from renderer-facing `listPositions()`.
- **Dedicated IVR IPC surface** — a separate `ivr:*` namespace (handler, preload, renderer adapter, hook) rather than overloading `settings.ts`, matching the existing per-feature IPC-namespace pattern. See [ipc-handlers](../contracts/ipc-handlers.md).
- **Non-trading-day guard inside the collector** — placed at the top of `collectIVRSnapshots` so the scheduled and manual paths share one guard and one skip-logging decision.
- **Settings-page placement** — the action extends the existing Market Data section as a secondary action with inline feedback (no US-44 mockup exists, so no new page/panel was invented).

## Contracts touched

- `ivr:collect-now` — IPC handler (no request payload); returns `{ ok: true, batch: { successCount, errorCount, skippedCount, skippedReason: 'market_closed' | null } }` or the standard `{ ok: false, errors, code? }` envelope. See [ipc-handlers](../contracts/ipc-handlers.md).
- `CollectIvrNowBatchSchema` — Zod schema in `src/main/schemas.ts` validating the batch summary (`successCount`/`errorCount`/`skippedCount` non-negative ints, `skippedReason` enum `['market_closed']` nullable). No request schema (no payload). See [zod-schemas](../contracts/zod-schemas.md).
- `CollectIvrNowResult` — renderer adapter type in `src/renderer/src/api/ivr.ts` (the batch summary shape).
- `ivr-collect` — scheduler job registration in `src/main/index.ts` (`afterClose` cadence, `offsetMinutes: 60`).
- `CollectIVRSnapshotsResult` — service result type returned by `collectIVRSnapshots` (`successCount`, `errorCount`, `skippedCount`, `skippedReason`).

## Source files

- `migrations/007_create_ivr_snapshot.sql`
- `src/main/services/ivr-collector.ts`
- `src/main/services/polling-scheduler.ts`
- `src/main/services/scheduler-instance.ts`
- `src/main/integrations/barchart-ivr-scraper.ts`
- `src/main/integrations/fake-ivr.ts` — test-only fake IVR collaborators seam
- `src/main/ipc/ivr.ts`
- `src/main/ipc/test-ivr.ts` — dev-only `_test:ivr-*` IPC
- `src/main/ipc/test-scheduler.ts`
- `src/main/schemas.ts`
- `src/main/index.ts`
- `src/preload/index.ts`
- `src/preload/index.d.ts`
- `src/renderer/src/api/ivr.ts`
- `src/renderer/src/hooks/useCollectIvrNow.ts`
- `src/renderer/src/pages/SettingsPage.tsx`
- `e2e/ivr-collector.spec.ts`
- `e2e/ivr-helpers.ts` — e2e helper

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
