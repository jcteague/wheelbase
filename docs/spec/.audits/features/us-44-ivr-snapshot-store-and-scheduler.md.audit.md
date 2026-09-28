---
page: docs/spec/features/us-44-ivr-snapshot-store-and-scheduler.md
audited_at: 2026-09-28
findings: 27
---

# Audit: docs/spec/features/us-44-ivr-snapshot-store-and-scheduler.md

US-121 replaced the Barchart scrape and the `ivr_snapshot` table with the app's own IV30 history (`iv30_reading` / `iv30_gap`, migration 016). The page carries US-97 annotations but nothing about US-121, so its present-tense claims about Barchart, `ivr_snapshot` and the market-closed guard are drift.

## Verified (13)

- ✓ `migrations/007_create_ivr_snapshot.sql` creates `ivr_snapshot` (underlying, observed_at, ivr, nullable ivp/iv30, `source DEFAULT 'barchart'`, PK `(underlying, observed_at)`) plus `idx_ivr_snapshot_underlying_observed_at_desc`. This holds historically, but see the drift item on its drop.
- ✓ `src/main/services/ivr-collector.ts` exists and exports `IVR_COLLECT_JOB_NAME = 'ivr-collect'` (`:15`).
- ✓ Collection targets are `positions WHERE status != 'CLOSED' UNION watchlist`, upper-cased, de-duplicated and sorted: `ivr-collector.ts:40-65`.
- ✓ Per-ticker failure isolation (a try/catch per ticker): `ivr-collector.ts` loop. The ADR `ivr-collector-per-ticker-failure-isolation.md` exists.
- ✓ The `ivr-collect` job is registered with `cadence: { kind: 'afterClose', offsetMinutes: 60 }`: `src/main/index.ts:267-268`.
- ✓ `ivr:collect-now` is registered in `src/main/ipc/ivr.ts:8`, calls `scheduler.runNow(IVR_COLLECT_JOB_NAME)`, validates with `CollectIvrNowBatchSchema`, returns `{ batch }` and is wrapped in `handleIpcCall`.
- ✓ The preload exposes `window.api.ivr.collectNow()`: `src/preload/index.ts:87`, `index.d.ts:794`.
- ✓ `CollectIvrNowResult` and `collectIvrNow` are in `src/renderer/src/api/ivr.ts:34-42`.
- ✓ `useCollectIvrNow` is in `src/renderer/src/hooks/useCollectIvrNow.ts:4` and used by `SettingsPage.tsx:17,484`.
- ✓ SettingsPage has the "Refresh IVR now" button, disabled/"Refreshing IVR…" while pending, and the `MessageText` helper: `SettingsPage.tsx:54,571,575`.
- ✓ These source files exist: `polling-scheduler.ts`, `scheduler-instance.ts`, `ipc/test-scheduler.ts`, `schemas.ts`, `e2e/ivr-collector.spec.ts`, `e2e/ivr-helpers.ts`.
- ✓ The linked pages exist: `us-97`, `us-43`, `us-46`, the ADR, `schema/migrations.md`, `schema/tables.md`, `contracts/ipc-handlers.md`, `contracts/zod-schemas.md`, and `docs/epics/06-stories/followup-ivr-trading-day-calendar.md`.
- ✓ The e2e spec has AC-named cases for scheduling, active-position underlyings, persistence and the manual trigger: `e2e/ivr-collector.spec.ts:82,94,119,171`.

## Drift (10)

- ✗ **The collector function is named `collectIVRSnapshots` with signature `{ db, brokerProvider, logger, fetchIvr?, clock? }`.** It is now `collectIvHistoryBatch({ db, marketDataProvider, runState, logger?, clock?, signal?, onCompleted? })`: `src/main/services/ivr-collector.ts:24-38,67`. The result type is `CollectIvHistoryBatchResult` (`:17`), not `CollectIVRSnapshotsResult`.
- ✗ **"batches tickers through the existing Barchart scraper" / "builds on `fetchIVR`" / "persists `source = 'barchart'`".** No `fetchIVR` exists in `src/`. The collector calls `collectIvHistory` from `./iv-history` (`ivr-collector.ts:12`), and the file header says `[US-44/US-100/US-121]` and "brings every collection target's IV30 series up to date".
- ✗ **Persistence into `ivr_snapshot` with delete-then-insert same-day overwrite.** Migration `016_create_iv30_history.sql:55` runs `DROP TABLE ivr_snapshot`. No `src/` code references `ivr_snapshot`. The e2e test now reads "Re-running within the same session is up to date and leaves the row unchanged (US-121 supersedes the overwrite)" (`e2e/ivr-collector.spec.ts:144`).
- ✗ **Non-trading-day guard via `BrokerProvider.getMarketStatus()` returning `skippedReason='market_closed'`.** The file header says "There is no closed-day guard" (`ivr-collector.ts:5-7`). `BrokerProvider` no longer has `getMarketStatus` (`src/main/integrations/broker-provider.ts:44-47`). The skip reason is now `'market_data_unavailable'` (`ivr-collector.ts:21,52-57`).
- ✗ **The `CollectIvrNowBatchSchema` `skippedReason` enum is described as `['market_closed']`.** It is actually `z.enum(['market_data_unavailable']).nullable()`: `src/main/schemas.ts:173-178`. The same applies to the `ivr:collect-now` contract and the `CollectIvrNowResult` type (`src/renderer/src/api/ivr.ts:38`).
- ✗ **SettingsPage "shows a muted/warning message when `skippedReason === 'market_closed'`".** The branch is on `'market_data_unavailable'`, and the copy reads "IV history refresh complete: …": `SettingsPage.tsx:511,519`.
- ✗ **"The handler resolves the active broker via `brokerFactory.create()` at run time".** The job passes `marketDataProvider: marketDataFactory.create()` with no broker: `src/main/index.ts:279-281`.
- ✗ **"1 request/second politeness rule is enforced by the scraper module's internal rate limiter".** The scraper no longer exists. Pacing now belongs to the market-data provider (not re-verified here).
- ✗ **"Known limitation: the trading-day guard only detects weekends, not weekday market holidays."** Holidays are now handled by the exchange trading calendar (`refreshTradingCalendar` / `readTradingCalendar`, `ivr-collector.ts:14,88-89`). The e2e test is "A recognised weekday holiday skips collection with no fetch" (`e2e/ivr-collector.spec.ts:218`).
- ✗ **The per-outcome accounting (`ok`/`not_available`/`parse_error`/`network_error`/`rate_limited`/`invalid_input`) and the "`not_available` logs INFO … not covered by Barchart IVR" AC.** Outcomes are now `collected` / `failed` / `up_to_date` (`ivr-collector.ts:18-20`).

## Unverifiable (1)

- ? "Settings-page placement … no mockup exists" is narrative.

## Missing files (3)

- ✗ `src/main/integrations/barchart-ivr-scraper.ts`: does not exist (retired in favour of US-121).
- ✗ `src/main/integrations/fake-ivr.ts`: does not exist. `src/main/index.test.ts:576-584` asserts that nothing imports it.
- ✗ `src/main/ipc/test-ivr.ts`: does not exist. The closest current file is `src/main/ipc/test-iv-history.ts`.
