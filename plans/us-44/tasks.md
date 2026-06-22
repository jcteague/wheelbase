# US-44 — Persist IVR snapshots and schedule daily collection — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- After each area, run the verification block at the end of this file before opening the next

---

## Parallel Layers

| Layer | Areas                                                                      | Notes                                                                                                               |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1     | Area A (Snapshot migration + collector service), Area B (Scheduler wiring) | Area B can start immediately for the registration assertions, but its Green work depends on Area A's service export |
| 2     | Area C (Manual trigger IPC + renderer API)                                 | Depends on Area A Green and Area B Green                                                                            |
| 3     | Area D (Settings page trigger)                                             | Depends on Area C Green                                                                                             |
| 4     | Area E (E2E tests)                                                         | Depends on all previous Green tasks                                                                                 |

---

## Area A — Snapshot Migration and Collector Service

**Files:** `migrations/007_create_ivr_snapshot.sql`, `src/main/db/migrate.test.ts`, `src/main/services/ivr-collector.ts`, `src/main/services/ivr-collector.test.ts`

### Red

- [x] **A1.** Add test `applies 007_create_ivr_snapshot.sql and creates ivr_snapshot with latest-first index` to `src/main/db/migrate.test.ts`. Run migrations against a temp DB and assert the `ivr_snapshot` table columns plus the `(underlying, observed_at DESC)` index exist.
- [x] **A2.** Create `src/main/services/ivr-collector.test.ts` and add test `returns early and logs skip when BrokerProvider reports a non-trading day`. Stub `getMarketStatus()` to a weekend/holiday-closed shape, assert no `fetchIVR` calls happen, and expect `{ successCount: 0, errorCount: 0, skippedCount: 0, skippedReason: 'market_closed' }`.
- [x] **A3.** Add test `selects distinct active-position tickers only and spaces requests by at least 1 second`. Seed active and closed `positions`, include duplicate active tickers, and assert only distinct active symbols are fetched with collector-level 1000 ms spacing.
- [x] **A4.** Add test `persists a successful Barchart snapshot as decimal strings`. Stub `fetchIVR('SPY')` to return `status: 'ok'` and assert the inserted row stores `ivr`, optional `ivp`, optional `iv30`, `observed_at`, and `source = 'barchart'`.
- [x] **A5.** Add test `re-running on the same UTC calendar day deletes the older row before inserting the fresh row`. Seed an earlier SPY row for `2026-05-29`, rerun the collector with a later `observedAt`, and assert only the fresh row remains for that date.
- [x] **A6.** Add test `does not persist not_available results and logs the uncovered symbol at INFO`. Return `status: 'not_available'`, assert no row is inserted, and assert the info log contains the symbol.
- [x] **A7.** Add test `logs parse_error and continues to the next ticker without aborting the batch`. Seed two active tickers, return `parse_error` for the first and `ok` for the second, and assert the second still persists while `errorCount` increments.
- [x] **A8.** Run `pnpm test src/main/db/migrate.test.ts src/main/services/ivr-collector.test.ts` — all new tests must fail for the expected reasons. **Red phase complete.**

### Green

- [x] **A9.** Create `migrations/007_create_ivr_snapshot.sql` with the exact table shape from `plans/us-44/data-model.md`, including `source TEXT NOT NULL DEFAULT 'barchart'` and the `(underlying, observed_at DESC)` index.
- [x] **A10.** Implement `collectIVRSnapshots` in `src/main/services/ivr-collector.ts` as a service-layer function that accepts `{ db, brokerProvider, logger, fetchIvr?, clock? }`, calls `brokerProvider.getMarketStatus()` first, and returns the `CollectIVRSnapshotsResult` shape from `plans/us-44/data-model.md`.
- [x] **A11.** Add the active-underlying query in `src/main/services/ivr-collector.ts`: select distinct `ticker` values from `positions` where `status != 'CLOSED'`, normalize to uppercase, sort deterministically, and iterate sequentially.
- [x] **A12.** Add collector-owned throttling between per-ticker fetches in `src/main/services/ivr-collector.ts`, independent from the internal throttle inside `src/main/integrations/barchart-ivr-scraper.ts`.
- [x] **A13.** Add same-day overwrite transaction logic in `src/main/services/ivr-collector.ts`: delete existing rows for the same `underlying` and UTC date before inserting the fresh snapshot row.
- [x] **A14.** Handle `fetchIVR` outcomes exactly as specified in `plans/us-44/data-model.md`: persist `ok`, skip row writes for `not_available`, and log + continue for `parse_error`, `network_error`, `rate_limited`, and `invalid_input`.
- [x] **A15.** Run `pnpm test src/main/db/migrate.test.ts src/main/services/ivr-collector.test.ts` — all tests must pass. **Green phase complete.**

