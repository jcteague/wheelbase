# Research: US-121 — Compute IV rank from our own IV history instead of scraping Barchart

Story: [OPT-27](https://linear.app/optionswheel/issue/OPT-27/us-121-compute-iv-rank-from-our-own-iv-history-instead-of-scraping)
(Linear is the only place the story is edited.) Planned 2026-09-20 against `main` at `55773d2`.

Primary sources, in order of authority: the Linear story (methodology, every numbered gate),
`docs/opt-27-spike-results.md` + `scripts/spike-iv-history.mjs` (what Alpaca actually serves
and a working reference implementation of the arithmetic), `US-121-review.md` and
`docs/opt-27-proposed-changes.md` (why the quote-based design was dropped). No external research
agents were dispatched: the two technical unknowns a first read raises — "does Alpaca serve the
input?" and "does the inversion converge on real bars?" — were both settled by the spike on the
live account (251/251 sessions, 0 inversion failures, 4 liquid + 8 thin names).

## Current state of the code (verified against `src/`)

| Concern        | Today                                                                                                                                                             | What this story changes                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| IVR source     | `fetchIVR` in `integrations/barchart-ivr-scraper.ts`; dead behind AWS WAF                                                                                         | Deleted. IV30 computed in-house from Alpaca daily bars                                                                                                |
| Storage        | `ivr_snapshot (underlying, observed_at, ivr, ivp, iv30, source)` — one derived rank per session                                                                   | New `iv30_reading` (series + inputs) and `iv30_gap`; `ivr_snapshot` dropped by the same migration                                                     |
| Collector      | `collectIVRSnapshots` / `collectTicker` in `services/ivr-collector.ts`; fake seam `fake-ivr.ts` keyed on `WHEELBASE_FAKE_IVR`; scheduled runs refused on closures | Same job name (`ivr-collect`), same IPC (`ivr:collect-now`), same targets query; body becomes per-ticker `collectIvHistory`; closed-day guard removed |
| On-demand      | `services/ivr-on-demand.ts` → `collectTicker`, skips when a same-session row exists                                                                               | Calls `collectIvHistory` (backfill or catch-up); the service's own `up_to_date` outcome replaces the same-session check                               |
| Read path      | `getLatestIvrByUnderlying` → newest `ivr_snapshot` row → `assessIvRank`                                                                                           | `readIvMetricsByUnderlying` computes rank/percentile/range from the series; `assessIvRank` ages the anchor session                                    |
| Reading shape  | `AssessedIvRank { value, observedAt, ageTradingDays, state }`, `IpcIvRank` mirror, `ScreenerIvRank` mirror                                                        | `value` becomes `string \| null` (flat window); `percentile`, `low`, `high` added                                                                     |
| Provider       | `MarketDataProvider` has snapshots, chain, clock, calendar — **no bars**                                                                                          | `getOptionDailyBars`, `getStockDailyBars` added; `AlpacaMarketDataProvider` + `FakeMarketDataProvider` implement them                                 |
| Calendar store | reads 45 back / 2 ahead; refreshes 120 back / 400 ahead, weekly                                                                                                   | reads 400 back / 50 ahead; refreshes 420 back; also refreshes when stored `first_day` is too late                                                     |
| Renderer       | `IvrCell` renders `value` + freshness ring + tooltip (`lib/ivr-tooltip.ts`); `ReadingNote`                                                                        | Tooltip gains percentile and 52-week range; `null` rank renders `n/a` but keeps the tooltip                                                           |
| E2E seam       | `_test:ivr-set-outcomes`, `_test:ivr-fetch-log`, `_test:ivr-set-now`, `okOutcome(...)` in 6 specs + 2 helpers                                                     | Fake provider synthesises bars from a programmed IV series; new `_test:iv-*` channels; fake clock survives as its own module                          |

Dependencies the story lists as Done are on `main`: `getMarketCalendar` is on `MarketDataProvider`
(`integrations/market-data-provider.ts`), `persistSnapshot` stamps `observed_at` at the session
close (`ivr-collector.ts`), `addWatchlistEntry` fires `ivrOnDemand.collect` (`services/watchlist.ts`),
`IvrCell`/`FreshnessRing`/`ivr-tooltip` exist. Nothing here waits on another branch.

## Alpaca facts this plan depends on (from the spike, 2026-09-18, free plan)

- `GET https://data.alpaca.markets/v1beta1/options/bars?symbols=<≤100 OCC>&timeframe=1Day&start=YYYY-MM-DD[&end=YYYY-MM-DD]&limit=10000[&page_token=…]`
  → `{ bars: { [symbol]: [{ t, o, h, l, c, v, n, vw }] }, next_page_token }`. Symbols with no data
  are simply absent from `bars`. Expired contracts are served back to January 2024.
- `GET https://data.alpaca.markets/v2/stocks/bars?symbols=<ticker>&timeframe=1Day&feed=sip&adjustment=raw&start=…[&end=…]&limit=10000`
  → same shape. **SIP** daily bars are served on the free plan, including the current session's
  bar after the close (verified 18:46 ET). IEX VWAP differs from SIP by ~0.25%, ~1 vol point ATM.
- `end` set to the current calendar day → `403 OPRA agreement is not signed`. `end` on a prior
  session, or omitted, succeeds. This is why the request rule below is a hard rule.
- Daily `t` is midnight Eastern expressed in UTC (`…T04:00:00Z` / `…T05:00:00Z`). The session
  day is `etDateOf(t)` — never `t.slice(0, 10)` (CLAUDE.md date rule; a UTC slice is the same day
  here only by accident of the offset sign).
- Rate limit ~200 req/min; `apiFetch` already retries 429 twice honouring `Retry-After`.
  One-year backfill ≈ 25–35 requests per ticker (2,300–3,000 probed symbols / 100 per call).
- Chain endpoint lists live contracts only → historical OCC symbols must be constructed; expect
  only 35–60% of probed symbols to exist.

## Architecture Decisions

### ADR: IV30 is inverted from daily bar VWAP against a stored constant rate

- **Decision:** For each session and each selected expiration, price = the option's daily bar
  `vw`, underlying = the SIP daily bar `vw` of the same session. Invert European Black–Scholes
  (no dividends, `r = 0.045`, `q = 0`, stored with every reading) for the call and the put at the
  chosen strike, average the two, then interpolate the two expirations to exactly 30 days in
  **total variance** (`w = σ²T`, `σ30 = sqrt(w30 / T30)`). Today's reading, the backfill and
  the catch-up all run this one engine; Alpaca's per-contract `impliedVolatility` is never used
  for rank.
- **Why:** Alpaca has no historical option quotes, so the story's earlier closing-mid / implied-
  forward design has no input. Rank is self-relative, so the only thing that matters is that the
  series is consistent with itself; mixing our inverted history with vendor IV for today would rank
  apples against oranges (spike finding 3: the two methods disagreed on AAPL's 52-week high by 10
  rank points). Daily VWAP agreed with near-close minute bars to within half a vol point at a
  tenth of the request cost and with no coverage gaps (spike finding 2).
- **Alternatives considered:** near-close 1-minute bars (10× requests, tripped the rate limit,
  9–43% of sessions incomplete); hour bars (not measured, daily was sufficient); implied forward
  from a simultaneous call/put quote (no simultaneous quotes exist); a rate series (deferred — the
  stored rate makes it a recompute, not a refetch).

### ADR: Persist the IV30 series with typed inputs; derive rank, percentile and range on read

- **Decision:** New table `iv30_reading` keyed `(underlying, session, method)`, one row per
  session holding `iv30` **and everything that produced it**: underlying VWAP, expiration tier,
  near and far expiration, strike per expiration, the four option VWAPs and trade counts, rate,
  dividend yield, `engine_version`, and `observed_at` = the session's close instant. IV rank,
  percentile and the 52-week range are pure functions of the series (`core/iv-metrics.ts`) and are
  computed on every read; nothing derived is stored. `ivr_snapshot` is dropped.
- **Why:** The engine is new and will be wrong at least once; Alpaca's history window is finite
  and rolls forward; "why did AAPL read 25 that day?" must be answerable. Typed columns because
  the input set for `daily_vwap` is small and fixed, and typed columns query and validate better
  than JSON. Deriving on read is what makes a corrected engine correct every metric at once.
- **Alternatives considered:** store rank alongside (drift risk, and a recompute would have to
  touch two things); versioned JSON inputs (harder to query, no column-level validation); reuse
  `ivr_snapshot` with new columns (its PK is `(underlying, observed_at)` and its rows are
  Barchart-derived — mixing provenance in one table is exactly what `source` was meant to avoid).

### ADR: A session that cannot produce a reading is recorded as a gap — except the newest one

- **Decision:** `iv30_gap (underlying, session, method, reason, attempted_at)` records every
  session the engine tried and could not read (`no_underlying_bar`, `no_tradeable_pair`). A gap is
  a _result_, not a reading: it never contributes a value, it counts against the 200-of-252
  coverage gate, and it stops the next run from re-probing that session. The **most recent
  completed session is never written as a gap** — a bar that has not arrived yet is retried by the
  next run instead of being recorded as permanently missing.
- **Why:** "Missing sessions" must be computable without re-fetching: without gap rows every
  nightly run on a thin name would re-probe every historical gap (ETSY: 16 sessions ≈ 7 requests a
  night, for nothing). The newest-session exception exists because the run fires 60 minutes after
  the close and the day's bar could conceivably lag; a wrongly recorded gap would suppress that
  session forever.
- **Alternatives considered:** a nullable `iv30` on `iv30_reading` (violates "no reading is stored
  for that day" and complicates every coverage query); no gap table with unbounded re-probing
  (wasteful, and on a laptop offline for weeks the nightly catch-up would grow); retrying gaps on a
  schedule (Alpaca does not revise daily bars, so there is nothing to wait for).

### ADR: The rank window is the 252 completed sessions strictly before the anchor session

- **Decision:** The anchor is the session of the ticker's **latest stored reading**. The window is
  the 252 sessions immediately preceding it on the cached exchange calendar; the anchor's own
  reading is ranked against the window but is not part of it. Metrics are published only when
  **≥ 200** of those 252 sessions hold a reading; otherwise rank, percentile, low and high all
  read `n/a`. `rank = (today − low) / (high − low) × 100` clamped to `[0, 100]`, `null` when
  `high === low`. `percentile = count(window readings strictly below today) / count(window) × 100`.
  Both round half-up to an integer via `Decimal`. `observedAt` on the published reading is the
  anchor session's close, so US-98's tiers age a stale anchor exactly as before.
- **Why:** Every scenario's arithmetic assumes today is excluded from its own range (0.2475 in
  0.18–0.45 → 25; 0.47 clamps to 100 while the high still reports 0.45). Rank is a min/max
  statistic, so one missed spike day corrupts the max for a year — coverage is not cosmetic;
  percentile degrades gracefully, which is why both are reported. Anchoring on the latest reading
  rather than on today keeps a stale series legible (and marked stale) instead of vanishing.
- **Alternatives considered:** 52 calendar weeks (session count is the unit freshness already
  speaks in); including today in the window (breaks the clamp scenario); withholding only rank on
  sparse coverage (a range built on 150 sessions is precisely the untrustworthy number the gate
  exists to hide).

### ADR: `AssessedIvRank.value` becomes nullable; percentile, low and high travel with it

- **Decision:** `IvRankReading = { value: string | null; percentile: string; low: string; high:
string; observedAt: string }` is what the service hands `assessIvRank`; `AssessedIvRank` adds
  `ageTradingDays` and `state` as today. `value` is the integer rank as a string (`'25'`) or `null`
  for a flat window. `IpcIvRank` and `ScreenerIvRank` mirror it. The screener core's `IvRank`
  (`{ value: string; observedAt }`) is unchanged — `usableIvRanks` already filters to usable
  readings and now also drops `value === null`, so `iv_rank_floor` never sees a null. `ivGate`
  treats a null value as `unknown('IV unavailable')`.
- **Why:** "A flat window withholds rank but not percentile" needs a reading that carries a
  percentile and a range while showing `n/a` for rank. Widening the existing field is a
  three-file ripple (`IvrCell`, `ReadingNote`, `ivGate`) — renaming it would touch every test and
  type mirror for no domain gain.
- **Alternatives considered:** a separate `ivMetrics` field on the bench row beside `ivRank` (two
  fields describing one reading, two freshness verdicts to keep aligned); keep `value: string` and
  drop the flat-window scenario (the story chose to specify it).

### ADR: Daily bars are two `MarketDataProvider` capabilities; the adapter hides batching and paging

- **Decision:** `getOptionDailyBars({ symbols, start, end? })` → `Map<symbol, DailyBar[]>` and
  `getStockDailyBars({ symbol, start, end? })` → `DailyBar[]`, where `DailyBar = { date, vwap,
close, volume, tradeCount }` with `date` the Eastern session day. `AlpacaMarketDataProvider`
  chunks symbols 100 per request, follows `next_page_token`, requests `feed=sip` for stocks, and
  emits `end` **only when the caller supplies one**. `IvHistoryBarSource = Pick<MarketDataProvider,
'getOptionDailyBars' | 'getStockDailyBars'>` is the slice the service takes. Both are market
  facts and never touch `BrokerProvider`.
- **Why:** CLAUDE.md's port rule — one capability, one port; the adapter hides how many calls it
  takes. The service should reason about sessions and symbols, not about 100-symbol pages.
- **Alternatives considered:** a single `getDailyBars(kind, …)` (two response shapes behind one
  name); a separate `IvHistorySource` port (a second market-data port for the same vendor and
  credentials is exactly the split US-116 undid).

### ADR: The service, not the adapter, guarantees "never name today as `end`"

- **Decision:** `collectIvHistory` computes `end` as the most recent completed session's date when
  that date is **before** `etDateOf(now)`, and omits `end` when the most recent completed session
  _is_ today (the evening run). The adapter passes `end` through verbatim. A unit test on the
  service pins both branches; the e2e asserts across every recorded fake request.
- **Why:** The rule is about the run's relationship to the trading day, which only the service
  (holding the calendar and the clock) knows. Putting a "strip today" guard in the adapter would
  silently change a request instead of making the caller correct.
- **Alternatives considered:** always omit `end` (Alpaca then serves through the present, which for
  a backfill of missing _historical_ sessions returns hundreds of unwanted bars per symbol and
  multiplies pages); clamp in the adapter (hides the bug the rule exists to prevent).

### ADR: Contract selection is generic over candidate expirations; one-sided brackets do not extrapolate

- **Decision:** `selectExpirationPair(session, candidates)` filters candidates to DTE ≥ 7, then
  picks the largest ≤ 30 DTE and the smallest > 30 DTE. Exactly 30 DTE → that expiration alone.
  If only one side exists, the **single nearest usable** expiration is used alone (`far: null`);
  no extrapolation. Weekly candidates are every Friday in `[session+7, session+45]` shifted to the
  prior session when the Friday is a closure; monthly candidates are the third Fridays in
  `[session+7, session+70]`, shifted the same way. Weekly tier first; monthly tier when either
  weekly expiration finds no qualifying strike. Strike candidates are floor/ceil of the underlying
  VWAP at increments 0.5, 1, 2.5 and 5, deduplicated, nearest first. A strike qualifies when both
  legs have a bar with `tradeCount ≥ 1` **and both invert**; an inversion failure (VWAP ≤ discounted
  intrinsic) disqualifies that strike, and the next-nearest is tried.
- **Why:** The near-expiry scenario outline speaks in terms of listed expirations (3/31, 7/35),
  which only a candidate-list function can express and test directly. Treating an inversion
  failure like an untraded leg is the smaller rule — "a strike is usable when both legs traded and
  both price above intrinsic" — and it produces fewer gaps than the story's literal "an inversion
  fails → the session is a gap" while preserving its intent (a session is a gap only when _no_
  strike in either tier is usable). The spike saw zero inversion failures, so this affects thin
  names at the margin only. Negative-weight variance interpolation from a one-sided bracket is a
  spike shortcut, not a method; flat use of the nearest expiration is conservative and explicit.
