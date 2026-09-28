---
page: docs/spec/architecture/02-adrs/iv30-series-with-inputs-metrics-on-read.md
audited_at: 2026-09-28
findings: 7
---

# Audit: docs/spec/architecture/02-adrs/iv30-series-with-inputs-metrics-on-read.md

## Verified (6)

- ✓ `iv30_reading` (migration 016) keyed `(underlying, session, method)` with `iv30`, `underlying_vwap`, `expiration_tier`, near/far expiration and strike, four VWAPs and trade counts, `rate`, `dividend_yield`, `engine_version`, `observed_at` — `migrations/016_create_iv30_history.sql`.
- ✓ No derived metric columns stored; migration header states rank/percentile/range are computed at read time.
- ✓ `computeIvMetrics` in `src/main/core/iv-metrics.ts:29`; `readIvMetricsByUnderlying` in `src/main/services/iv-history-read.ts:62`.
- ✓ `iv-history-read.ts` imports no market-data port (imports at lines 6-11 are DB, core metrics/freshness/calendar types, logger, store).
- ✓ `ivr_snapshot` dropped by the same migration — `migrations/016_create_iv30_history.sql:53-55`; `./barchart-retired-from-code-and-schema.md` exists. Mentions of `ivr_snapshot` in Alternatives are explicitly historical.
- ✓ Cited `plans/us-121/data-model.md`, `docs/spec/schema/tables.md#iv30_reading` (line 471) and feature page exist.

## Drift (0)

None.

## Unverifiable (1)

- ? Rationale ("engine will be wrong at least once", "typed columns query better than JSON") — narrative.

## Missing files (0)

None.