### Refactor

- [x] **A16.** Extract small local helpers inside `src/main/services/ivr-collector.ts` only if they materially improve clarity: `listActiveUnderlyings`, `persistSnapshot`, `sleepBetweenRequests`, or `isTradingDay`.
- [x] **A17.** Re-read `plans/us-44/research.md` and confirm the implementation still matches the migration-numbering, same-day-overwrite, and collector-throttling decisions.
- [x] **A18.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`.

**Acceptance criteria covered after Area A:** Collector picks up all active-position underlyings; Successful snapshot is persisted; Re-running on the same calendar day overwrites the existing row; Not-available ticker is recorded but with no row written; Parse error is logged and the collector continues to the next ticker; Market is closed on a non-trading day.

---

## Area B — Scheduler Registration and Main-Process Wiring

**Files:** `src/main/index.ts`, `src/main/index.test.ts`, optional touch to `src/main/services/polling-scheduler.test.ts`

> Green work depends on **Area A Green** because the job handler must call the collector service.

### Red

- [x] **B1.** Add test `registers the ivr-collect scheduler job with afterClose offsetMinutes 60` to `src/main/index.test.ts`. Inspect the mocked `scheduler.register` calls and assert one call has `{ name: 'ivr-collect', cadence: { kind: 'afterClose', offsetMinutes: 60 } }`.
- [x] **B2.** Add test `ivr-collect job handler delegates to collectIVRSnapshots with db, brokerProvider, and logger` to `src/main/index.test.ts`. Mock the collector module, execute the registered handler, and assert it resolves the active broker with `brokerFactory.create()`.
- [x] **B3.** If required by the current scheduler API, add `runNow returns the registered handler result for ivr-collect callers` to `src/main/services/polling-scheduler.test.ts`.
- [x] **B4.** Run `pnpm test src/main/index.test.ts src/main/services/polling-scheduler.test.ts` — the new tests must fail for the missing registration/delegation reasons. **Red phase complete.**

### Green

- [x] **B5.** Import `collectIVRSnapshots` into `src/main/index.ts`.
- [x] **B6.** Register `scheduler.register({ name: 'ivr-collect', cadence: { kind: 'afterClose', offsetMinutes: 60 }, handler: async () => ... })` before `scheduler.start()`, mirroring the existing detect-assignments registration style.
- [x] **B7.** Inside that handler, resolve the current broker with `brokerFactory.create()` and call `collectIVRSnapshots({ db, brokerProvider, logger })`.
- [x] **B8.** Preserve the existing single `scheduler.start()` call after all job registrations.
- [x] **B9.** Run `pnpm test src/main/index.test.ts src/main/services/polling-scheduler.test.ts` — all new tests must pass. **Green phase complete.**

### Refactor

- [x] **B10.** If `src/main/index.ts` now has obvious duplication between job registrations, extract only a tiny local helper in that file. Do not create a new scheduling abstraction.
- [x] **B11.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`.

**Acceptance criteria covered after Area B:** Collector runs once per market day after close.

---

## Area C — Manual Trigger IPC, Preload, and Renderer API

**Files:** `src/main/schemas.ts`, `src/main/ipc/ivr.ts`, `src/main/ipc/ivr.test.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/ivr.ts`, `src/renderer/src/api/ivr.test.ts`, `src/renderer/src/hooks/useCollectIvrNow.ts`

**Requires:** Area A Green ✓, Area B Green ✓

### Red