- **Alternatives considered:** hard-coded "two Fridays around D+30" (cannot express the outline);
  gap on first inversion failure (story-literal; more gaps, no upside); linear extrapolation
  (produces a "30-day" number from no 30-day information).

### ADR: The closed-day guard is removed; idempotence over missing sessions replaces it

- **Decision:** `collectIVRSnapshots` no longer takes a `trigger` and no longer consults the calendar
  for permission. On any day, each ticker's run computes the required sessions that have neither a
  reading nor a gap and fetches only those; on a weekend or holiday that set is empty, the ticker is
  `up_to_date`, and no bar request is made. `skippedReason` loses `'market_closed'`. The scheduler's
  `JobRunContext.trigger` is left in place (US-46 infrastructure, exercised by
  `_test:scheduler-run-scheduled`) and simply has no consumer after this story. Supersedes the
  `ivr-non-trading-day-guard-in-collector` ADR and its US-100 amendment.
- **Why:** The guard existed to stop a scheduled Saturday run re-scraping Friday's Barchart number.
  With bars, the run already knows what it holds; a closed-day run is a no-op by construction, so
  a second mechanism to make it a no-op is duplicated intent. Removing it also removes the one
  reachable-only-by-race value on `ivr:collect-now` (an explicit click joining a scheduled run).
  Planning review 2026-09-20 asked whether we can still compute on a closed day — we always could
  on the explicit path; now both paths behave identically.
