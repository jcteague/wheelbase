---
page: docs/spec/features/us-100-ivr-on-demand-and-outside-market-hours.md
audited_at: 2026-09-28
findings: 13
---

# Audit: docs/spec/features/us-100-ivr-on-demand-and-outside-market-hours.md

Context: US-121 retired the Barchart scrape and the `ivr_snapshot` table and now computes IV
rank from the app's own IV30 history. This page has **no** superseded banner and describes
the Barchart-era mechanics in the present tense, so those claims are scored as drift. The
parts of US-100 that survived US-121 (on-demand trigger on watchlist add / position create,
detached never-rejecting collect, push event, scheduler trigger plumbing) verify.

## Verified (14)

- ✓ `createIvrOnDemand` / `IvrOnDemand` port, single-ticker, does not reuse the batch — `src/main/services/ivr-on-demand.ts:20,43` (header comment `:8-10`)
- ✓ `IvrOnDemand.collect` never rejects (whole body in try/catch) — `ivr-on-demand.ts:62-78`
- ✓ `ensureTradingCalendar` awaited before the run — `ivr-on-demand.ts:65`
- ✓ `addWatchlistEntry(..., ivrOnDemand?)` fires `void ivrOnDemand?.collect(ticker)` after commit — `src/main/services/watchlist.ts:86,114`
- ✓ `createPosition(..., ivrOnDemand?)` fires `void ivrOnDemand?.collect(payload.ticker)` — `src/main/services/positions.ts:30,125`
- ✓ `ivr:snapshot-updated` push sent on main window `webContents` — `src/main/index.ts:208-209`; preload `onSnapshotUpdated` — `src/preload/index.ts:90`
- ✓ `useIvrSnapshotUpdates` invalidates `watchlistQueryKeys.snapshot` and `screenerQueryKeys.results` — `src/renderer/src/hooks/useIvrSnapshotUpdates.ts:17-18`
- ✓ `useWatchlistSnapshot` has no `refetchInterval` by design — `src/renderer/src/hooks/useWatchlistSnapshot.ts:5`
- ✓ `JobTrigger = 'scheduled' | 'explicit'`, `JobRunContext = { trigger }`, `JobHandler = (ctx) => …` — `src/main/services/polling-scheduler.ts:15,17,19`
- ✓ `runNow(name, opts?)` defaults trigger to `'explicit'` — `polling-scheduler.ts:275-277`
- ✓ `ivr:collect-now` routes through `scheduler.runNow` — `src/main/ipc/ivr.ts:8-10`
- ✓ `_test:scheduler-run-scheduled` registered — `src/main/ipc/test-scheduler.ts:55`
- ✓ `getMostRecentCompletedSession` exists — `src/main/core/trading-calendar.ts:150`
- ✓ e2e specs `ivr-on-demand.spec.ts`, `ivr-collector.spec.ts`, `ivr-watchlist-collection.spec.ts`, `ivr-helpers.ts`, `trading-day-fixtures.ts` exist under `e2e/`; all relative spec links resolve

## Drift (11)

- ✗ Lines 51-53, 60: `collectTicker({ db, logger, fetchIvr, calendar, ticker })` returning `TickerOutcome` (`'persisted' | 'not_available' | 'failed'`) no longer exists (no match in `src/main`). The shared per-ticker body is now `collectIvHistory` from `src/main/services/iv-history.ts`, returning `IvHistoryTickerOutcome` (`collected | up_to_date | failed | no_market_data`) — `src/main/services/ivr-collector.ts:12,118-160`, `ivr-on-demand.ts:15,72`.
- ✗ Lines 94-104: `collectIVRSnapshots` with a `trigger` parameter and a `market_closed` skip no longer exists. The batch is `collectIvHistoryBatch` with **no closed-day guard at all** (`ivr-collector.ts:5-7,69`); its only skip reason is `'market_data_unavailable'` (`ivr-collector.ts:22`).
- ✗ Lines 118-146: `persistSnapshot` stamping `observed_at = session.closeAt`, the delete-over-observation-window dedupe, `utcDayBounds` fallback and the `ivr_observation_unstamped` warning — none found in `src/`. The `ivr_snapshot` table they write is dropped by `migrations/016_create_iv30_history.sql:55`.
- ✗ Line 126: `observationWindowOf(calendar, session)` / `ObservationWindow` in `src/main/core/trading-calendar.ts` — no match in `src/`.
- ✗ Line 26: "`ivr_snapshot` (007) … unchanged in shape" — table no longer exists (`migrations/016_create_iv30_history.sql:55`).
- ✗ Line 86: `onCollected` callback — the dependency is now `onSettled` (`ivr-on-demand.ts:38,76`) wired to `notifyIvrSnapshotUpdated` (`src/main/index.ts:208`); payload is `{ ticker: string | null }` (null = batch), not `{ ticker: string }` as stated in line 181 (`src/preload/index.ts:90`).
- ✗ Lines 64-67: "`collect(ticker)` skips when the ticker already has a reading for the current trading day … degrades to Eastern-calendar-day equality" — current skip logic is `collectIvHistory` returning `up_to_date` when the IV30 series has no missing sessions (`ivr-on-demand.ts:9-10`); no session-equality check in `ivr-on-demand.ts`.
- ✗ Lines 153-156, 180: `CollectIvrNowResult.skippedReason` is now `'market_data_unavailable' | null` (`src/renderer/src/api/ivr.ts:38`); `SettingsPage` branches on `market_data_unavailable` (`src/renderer/src/pages/SettingsPage.tsx:511`). The `market_closed` value no longer exists anywhere.
- ✗ Lines 186-189: `_test:ivr-fetch-log` and `_test:ivr-set-outcomes` are not registered; the test surface is now `src/main/ipc/test-iv-history.ts` (`_test:iv-series-set`, `_test:daily-bar-requests`, …, lines 22-82).
- ✗ Lines 37, 118, 206: "A ticker Barchart does not cover…", "Barchart derives IV rank…", "Barchart remains the IVR source" — present-tense; Barchart has been retired (no Barchart reference in non-test `src/main`), IV rank is computed from own IV30 history (US-121).
- ✗ No "superseded by US-121" banner or pointer on the page, although the IVR collection mechanics were replaced. Suggested fix: add a banner linking `us-121-iv-rank-from-own-iv-history.md` and mark the Barchart/`ivr_snapshot` sections as history.

## Unverifiable (3)

- ? "A `runNow` that joins an in-flight run keeps the trigger that run started with" — join behaviour documented in `polling-scheduler.ts:98` comment; trigger-preservation not mechanically confirmed.
- ? Rationale that US-100 depended on US-116 shipping first — historical/narrative.
- ? "closes the trigger half of `docs/epics/06-stories/followup-ivr-trading-day-calendar.md`" — backlog narrative.

## Missing files (2)

- ✗ `src/main/ipc/test-ivr.ts` — does not exist
- ✗ `src/main/integrations/fake-ivr.ts` — does not exist
- (note) `plans/us-100/` exists — not missing
