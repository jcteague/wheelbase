# US-121: Compute IV rank from our own IV history instead of scraping Barchart

<!-- generated:from us-121 -->

## Summary

Barchart put its site behind an AWS WAF challenge, so the scraped IV rank died. IV rank is now
computed from data the app is already entitled to. A pure engine inverts European Black–Scholes
over Alpaca **daily option-bar VWAP** against the underlying's **SIP daily VWAP**. It selects the
strikes and bracketing expirations with numbered gates, and interpolates to a 30-day IV (IV30) in
total variance.

The IV30 series is stored per session **with every input that produced it** (`iv30_reading`).
Sessions that could not be read are recorded as gaps (`iv30_gap`). IV rank, IV percentile and the
52-week IV range are derived on read over the 252 sessions before the latest reading, and are
published only when at least 200 of those sessions have a reading.

The existing `ivr-collect` job, `ivr:collect-now` channel, watchlist-add trigger, freshness tiers,
`IvrCell` and screener floor all keep working on the new value. The Barchart scraper, its fake, its
e2e seam and the `ivr_snapshot` table are deleted (migration 016).

An absent rank now says why. Every bench row and ranked candidate carries exactly one of `ivRank`
or `ivRankAbsence`:

| Reason                 | Card shows                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| `pending`              | pulsing `…`, "Computing IV history"                                   |
| `insufficient_history` | `n/a`, "IV history covers N of the last 252 sessions; rank needs 200" |
| `no_market_data`       | `n/a`, "IV rank needs Alpaca market-data credentials"                 |
| `failed`               | `n/a`, "Last IV history run failed"                                   |
| `not_collected`        | `n/a`, "No IV rank collected"                                         |

The reason is display-only: the verdict engine and the screener floor treat every absence as
`unknown`.