- [x] **C1.** Create `src/main/ipc/ivr.test.ts` and add `ivr:collect-now returns the collector batch summary through handleIpcCall`. Mock `scheduler.runNow('ivr-collect')` to resolve a batch object and assert the handler returns `{ ok: true, batch: ... }`.
- [x] **C2.** Add `ivr:collect-now returns a standard ipc error envelope when scheduler.runNow rejects` to `src/main/ipc/ivr.test.ts`.
- [x] **C3.** Add `registers IVR IPC handlers` to `src/main/index.test.ts`, mirroring the existing handler-registration assertions for assignments/settings.
- [x] **C4.** Create `src/renderer/src/api/ivr.test.ts` and add `collectIvrNow returns the unwrapped batch on ok:true`.
- [x] **C5.** Add `collectIvrNow throws ApiError on ok:false` to `src/renderer/src/api/ivr.test.ts`.
- [x] **C6.** Run `pnpm test src/main/ipc/ivr.test.ts src/main/index.test.ts src/renderer/src/api/ivr.test.ts` — all new tests must fail for missing schema/IPC/preload/api reasons. **Red phase complete.**

### Green

- [x] **C7.** Add `CollectIvrNowBatchSchema` and its inferred type to `src/main/schemas.ts` exactly as described in `plans/us-44/contracts/ivr-collect-now.md`.
- [x] **C8.** Create `src/main/ipc/ivr.ts` with `ipcMain.handle('ivr:collect-now', ...)` wrapped in `handleIpcCall(...)`; the handler should call `await scheduler.runNow('ivr-collect')` and return `{ batch }`.
- [x] **C9.** Register the IVR IPC handlers in `src/main/index.ts`.
- [x] **C10.** Add `ivr: { collectNow: () => invoke('ivr:collect-now') }` to `src/preload/index.ts`.
- [x] **C11.** Add the IVR namespace and typed batch result to `src/preload/index.d.ts`.
- [x] **C12.** Create `src/renderer/src/api/ivr.ts` with a `collectIvrNow()` helper that unwraps the IPC envelope and throws the standard `ApiError` on failure.
- [x] **C13.** Create `src/renderer/src/hooks/useCollectIvrNow.ts` with a `useMutation` wrapper around `collectIvrNow()`.
- [x] **C14.** Run `pnpm test src/main/ipc/ivr.test.ts src/main/index.test.ts src/renderer/src/api/ivr.test.ts` — all tests must pass. **Green phase complete.**

### Refactor