- **Alternatives considered:** keep the guard for the scheduled path only (two behaviours for one
  job, protecting a request that no longer happens); skip the weekly calendar refresh on closures
  too (one small throttled request; not worth a branch).

### ADR: A market-data auth failure aborts the run as a skip; every other failure is per-ticker

- **Decision:** `collectIVRSnapshots` catches a `MarketDataError` with code `auth_failed` from the
  first ticker and returns `{ successCount: 0, errorCount: 0, skippedCount: 0, skippedReason:
'market_data_unavailable' }` with one INFO line. Any other error — network, rate limit, a bad
  symbol, an engine throw — is caught inside that ticker's `try/catch`, logged under `err`, counted
  as `failed`, and the loop continues. `persistIvHistory` (the DB write) stays outside the
  per-ticker catch, as `persistSnapshot` does today: a failing write is systemic.
- **Why:** With no credentials every ticker fails identically; 25 WARN lines and `errorCount: 25`
  would report a configuration state as a broken run. The story asks for "collection is skipped
  with a log line". Everything else is the batch failure-isolation rule
  (`alert-evaluation-failure-isolation` ADR, CLAUDE.md).
- **Alternatives considered:** ask `settings.getCredentialStatus()` first (couples the collector to
  the settings service and duplicates the factory's credential resolution — the same drift the main
  process fixed once already); treat auth like any other per-ticker failure (noisy, misleading).