Story: Linear [OPT-27](https://linear.app/optionswheel/issue/OPT-27/us-121-compute-iv-rank-from-our-own-iv-history-instead-of-scraping).
No new dependency; the only new credential requirement is the Alpaca market-data key the app
already uses for quotes and chains.

## Acceptance criteria

Verbatim from Linear; each is one `it()` of the same name in `e2e/iv-history.spec.ts`.

1. IV rank is computed from the app's own IV history
2. IV percentile is computed alongside IV rank
3. The IV range behind the rank is reported with it
4. A reading outside the window's range is clamped
5. A flat window withholds rank but not percentile
6. A corrected engine recomputes every derived metric from stored inputs
7. Reading IV metrics makes no market-data request
8. A reading is withheld while the window is too sparse to trust
9. A young history is withheld the same way
10. Adding a ticker does not wait on its backfill
11. One ticker's backfill failure leaves the others intact
12. Missed sessions are caught up by the next daily run
13. An untraded strike is skipped for its neighbour
14. Thin weeklies fall back to the monthly expirations
15. A day with no tradeable ATM pair is left as a gap
16. Today's reading is computed the same way as the history
17. Bar requests never name the current calendar day as their end
18. Today's reading is available the same evening
19. Barchart readings are removed on upgrade
20. No market-data credentials leaves IV rank unavailable, not broken
21. The computed rank drives the screener floor — 29 is excluded / 30 is included / n/a is treated
    as it is today when IVR is unavailable
22. Expirations too near expiry are excluded from IV30 — 3 DTE excluded / 6 DTE excluded / 7 DTE
    used / 9 DTE used / 14 DTE used

Rows 8, 9, 10, 11 and 20 were amended on 2026-09-20 so the card _explains_ the absence; they are
asserted through the cell's `data-ivr-reason` / `title` and the bench-detail reading note, never
through a bare `n/a`.

## What was built

### The IV30 engine (pure, `src/main/core/`)

- **`black-scholes.ts`** — the normal CDF, the Black–Scholes price, and `impliedVolatility`
  (bisection on `[0.001, 10]`; `null` at or below discounted intrinsic). Computed in doubles;
  `Decimal` is applied only when a value is stored.
- **`iv30-selection.ts`** — the candidate expirations: weekly Fridays in `[+7, +45]` and
  third-Friday monthlies in `[+7, +70]`, each shifted to the prior session on a closure. It picks
  the pair bracketing 30 DTE with DTE ≥ 7 (one-sided → the nearest alone), lists the strike
  candidates nearest-first at increments 0.5/1/2.5/5, and plans the OCC symbols to probe.
- **`iv30.ts`** — `computeIv30` walks strikes until both legs have traded (≥ 1 trade) **and** both
  invert. Weekly tier first, then monthly; failing both is a gap. Per-expiration IV is the mean of
  call and put, and the two expirations are interpolated to 30 days in total variance:
  `σ30 = sqrt(w30 / T30)`, where `w30 = σn²·Tn·(1−λ) + σf²·Tf·λ` and `λ = (T30 − Tn)/(Tf − Tn)`.
  `iv30FromInputs` repeats that arithmetic over stored inputs. `IV30_ENGINE_VERSION` versions it.
- **`iv-metrics.ts`** — `computeIvMetrics` works over the 252 window sessions strictly before the
  anchor. It computes `rank = clamp((anchor − low)/(high − low) × 100, 0, 100)` (null when
  high = low) and `percentile = strictly-below / window × 100`, both rounded half-up to integers. It
  returns `null` below 200 coverage.
- **`ivr-freshness.ts` / `watchlist-signal.ts`** — the reading now carries
  `{ value: string | null, percentile, low, high, observedAt }`. A null value reads
  `unknown('IV unavailable')` at the IV gate.

### Storage (migration 016)

`iv30_reading` has one row per `(underlying, session, method)` holding IV30 and its inputs.
`iv30_gap` holds the sessions tried and not read. `ivr_snapshot` is dropped. See
[schema/tables.md](../schema/tables.md) and [schema/migrations.md](../schema/migrations.md).

### Market data

`MarketDataProvider` gains `getOptionDailyBars` and `getStockDailyBars`. The Alpaca adapter
batches 100 symbols per request, follows pages through a shared `fetchPages`, and uses
`feed=sip&adjustment=raw` for stocks. It sends `end` only when the caller gives one. The fake
provider prices bars from a programmed IV series with the real pricer. See
[domain/market-data.md](../domain/market-data.md) and
[contracts/alpaca-integration.md](../contracts/alpaca-integration.md).

### Services

- **`iv-history.ts`** — `collectIvHistory` runs once per ticker:
  1. It recomputes stale-version rows from their stored inputs.
  2. It works out the **required** sessions: the 253 most recent sessions whose bars have settled.
     Today counts only 45 minutes after its close.
  3. It finds the **missing** ones, which have neither a reading nor a gap. If nothing is missing it
     returns `up_to_date` and makes no request.
  4. It fetches stock bars, then option bars for the planned symbols. `end` is omitted when the
     newest settled session is today; otherwise it is that session's date, so it never names the
     current calendar day.
  5. It writes readings and gaps in one transaction. The newest session is never gapped.

  It returns `collected`, `up_to_date`, `failed` or `no_market_data`. `recomputeIvHistory` rewrites
  `iv30` for rows behind the engine version, with no provider call.

- **`iv-history-store.ts`** holds the SQL and row mapping. **`iv-history-read.ts`** holds
  `readIvMetricsByUnderlying`, which is synchronous and imports no market-data port. It answers
  `reading`, `insufficient { coverage }` (a gap-only ticker has coverage 0) or `none`.
- **`iv-run-state.ts`** — `createIvRunState()` is in-memory `pending` / `failed` / `no_market_data`
  state. One instance is created in `index.ts` and shared by every path below.
- **`ivr-snapshots.ts`** — `readIvRankLookup` replaces `getAssessedIvrByUnderlying`. `absenceFor`
  applies precedence: `pending` > `no_market_data` > `failed` > `insufficient_history` >
  `not_collected`, and a published reading always wins. `lookupOf` is the single defaulting
  accessor.
- **`ivr-collector.ts`** — `collectIVRSnapshots` loops `collectIvHistory` with per-ticker isolation.
  It has no `trigger` parameter and no closed-day guard. An auth failure, including one from the
  calendar refresh, aborts the run as `skippedReason: 'market_data_unavailable'` and marks every
  target `no_market_data`. `onCompleted` fires `ivr:snapshot-updated` once per run
  (`ticker: null`).
- **`ivr-on-demand.ts`** — `collect(ticker)` marks `pending` synchronously before its first
  `await`, never rejects, and fires `onSettled` (the push, for that ticker) after every settle.
- **`trading-calendar-store.ts`** — reads now go 400 days back and 70 ahead; refreshes go 420 back
  and 400 ahead. The store refetches when the stored `first_day` is too late, and reports
  `no_market_data` on an auth failure.
- **`watchlist-snapshot.ts` / `screener.ts`** — rows and candidates carry the reading/absence pair.
  `usableIvRanks` drops a null value, so `iv_rank_floor` never sees one.

### IPC, preload, renderer

- `CollectIvrNowBatchSchema.skippedReason` is now `'market_data_unavailable' | null`;
  `'market_closed'` is gone.
- `IpcIvRank` gains `percentile`, `low` and `high`, and `value` becomes nullable. `IpcIvRankAbsence`
  is added, and the pair travels as `IpcIvRankPair`.
- `IvrCell` / `ReadingNote` take one `ivr` pair prop. `IvrCell` renders `…` (`animate-wb-pulse`)
  for `pending` and a reason-specific `title` otherwise. A flat window shows `n/a` but keeps its
  tooltip. The tooltip body ends `52-wk IV <low>–<high> · IV percentile <p>`.
- `SettingsPage` shows `IV history refresh complete: N tickers updated, M errors.` or the
  credentials message.
- The dev-only `_test:iv-*` channels in `ipc/test-iv-history.ts` replace `_test:ivr-set-outcomes` /
  `_test:ivr-fetch-log`. The fake clock moved to `integrations/fake-clock.ts`.

See [contracts/ipc-handlers.md](../contracts/ipc-handlers.md) and
[contracts/zod-schemas.md](../contracts/zod-schemas.md).

### Bugs found and fixed during implementation

1. **Cards stuck on "Computing IV history".** Only `collected` pushed a refresh. Now every
   on-demand settle pushes, and the batch pushes once per run.
2. **No credentials read as a failed run.** The first market-data call on a fresh install is the
   calendar fetch, and it swallowed `auth_failed`. It now reports `no_market_data`.
3. **Push storm.** The batch pushed once per ticker, and each push re-ran the screener. It now
   pushes once per run.
4. **Today frozen from forming bars.** A run just after 16:00 could read bars that were still
   forming. The 45-minute settle margin fixes this. The e2e "after close" clock is now close + 60
   min ET, so it holds across DST.
5. **Gap-only ticker labelled "never collected".** It now reads `insufficient_history` with
   coverage 0.

### Known limits (review advisories, not applied)

- Alpaca returns a 403 for a missing data entitlement too. It maps to `auth_failed`, so the card
  wrongly reports missing credentials.
- A VWAP exactly on the strike grid yields a single strike candidate, so there is no neighbour
  to fall back to.
- `no_underlying_bar` gaps are never re-probed.
- Unrecomputable rows WARN on every collect.
- `IvMetricsRead` → `IvRankLookup` → `IvRankPair` are three shapes for one read. Row mapping is
  maintained by hand in three places.
- Strike grids for names priced under $10 or over $1000, and for monthly-only names, have not been
  verified.
- A full-bench backfill on a fresh install can brush Alpaca's 200 req/min limit. At worst a ticker
  reads `failed` and completes on the next run.

## Architecture decisions

- [iv30-from-daily-bar-vwap](../architecture/02-adrs/iv30-from-daily-bar-vwap.md) — IV30 from daily
  bar VWAP, constant stored rate, total-variance interpolation, `Number` pricer.
- [iv30-contract-selection](../architecture/02-adrs/iv30-contract-selection.md) — candidate
  expirations, strike walk, weekly → monthly fallback, no extrapolation.
- [iv30-series-with-inputs-metrics-on-read](../architecture/02-adrs/iv30-series-with-inputs-metrics-on-read.md)
- [iv30-gap-rows-except-newest-session](../architecture/02-adrs/iv30-gap-rows-except-newest-session.md)
- [iv-rank-window-252-before-anchor](../architecture/02-adrs/iv-rank-window-252-before-anchor.md) —
  also covers the nullable `value` with percentile/low/high.
- [iv30-engine-version-recompute](../architecture/02-adrs/iv30-engine-version-recompute.md)
- [daily-bars-on-market-data-provider](../architecture/02-adrs/daily-bars-on-market-data-provider.md)
  — also the "service owns the `end` rule" decision.
- [ivr-collector-idempotent-over-missing-sessions](../architecture/02-adrs/ivr-collector-idempotent-over-missing-sessions.md)
  — also the 45-minute bar-settle margin.
- [ivr-auth-failure-aborts-as-skip](../architecture/02-adrs/ivr-auth-failure-aborts-as-skip.md)
- [iv-rank-absence-reason-in-memory-run-state](../architecture/02-adrs/iv-rank-absence-reason-in-memory-run-state.md)
  — also the push cadence (`onSettled` per ticker, `onCompleted` once per batch).
- [fake-provider-synthesises-bars-from-iv-series](../architecture/02-adrs/fake-provider-synthesises-bars-from-iv-series.md)
- [barchart-retired-from-code-and-schema](../architecture/02-adrs/barchart-retired-from-code-and-schema.md)
- **Calendar window widened** (400 back / 70 ahead / 420 refresh) — recorded as a US-121 update on
  [trading-calendar-fetched-and-cached](../architecture/02-adrs/trading-calendar-fetched-and-cached.md).

Superseded by this story:
[barchart-as-canonical-ivr-source](../architecture/02-adrs/barchart-as-canonical-ivr-source.md),
[ivr-non-trading-day-guard-in-collector](../architecture/02-adrs/ivr-non-trading-day-guard-in-collector.md),
[ivr-same-day-overwrite-delete-then-insert](../architecture/02-adrs/ivr-same-day-overwrite-delete-then-insert.md).
Amended:
[ivr-collector-per-ticker-failure-isolation](../architecture/02-adrs/ivr-collector-per-ticker-failure-isolation.md),
[usable-ivr-only-reaches-the-engine](../architecture/02-adrs/usable-ivr-only-reaches-the-engine.md).

## Contracts touched

- `MarketDataProvider.getOptionDailyBars` / `getStockDailyBars` (new) —
  [domain/market-data.md](../domain/market-data.md#daily-bars-us-121)
- `ivr:collect-now` — `skippedReason` is `'market_data_unavailable' | null` —
  [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `watchlist:snapshot`, `screener:results` — `IpcIvRank` reshaped, `ivRankAbsence` added
- `ivr:snapshot-updated` — per-ticker from on-demand, `{ ticker: null }` once per batch
- `_test:iv-series-set`, `_test:iv30-history`, `_test:iv30-gaps`, `_test:daily-bar-requests`,
  `_test:iv-history-recompute`, `_test:iv30-corrupt`, `_test:table-exists` (new, dev-only);
  `_test:ivr-set-outcomes`, `_test:ivr-fetch-log` (removed)
- `CollectIvrNowBatchSchema` — [contracts/zod-schemas.md](../contracts/zod-schemas.md)

## Source files

- Core: `src/main/core/black-scholes.ts`, `iv30-selection.ts`, `iv30.ts`, `iv-metrics.ts`,
  `ivr-freshness.ts`, `watchlist-signal.ts`, `screener.ts`, `trading-calendar.ts`
- Test fixture builder: `src/main/core/test-fixtures/iv30-bars.ts`
- Migration: `migrations/016_create_iv30_history.sql`
- Integrations: `src/main/integrations/market-data-provider.ts`, `alpaca-market-data.ts`,
  `alpaca-market-data-mappers.ts`, `fake-market-data.ts`, `fake-clock.ts`
- Services: `src/main/services/iv-history.ts`, `iv-history-store.ts`, `iv-history-read.ts`,
  `iv-run-state.ts`, `ivr-collector.ts`, `ivr-on-demand.ts`, `ivr-snapshots.ts`,
  `watchlist-snapshot.ts`, `screener.ts`, `trading-calendar-store.ts`
- IPC / wiring: `src/main/ipc/test-iv-history.ts`, `src/main/ipc/watchlist.ts`,
  `src/main/ipc/screener.ts`, `src/main/schemas.ts`, `src/main/index.ts`, `src/main/test-utils.ts`
- Preload: `src/preload/index.ts`, `src/preload/index.d.ts`
- Renderer: `src/renderer/src/components/IvrCell.tsx`, `ReadingNote.tsx`, `BenchCard.tsx`,
  `BenchDetail.tsx`; `src/renderer/src/lib/ivr-tooltip.ts`, `screener-format.ts`;
  `src/renderer/src/api/screener.ts`, `watchlist.ts`, `ivr.ts`;
  `src/renderer/src/pages/SettingsPage.tsx`
- E2E: `e2e/iv-history.spec.ts` (all AC rows), `e2e/ivr-helpers.ts` (series builders),
  `e2e/screener-helpers.ts`, `e2e/trading-day-fixtures.ts`; existing IVR specs
  (`ivr-collector`, `ivr-on-demand`, `ivr-staleness`, `ivr-watchlist-collection`, screener and
  watchlist specs) migrated to the series seam
- Deleted: `src/main/integrations/barchart-ivr-scraper.ts`, `src/main/integrations/fake-ivr.ts`,
  `src/main/ipc/test-ivr.ts`

Sources: [extract: us-121](../.extracts/us-121.md), `plans/us-121/`,
`docs/us-121-implementation.md`. Related:
[us-43](./us-43-barchart-ivr-scraper.md) (retired),
[us-44](./us-44-ivr-snapshot-store-and-scheduler.md),
[us-97](./us-97-collect-ivr-for-watchlist-underlyings.md),
[us-98](./us-98-ivr-staleness-tiers.md),
[us-100](./us-100-ivr-on-demand-and-outside-market-hours.md),
[us-116](./us-116-market-facts-from-market-data-provider.md).

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
