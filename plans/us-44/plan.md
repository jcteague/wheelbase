# Implementation Plan: US-44 — Persist IVR snapshots and schedule daily collection

## Summary

This story adds the first persisted IVR storage path to the app: a SQLite `ivr_snapshot` table, a main-process collector service that batches active-position tickers through the existing Barchart scraper, and a shared scheduler registration that runs the collection job after market close. It also exposes a manual `Refresh IVR now` action in Settings so the renderer can trigger the same batch path on demand and receive a typed summary of the run.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/06-stories/US-44-ivr-snapshot-store-and-scheduler.md`
- **Research & Design Decisions:** `plans/us-44/research.md`
- **Data Model & Selection Logic:** `plans/us-44/data-model.md`
- **API Contract(s):** `plans/us-44/contracts/ivr-collect-now.md`
- **Quickstart & Verification:** `plans/us-44/quickstart.md`

## Prerequisites

- `src/main/integrations/barchart-ivr-scraper.ts` already provides `fetchIVR(ticker)` and the `IVRResult` union from US-43.
- `src/main/services/polling-scheduler.ts` and `src/main/services/scheduler-instance.ts` already provide the shared scheduler singleton from US-46.
- `src/main/index.ts` already registers the `detect-assignments` job and starts the scheduler once after registration.
- `src/renderer/src/pages/SettingsPage.tsx` already hosts operational market-data actions and inline status messages.

## AC Audit

Every acceptance criterion from the story is represented as a named e2e test in Area 5:

- `Collector runs once per market day after close` → `AC: Collector runs once per market day after close`
- `Collector picks up all active-position underlyings` → `AC: Collector picks up all active-position underlyings`
- `Successful snapshot is persisted` → `AC: Successful snapshot is persisted`
- `Re-running on the same calendar day overwrites the existing row` → `AC: Re-running on the same calendar day overwrites the existing row`
- `Not-available ticker is recorded but with no row written` → `AC: Not-available ticker is recorded but with no row written`
- `Parse error is logged and the collector continues to the next ticker` → `AC: Parse error is logged and the collector continues to the next ticker`
- `Manual trigger from settings` → `AC: Manual trigger from settings`
- `Market is closed on a non-trading day` → `AC: Market is closed on a non-trading day`

## Implementation Areas

### 1. Snapshot Persistence and Collector Service

**Files to create or modify:**

- `migrations/007_create_ivr_snapshot.sql` — create the `ivr_snapshot` table and `(underlying, observed_at DESC)` index from `plans/us-44/data-model.md`
- `src/main/db/migrate.test.ts` — assert the new migration is applied and the table/index exist
- `src/main/services/ivr-collector.ts` — add the batch collector, same-day overwrite transaction, active-underlying selection, collector-owned throttling, and batch summary result type
- `src/main/services/ivr-collector.test.ts` — add focused collector tests around selection, persistence, overwrite, skip, and continue behavior

**Red — tests to write:**

- In `src/main/db/migrate.test.ts`, add a test `applies 007_create_ivr_snapshot.sql and creates ivr_snapshot with latest-first index` that runs migrations against a temp DB and asserts the table columns plus the `(underlying, observed_at DESC)` index exist.
- In `src/main/services/ivr-collector.test.ts`, add `returns early and logs skip when BrokerProvider reports a non-trading day` that stubs `getMarketStatus()` to a weekend/holiday-closed shape, asserts no `fetchIVR` calls occur, and expects `{ successCount: 0, errorCount: 0, skippedCount: 0, skippedReason: 'market_closed' }`.
- In `src/main/services/ivr-collector.test.ts`, add `selects distinct active-position tickers only and spaces requests by at least 1 second` that seeds active and closed `positions`, injects duplicate active tickers, uses fake timers or a clock seam, and asserts `fetchIVR` is called once each for the active distinct set with 1000 ms spacing.
- In `src/main/services/ivr-collector.test.ts`, add `persists a successful Barchart snapshot as decimal strings` that stubs `fetchIVR('SPY')` to return `status: 'ok'` and asserts the inserted row stores `ivr`, optional `ivp`, optional `iv30`, `observed_at`, and `source = 'barchart'`.
- In `src/main/services/ivr-collector.test.ts`, add `re-running on the same UTC calendar day deletes the older row before inserting the fresh row` that seeds an earlier SPY row for `2026-05-29`, runs the collector again with a later `observedAt`, and asserts a single SPY row remains for that date with the fresh values.
- In `src/main/services/ivr-collector.test.ts`, add `does not persist not_available results and logs the uncovered symbol at INFO` that stubs `fetchIVR` to return `status: 'not_available'`, asserts no insert occurs, and expects the info log message from `plans/us-44/research.md`.
- In `src/main/services/ivr-collector.test.ts`, add `logs parse_error and continues to the next ticker without aborting the batch` that seeds two active tickers, returns `parse_error` for the first and `ok` for the second, and asserts the second row still persists and `errorCount` increments.

**Green — implementation:**

- Create `migrations/007_create_ivr_snapshot.sql` with the exact table shape from `plans/us-44/data-model.md`, using `source TEXT NOT NULL DEFAULT 'barchart'`.
- Implement `collectIVRSnapshots` in `src/main/services/ivr-collector.ts` as a service-layer function that accepts `{ db, brokerProvider, logger, fetchIvr?, clock? }`, calls `brokerProvider.getMarketStatus()` first, and returns the `CollectIVRSnapshotsResult` defined in `plans/us-44/data-model.md`.
- In `src/main/services/ivr-collector.ts`, add a query against `positions` that selects distinct tickers where `status != 'CLOSED'`, normalizes/sorts them, and iterates sequentially.
- In `src/main/services/ivr-collector.ts`, add collector-owned throttling between per-ticker calls, independent from the internal throttling in `src/main/integrations/barchart-ivr-scraper.ts`, so concurrent batch callers cannot bypass the 1 req/sec rule described in `plans/us-44/research.md`.
- In `src/main/services/ivr-collector.ts`, add a same-day overwrite transaction that deletes existing rows for the same `underlying` and UTC date before inserting the fresh snapshot row.
- In `src/main/services/ivr-collector.ts`, handle `fetchIVR` outcomes exactly as specified in `plans/us-44/data-model.md`: persist `ok`, skip row writes for `not_available`, log and continue for `parse_error` / `network_error` / `rate_limited` / `invalid_input`.

**Refactor — cleanup to consider:**

- Extract small helpers inside `src/main/services/ivr-collector.ts` for `listActiveUnderlyings`, `persistSnapshot`, and `isTradingDay` if the test seams become clearer; keep the module in the service layer and avoid introducing a reusable abstraction before a second caller exists.
- Check for duplication with existing date or logging helpers, but do not move logic into `src/main/core/` because the collector performs DB and broker I/O.

**Acceptance criteria covered:**

- Collector picks up all active-position underlyings
- Successful snapshot is persisted
- Re-running on the same calendar day overwrites the existing row
- Not-available ticker is recorded but with no row written
- Parse error is logged and the collector continues to the next ticker
- Market is closed on a non-trading day

### 2. Scheduler Registration and Main-Process Wiring

**Files to create or modify:**

- `src/main/index.ts` — register the new `ivr-collect` after-close job alongside `detect-assignments`
- `src/main/index.test.ts` — assert the job registration and handler wiring
- `src/main/services/polling-scheduler.test.ts` — add one focused assertion if needed to prove `runNow('ivr-collect')` returns a handler result through the existing scheduler contract

**Red — tests to write:**

- In `src/main/index.test.ts`, add `registers the ivr-collect scheduler job with afterClose offsetMinutes 60` that inspects the mocked `scheduler.register` calls and asserts one call has `{ name: 'ivr-collect', cadence: { kind: 'afterClose', offsetMinutes: 60 } }`.
- In `src/main/index.test.ts`, add `ivr-collect job handler delegates to collectIVRSnapshots with db, brokerProvider, and logger` that mocks the collector module, executes the registered handler, and asserts it resolves the active broker via `brokerFactory.create()` rather than capturing a stale provider.
- If the scheduler tests need it, in `src/main/services/polling-scheduler.test.ts`, add `runNow returns the registered handler result for ivr-collect callers` so the manual IPC in Area 3 can safely surface the batch summary.

**Green — implementation:**

- In `src/main/index.ts`, import `collectIVRSnapshots` from `src/main/services/ivr-collector.ts`.
- Register `scheduler.register({ name: 'ivr-collect', cadence: { kind: 'afterClose', offsetMinutes: 60 }, handler: async () => ... })` before `scheduler.start()`, mirroring the existing detect-assignments registration style.
- Inside that handler, resolve the current broker with `brokerFactory.create()` and call `collectIVRSnapshots({ db, brokerProvider, logger })`.
- Preserve the existing single `scheduler.start()` call after all job registrations.

**Refactor — cleanup to consider:**

- If the `detect-assignments` and `ivr-collect` registrations share an obvious inline pattern in `src/main/index.ts`, extract only a tiny local helper inside `index.ts`; do not create a new scheduling abstraction for two call sites.

**Acceptance criteria covered:**

- Collector runs once per market day after close

### 3. Manual Trigger IPC, Preload, and Renderer API

**Files to create or modify:**

- `src/main/schemas.ts` — add the batch result schema/type for `ivr:collect-now`
- `src/main/ipc/ivr.ts` — register the new IPC handler
- `src/main/ipc/ivr.test.ts` — add handler tests around success and error envelopes
- `src/main/index.ts` — register the IVR IPC handlers during startup
- `src/preload/index.ts` — expose `window.api.ivr.collectNow`
- `src/preload/index.d.ts` — add the renderer-facing type declaration
- `src/renderer/src/api/ivr.ts` — add the typed renderer adapter that unwraps the IPC envelope
- `src/renderer/src/api/ivr.test.ts` — add adapter tests
- `src/renderer/src/hooks/useCollectIvrNow.ts` — add a mutation hook for the Settings page

**Red — tests to write:**

- In `src/main/ipc/ivr.test.ts`, add `ivr:collect-now returns the collector batch summary through handleIpcCall` that mocks `scheduler.runNow('ivr-collect')` to resolve a batch object and asserts the handler response is `{ ok: true, batch: ... }`.
- In `src/main/ipc/ivr.test.ts`, add `ivr:collect-now returns a standard ipc error envelope when scheduler.runNow rejects` that forces a scheduler error and asserts `{ ok: false, errors: [...] }`.
- In `src/main/index.test.ts`, add `registers IVR IPC handlers` that mirrors the existing handler-registration tests for assignments/settings.
- In `src/renderer/src/api/ivr.test.ts`, add `collectIvrNow returns the unwrapped batch on ok:true` and `collectIvrNow throws ApiError on ok:false`, following the current renderer API test style.
- In `src/preload/index.d.ts`-backed type tests if present, ensure `window.api.ivr.collectNow()` is declared with the new result shape.

**Green — implementation:**

- In `src/main/schemas.ts`, add `CollectIvrNowBatchSchema` and its inferred type exactly as described in `plans/us-44/contracts/ivr-collect-now.md`.
- Create `src/main/ipc/ivr.ts` with `ipcMain.handle('ivr:collect-now', ...)` wrapped in `handleIpcCall(...)`; the handler should call `await scheduler.runNow('ivr-collect')` and return `{ batch }`.
- In `src/main/index.ts`, register the IVR IPC handlers with the shared scheduler instance during app startup.
- In `src/preload/index.ts`, add `ivr: { collectNow: () => invoke('ivr:collect-now') }`.
- In `src/preload/index.d.ts`, declare the IVR namespace and the typed batch result.
- In `src/renderer/src/api/ivr.ts`, add a `collectIvrNow()` helper that calls `window.api.ivr.collectNow()`, returns the unwrapped batch, and throws the project's standard `ApiError` on failure.
- In `src/renderer/src/hooks/useCollectIvrNow.ts`, expose a `useMutation` wrapper for the Settings page.

**Refactor — cleanup to consider:**

- Reuse the existing API error-unwrapping helper pattern rather than inventing an IVR-specific envelope adapter.
- Keep `src/main/ipc/ivr.ts` thin: no batch logic or branching beyond schema-free invocation and envelope handling.

**Acceptance criteria covered:**

- Manual trigger from settings

### 4. Settings Page Trigger and Renderer Feedback

**Files to create or modify:**

- `src/renderer/src/pages/SettingsPage.tsx` — add the `Refresh IVR now` button and inline batch result messaging
- `src/renderer/src/pages/SettingsPage.test.tsx` — add UI coverage for success, skip, and error feedback

**Red — tests to write:**

- In `src/renderer/src/pages/SettingsPage.test.tsx`, add `renders a Refresh IVR now button in the Market Data section` that asserts the button appears alongside the existing market-data operational controls.
- In `src/renderer/src/pages/SettingsPage.test.tsx`, add `clicking Refresh IVR now surfaces the returned success and error counts` that mocks `useCollectIvrNow().mutateAsync` to resolve `{ successCount: 2, errorCount: 1, skippedCount: 0, skippedReason: null }` and expects the page to render an inline status message with those counts.
- In `src/renderer/src/pages/SettingsPage.test.tsx`, add `shows a skipped message when the collector reports market_closed` that resolves `{ successCount: 0, errorCount: 0, skippedCount: 0, skippedReason: 'market_closed' }` and expects a muted or warning-tone message rather than a success message.
- In `src/renderer/src/pages/SettingsPage.test.tsx`, add `shows an error message when the IVR collect mutation rejects` that follows the existing `getApiErrorMessage(error)` pattern already used elsewhere on the page.

**Green — implementation:**

- In `src/renderer/src/pages/SettingsPage.tsx`, import and use `useCollectIvrNow`.
- Add a secondary `Refresh IVR now` button to the existing `Market Data` section, keeping the interaction in Settings as required by the story and the placement decision from `plans/us-44/research.md`.
- Add page-local message state for IVR refresh outcomes that can display:
  - success summary with `successCount` / `errorCount`
  - skip summary for `skippedReason === 'market_closed'`
  - error summary from `getApiErrorMessage(error)` on rejected mutation
- Keep the renderer logic thin: no ticker selection, no batch assembly, and no market-status branching in the component.

**Refactor — cleanup to consider:**

- If the page ends up with duplicated message-rendering markup between Massive and IVR actions, extract a tiny local render helper inside `SettingsPage.tsx`; do not create a new shared component unless the duplication is real after Green.
- Match the current Settings page tone classes and layout patterns instead of inventing a new visual treatment.

**Acceptance criteria covered:**

- Manual trigger from settings

### 5. E2e Tests

**Files to create or modify:**

- `e2e/ivr-collector.spec.ts` — add story-level end-to-end coverage for scheduler wiring, persistence behavior, manual trigger, and non-trading-day skip
- `e2e/helpers.ts` or a new IVR-specific helper file if needed — add any minimal helper needed to seed DB rows or inspect the new table

**Red — tests to write:**

- In `e2e/ivr-collector.spec.ts`, add `AC: Collector runs once per market day after close` that launches the app in test mode, inspects the scheduler registry through the existing `_test:scheduler-registry` helper, and asserts the `ivr-collect` job is registered with `afterClose` cadence and `offsetMinutes: 60`.
- In `e2e/ivr-collector.spec.ts`, add `AC: Collector picks up all active-position underlyings` that seeds active positions for `SPY`, `AAPL`, and `TSLA`, mocks the scraper path, triggers the job, and asserts only those distinct active underlyings were requested in the batch.
- In `e2e/ivr-collector.spec.ts`, add `AC: Successful snapshot is persisted` that mocks a successful SPY fetch, runs the batch, and verifies the `ivr_snapshot` row exists with the expected `ivr` string.
- In `e2e/ivr-collector.spec.ts`, add `AC: Re-running on the same calendar day overwrites the existing row` that performs two runs on the same date and asserts only the fresh row remains for SPY on that day.
- In `e2e/ivr-collector.spec.ts`, add `AC: Not-available ticker is recorded but with no row written` that mocks a `not_available` response and asserts no `ivr_snapshot` row exists for that ticker after the run.
- In `e2e/ivr-collector.spec.ts`, add `AC: Parse error is logged and the collector continues to the next ticker` that mocks `parse_error` for one ticker and `ok` for another, then verifies the second ticker still persists.
- In `e2e/ivr-collector.spec.ts`, add `AC: Manual trigger from settings` that opens `#/settings`, clicks `Refresh IVR now`, and asserts the returned batch summary is rendered in the UI.
- In `e2e/ivr-collector.spec.ts`, add `AC: Market is closed on a non-trading day` that configures the mock broker status to a weekend/holiday-closed state, triggers the job manually, and asserts no network/scraper requests occur plus the UI shows the skipped outcome.

**Green — implementation:**

- Add the smallest set of test helpers needed to seed `positions`, stub IVR outcomes, and read `ivr_snapshot` rows inside e2e.
- Reuse the existing test-only scheduler IPC in `src/main/ipc/test-scheduler.ts` instead of inventing a new e2e-only backdoor.
- Keep the e2e environment offline by mocking the IVR fetch path or injecting deterministic collector collaborators; do not depend on live Barchart responses.

**Refactor — cleanup to consider:**

- If the spec needs repeated DB setup or row-inspection helpers, place them in a single IVR-specific helper module under `e2e/` rather than duplicating SQL snippets across tests.
- Keep each e2e test mapped to exactly one acceptance criterion and avoid combining multiple scenarios into one long flow.

**Acceptance criteria covered:**

- Collector runs once per market day after close
- Collector picks up all active-position underlyings
- Successful snapshot is persisted
- Re-running on the same calendar day overwrites the existing row
- Not-available ticker is recorded but with no row written
- Parse error is logged and the collector continues to the next ticker
- Manual trigger from settings
- Market is closed on a non-trading day