### ADR: The calendar store's lookback widens to cover the rank window

- **Decision:** `READ_LOOKBACK_DAYS` 45 → 400, `READ_LOOKAHEAD_DAYS` 2 → 50, `REFRESH_LOOKBACK_DAYS`
  120 → 420. `needsRefresh` also returns true when stored `first_day` is later than
  `now − READ_LOOKBACK_DAYS`, so an install upgraded from the 120-day cache refetches once. The
  refresh interval (7 days) and lookahead (400) are unchanged.
- **Why:** 252 sessions ≈ 365 calendar days, plus up to ten stale sessions on the anchor, plus the
  expiration horizon (Friday holiday shifting needs future sessions up to ~45 days out). The
  `trading-calendar-fetched-and-cached` ADR's "read never fetches" rule is untouched; only the
  bounds move. 400 rows is still one indexed range scan.
- **Alternatives considered:** a second, wider read function for the IV service (two readers of one
  table with two bounds); computing the window from `iv30_reading` + `iv30_gap` alone (a session
  never attempted would then not count against coverage, which is the gate's whole point).

### ADR: Recompute is driven by `engine_version`; the run recomputes stale-version rows before it fetches

- **Decision:** `IV30_ENGINE_VERSION` (integer) lives in `core/iv30.ts` and is stamped on every row.
  `recomputeIvHistory(db, { force? })` re-runs `iv30FromInputs` over every row whose
  `engine_version < IV30_ENGINE_VERSION` (or every row when forced), rewriting `iv30` and the
  version in one transaction, and makes **no provider request**. `collectIvHistory` calls it for
  the ticker before computing missing sessions. A defect in strike or expiration _selection_ may
  need a discarded candidate; that correction is a refetch and the story says so — the
  no-refetch guarantee covers what the stored inputs can reproduce.
- **Why:** A corrected engine must correct every derived metric, and since metrics are derived on
  read the only thing to correct is `iv30` itself. Version-stamping makes the upgrade automatic and
  idempotent; the e2e scenario drives the same function through a dev-only channel.
- **Alternatives considered:** a Settings button (UI for a maintenance event nobody schedules);
  recompute on app start (the daily run already owns the write path and its isolation).

### ADR: The e2e seam is a fake provider that synthesises bars from a programmed IV series

- **Decision:** `FakeMarketDataProvider.getOptionDailyBars` prices every requested symbol for every
  fixture session with the real `core/black-scholes.ts` pricer at that session's target IV (a flat
  vol surface), so the real engine's selection, gates and total-variance interpolation run end to
  end and invert back to exactly the programmed number. `getStockDailyBars` serves the fixture
  price as VWAP. The fixture is `Record<ticker, { price, tradeCount?, weeklyTradeCount?, latencyMs?,
failWith?, sessions: Record<YYYY-MM-DD, number | { iv, untraded?, tradeCount?, weeklyTradeCount?
}> }>`, loaded from `WHEELBASE_FAKE_IV_SERIES` at boot and replaceable through
  `_test:iv-series-set`. The fake also records every bar request (`kind`, `start`, `end`) and
  counts them, so "no request was made" and "no request named today as `end`" are assertable.
  `fake-ivr.ts`, `WHEELBASE_FAKE_IVR`, `_test:ivr-set-outcomes` and `_test:ivr-fetch-log` are
  removed; the fake clock (`WHEELBASE_FAKE_NOW`, `_test:ivr-set-now`) moves to
  `integrations/fake-clock.ts` unchanged in behaviour.