- [x] **C15.** Reuse the existing renderer API error-unwrapping pattern; do not invent an IVR-specific exception shape.
- [x] **C16.** Keep `src/main/ipc/ivr.ts` thin and confirm there is no business logic beyond delegation and envelope handling.
- [x] **C17.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`.

**Acceptance criteria covered after Area C:** Manual trigger from settings (service/API contract portion).

---

## Area D — Settings Page Trigger and Renderer Feedback

**Files:** `src/renderer/src/pages/SettingsPage.tsx`, `src/renderer/src/pages/SettingsPage.test.tsx`

**Requires:** Area C Green ✓

### Red

- [x] **D1.** Add test `renders a Refresh IVR now button in the Market Data section` to `src/renderer/src/pages/SettingsPage.test.tsx`.
- [x] **D2.** Add test `clicking Refresh IVR now surfaces the returned success and error counts`. Mock `useCollectIvrNow().mutateAsync` to resolve `{ successCount: 2, errorCount: 1, skippedCount: 0, skippedReason: null }` and assert the page renders an inline status summary.
- [x] **D3.** Add test `shows a skipped message when the collector reports market_closed`. Resolve `{ successCount: 0, errorCount: 0, skippedCount: 0, skippedReason: 'market_closed' }` and assert a muted or warning-tone message appears.
- [x] **D4.** Add test `shows an error message when the IVR collect mutation rejects`, using the existing `getApiErrorMessage(error)` pattern.
- [x] **D5.** Run `pnpm test src/renderer/src/pages/SettingsPage.test.tsx` — all new tests must fail for the missing UI action/message reasons. **Red phase complete.**

### Green

- [x] **D6.** Import and use `useCollectIvrNow` in `src/renderer/src/pages/SettingsPage.tsx`.
- [x] **D7.** Add a secondary `Refresh IVR now` button to the existing `Market Data` section, consistent with the placement decision in `plans/us-44/research.md`.
- [x] **D8.** Add page-local message state for IVR refresh outcomes that displays success summary, skip summary for `skippedReason === 'market_closed'`, and error summary from `getApiErrorMessage(error)`.
- [x] **D9.** Keep the renderer logic thin: no ticker selection, no batch assembly, and no market-status branching in the component.
- [x] **D10.** Run `pnpm test src/renderer/src/pages/SettingsPage.test.tsx` — all tests must pass. **Green phase complete.**

### Refactor

- [x] **D11.** If IVR message rendering duplicates existing message markup, extract only a tiny local helper inside `SettingsPage.tsx`. Do not create a new shared component unless duplication remains after Green.
- [x] **D12.** Match the current Settings page tone classes and layout patterns rather than inventing a new visual treatment.
- [x] **D13.** Run `pnpm test && pnpm lint && pnpm typecheck && pnpm format`.

**Acceptance criteria covered after Area D:** Manual trigger from settings (UI portion).

---

## Area E — E2E Tests

**Files:** `e2e/ivr-collector.spec.ts`, `e2e/helpers.ts` or a new IVR-specific helper file under `e2e/`

**Requires:** All Green tasks from Areas A-D ✓

### Red

- [x] **E1.** Create `e2e/ivr-collector.spec.ts` and add `AC: Collector runs once per market day after close`. Launch the app in test mode, inspect the scheduler registry through `_test:scheduler-registry`, and assert the `ivr-collect` job is registered with `afterClose` cadence and `offsetMinutes: 60`.
- [x] **E2.** Add `AC: Collector picks up all active-position underlyings`. Seed active positions for `SPY`, `AAPL`, and `TSLA`, mock the scraper path, trigger the job, and assert only those distinct active underlyings were requested.
- [x] **E3.** Add `AC: Successful snapshot is persisted`. Mock a successful SPY fetch, run the batch, and verify the `ivr_snapshot` row exists with the expected `ivr` string.
- [x] **E4.** Add `AC: Re-running on the same calendar day overwrites the existing row`. Perform two runs on the same date and assert only the fresh row remains for SPY on that day.
- [x] **E5.** Add `AC: Not-available ticker is recorded but with no row written`. Mock a `not_available` response and assert no `ivr_snapshot` row exists for that ticker after the run.
- [x] **E6.** Add `AC: Parse error is logged and the collector continues to the next ticker`. Mock `parse_error` for one ticker and `ok` for another, then verify the second ticker still persists.
- [x] **E7.** Add `AC: Manual trigger from settings`. Open `#/settings`, click `Refresh IVR now`, and assert the returned batch summary is rendered in the UI.
- [x] **E8.** Add `AC: Market is closed on a non-trading day`. Configure the mock broker status to a weekend/holiday-closed state, trigger the job manually, and assert no network/scraper requests occur plus the UI shows the skipped outcome.
- [x] **E9.** Run `pnpm test:e2e` or `pnpm exec vitest run --config vitest.e2e.config.ts e2e/ivr-collector.spec.ts` — all new e2e tests must fail. **Red phase complete.**

### Green

- [x] **E10.** Add the smallest set of e2e helpers needed to seed `positions`, stub IVR outcomes, and read `ivr_snapshot` rows.
- [x] **E11.** Reuse the existing test-only scheduler IPC in `src/main/ipc/test-scheduler.ts`; do not invent a separate e2e-only backdoor.
- [x] **E12.** Keep the e2e path offline by mocking the IVR fetch path or injecting deterministic collector collaborators rather than relying on live Barchart responses.
- [x] **E13.** Run `pnpm exec vitest run --config vitest.e2e.config.ts e2e/ivr-collector.spec.ts` — all e2e tests must pass. **Green phase complete.**

### Refactor

- [x] **E14.** Consolidate repeated IVR-specific DB setup or row-inspection logic into one helper module under `e2e/` if duplication appears.
- [x] **E15.** Re-check that each `it()` maps to exactly one AC bullet and that no combined multi-AC flows remain.
- [x] **E16.** Run `pnpm test:e2e`.

**Acceptance criteria covered after Area E:** All US-44 acceptance criteria.

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reasons)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean

---

## Notes for Implementers

- Use `migrations/007_create_ivr_snapshot.sql`, not `008`; the story note is stale relative to the current worktree.
- Keep collector throttling in `src/main/services/ivr-collector.ts` even though the Barchart scraper also throttles internally.
- Same-day overwrite is a delete-then-insert transaction keyed by `underlying` + UTC date, not a schema redesign.
- The manual trigger belongs in a dedicated `ivr:*` IPC namespace and is surfaced from the Settings page, but the business logic must stay in the main process.
