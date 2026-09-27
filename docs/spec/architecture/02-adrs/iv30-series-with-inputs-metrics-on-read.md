# ADR: Persist the IV30 series with its inputs; derive rank, percentile and range on read

<!-- generated:from us-121 -->

## Decision

`iv30_reading` (migration 016) holds one row per `(underlying, session, method)`: the session's
`iv30` **and every input that produced it** — the underlying VWAP, the expiration tier, near and
far expiration, the strike per expiration, the four option VWAPs and trade counts, the rate, the
dividend yield, `engine_version`, and `observed_at` (the session's close instant).

Nothing derived is stored. IV rank, IV percentile and the 52-week low/high are pure functions of
the series (`computeIvMetrics` in `src/main/core/iv-metrics.ts`), computed on every read by
`readIvMetricsByUnderlying` (`src/main/services/iv-history-read.ts`). That module imports no
market-data port, so "reading IV metrics makes no market-data request" holds by construction.

The Barchart-era `ivr_snapshot` table is dropped by the same migration — see
[barchart-retired-from-code-and-schema](./barchart-retired-from-code-and-schema.md).

## Why

- The engine is new and will be wrong at least once; Alpaca's history window is finite and rolls
  forward. Stored inputs let a corrected engine rewrite `iv30` without refetching — see
  [iv30-engine-version-recompute](./iv30-engine-version-recompute.md).
- "Why did AAPL read 25 that day?" must be answerable from the row.
- Because metrics are derived on read, correcting `iv30` corrects every metric at once.
- Typed columns, because the `daily_vwap` input set is small and fixed, and columns query and
  validate better than JSON.

## Alternatives considered

- **Store rank alongside the series** — drift risk; a recompute would have to touch two things.
- **Versioned JSON inputs** — harder to query, no column-level validation.
- **Reuse `ivr_snapshot` with new columns** — its PK is `(underlying, observed_at)` and its rows are
  Barchart-derived; mixing provenance in one table is what its `source` column existed to avoid.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADR "Persist the IV30 series with typed inputs…"
- `plans/us-121/data-model.md` §1
- `migrations/016_create_iv30_history.sql`, `src/main/core/iv-metrics.ts`, `src/main/services/iv-history-read.ts`
- [`schema/tables.md`](../../schema/tables.md#iv30_reading)
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