- **Why:** The story names the seam: "fake option and underlying bars fed to the real engine".
  Synthesising from a series keeps fixtures to ~6 KB per ticker (252 numbers) instead of ~80 KB of
  literal bars, needs no copy of the pricer or of expiration selection inside `e2e/`, and makes a
  session's expected IV30 exactly the number the spec wrote down. A flat surface means the fake
  needs no knowledge of which strikes or expirations the engine will choose.
- **Alternatives considered:** literal bars programmed from `e2e/` (needs a Black–Scholes copy and
  a mirror of expiration selection in the test tree, and 80 KB env payloads that exceed the 128 KB
  per-variable limit on Linux once four tickers are seeded); writing an `iv30_reading` series
  directly (skips selection, gates and interpolation — the parts the story wants exercised).

### ADR: Barchart is retired from code and schema, not just from the read path

- **Decision:** Delete `integrations/barchart-ivr-scraper.ts` (+ test), `integrations/fake-ivr.ts`
  (+ test), the `_test:ivr-set-outcomes` / `_test:ivr-fetch-log` channels and their preload
  entries. (`cheerio` in `package.json` is not imported anywhere under `src/` — a pre-existing
  unused dependency, noted, not this story's to remove.) Drop the `ivr_snapshot` table in migration 016. Keep the `ivr-collect` job name, the `ivr:collect-now` channel, the
  `ivr:snapshot-updated` push, the `IvrOnDemand` port and the Settings "Refresh IVR now" action.
  This supersedes the `barchart-as-canonical-ivr-source` ADR.
- **Why:** The collector is the scraper's only caller; once it stops calling, the module is dead
  code our change created, which CLAUDE.md says to remove. The same argument covers the table:
  the story first said "keep the rows for provenance", but Barchart's rank is a different quantity
  from ours, so the rows can never be compared with the new series, they are stale past the
  ten-session boundary within two weeks, and a table nothing reads is spec drift with a test
  surface that exists only to prove it is ignored. Planning review (2026-09-20) chose to drop it,
  and the Linear scenario was reworded to "Barchart readings are removed on upgrade". The channel and job names are the
  shared vocabulary of six e2e specs, the scheduler registry test and the renderer — renaming them
  is out of scope and buys nothing.
- **Alternatives considered:** keep the scraper as a fallback (the story rules it out; the WAF
  challenge is the vendor asking for a human); keep `ivr_snapshot` for provenance (the story's
  original wording — rejected above); rename `ivr:*` to `iv-history:*` (churn without behaviour).

### ADR: The pricer uses `Number`; `Decimal` is applied at the storage boundary only

- **Decision:** `core/black-scholes.ts` computes in IEEE doubles (log, sqrt, exp, a rational
  normal-CDF approximation, bisection on `[0.001, 10]` for 100 iterations). Results are converted
  to 4-dp `TEXT` with `Decimal` `ROUND_HALF_UP` when a reading is built. Rank and percentile
  rounding use `Decimal`.
- **Why:** `decimal.js` has no `exp`/`ln`-based normal CDF worth the cost, and an implied
  volatility is a model output, not money. A double carries ~15 significant digits; the stored
  value keeps four. The half-up integer rounding of 71.43 → 71 is the one place a tie could bite,
  and `Decimal` owns that.
- **Alternatives considered:** `Decimal` throughout (slow bisection, no gain); a dependency for
  Black–Scholes (thirty lines, and the spike already wrote them).

## Open Questions

None blocking. Two items are carried forward as known limits rather than questions:

- Strike grids for names priced under 10 or over 1000, and names listing only monthlies, are
  unverified (story: "Not yet verified"). The probe set tolerates misses, so the failure mode is a
  gap and `n/a`, not an error.
- A full-bench backfill on a fresh install (~30 requests × N tickers) can brush the 200 req/min
  limit; `apiFetch`'s two 429 retries plus per-ticker isolation mean the worst case is a ticker
  reported `failed` and completed by the next run. Not tuned further here.
