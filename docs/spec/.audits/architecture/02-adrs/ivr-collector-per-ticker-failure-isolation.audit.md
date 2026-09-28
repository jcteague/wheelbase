---
page: docs/spec/architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md
audited_at: 2026-09-28
findings: 11
---

# Audit: docs/spec/architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md

## Verified (7)

- ✓ US-121 amendment: each turn is `collectIvHistory`, wrapped in a per-ticker `try/catch` in `collectIvHistoryBatch` — `src/main/services/ivr-collector.ts:120-135`.
- ✓ DB write errors rethrown as systemic (`Database.SqliteError`) — `ivr-collector.ts:131`.
- ✓ `auth_failed` / calendar `no_market_data` aborts as `skippedReason: 'market_data_unavailable'` — `ivr-collector.ts:51-56,93-98,150-154`.
- ✓ Each turn bracketed by `markPending` / `settle` — `ivr-collector.ts:118,139`.
- ✓ Caught failure logged under `err` — `ivr-collector.ts:132-133`.
- ✓ Optional `AbortSignal` checked at each ticker boundary (`ivr-collector.ts:31-33,110-116`), aborted by the before-quit hook (`src/main/index.ts:264,339`); `scheduler.stop()` drain race exists (`src/main/services/polling-scheduler.ts:252-270`).
- ✓ `src/main/logger.ts:16` configures `serializers: { error: pino.stdSerializers.err }`; `PollingScheduler.runHandler` exists (`polling-scheduler.ts:142`) and logs under `error` (`:179`).

## Drift (1)

- ✗ Decision line 19 (and Logging detail lines 78-80) name the WARN message `IVR collection threw for ticker` and a second `IVR collection failed for ticker` branch. The Decision paragraph was updated to name `collectIvHistoryBatch`, so it reads as current, but the code logs a single event key `ivr_collection_ticker_failed` (`src/main/services/ivr-collector.ts:133`); neither quoted message exists in `src/` (grep). Suggested fix: update the message name, or move the two-branch logging detail under the "kept as history" framing.

## Unverifiable (2)

- ? The historical rationale (Barchart non-JSON bodies, `persistSnapshot` outside the `try`, `getMarketStatus` degradation, 1 req/s limiter) is explicitly framed as history by the amendment banner (lines 5-13) — not drift.
- ? The manual path "converts it to an explicit run-level failure message first" — `src/main/ipc/ivr.ts:15` throws `'IVR collection failed before producing a batch summary'`, consistent; whether that matches the historical description exactly is narrative.

## Missing files (1)

- ✗ Source list cites `src/main/integrations/barchart-ivr-scraper.ts`, which no longer exists (retired with Barchart). The banner says the scraper is gone, but the Source list still presents it as a current source; consider annotating it as historical. Other links (`us-97` feature, `union-ivr-targets-positions-and-watchlist.md`, `alert-evaluation-failure-isolation.md`) exist.
