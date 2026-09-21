---
story: us-121
kind: feature
parent: null
topics:
  [
    market-data,
    iv-history,
    ivr-freshness,
    screener,
    trading-calendar,
    ipc-handlers,
    zod-schemas,
    tables,
    migrations
  ]
status: planned
---

# Implementation Plan: US-121 — Compute IV rank from our own IV history instead of scraping Barchart

## Summary

Barchart is unreachable, so IV rank is rebuilt from data we are entitled to: a pure engine in
`src/main/core/` inverts European Black–Scholes over Alpaca **daily option-bar VWAP** against the
underlying's **SIP daily VWAP**, selects strikes and bracketing expirations with numbered gates,
and interpolates to a 30-day IV in total variance. The series is persisted per session **with its
inputs** (`iv30_reading`) and gaps are recorded (`iv30_gap`); rank, percentile and the 52-week
range are derived on read over the 252 sessions before the latest reading, published only at
≥ 200 coverage. The existing `ivr-collect` job, `ivr:collect-now` channel, watchlist-add trigger,
freshness tiers, `IvrCell` and screener floor all keep working on the new value; the Barchart scraper, its fake, its e2e seam and its `ivr_snapshot` table are deleted; the seam is replaced by a fake provider that synthesises bars from a programmed IV series. Done means: a fresh install with Alpaca credentials shows an
integer IV rank (with range and percentile in the tooltip) for every bench name within one run,
the screener floor gates on it, and every acceptance scenario is an e2e test.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-27 / US-121](https://linear.app/optionswheel/issue/OPT-27/us-121-compute-iv-rank-from-our-own-iv-history-instead-of-scraping) — the only editable copy
- **Spike evidence:** `docs/opt-27-spike-results.md`, `scripts/spike-iv-history.mjs` (reference arithmetic)
- **Research & Design Decisions:** `plans/us-121/research.md`
- **Data Model & Selection Logic:** `plans/us-121/data-model.md`
- **API Contract(s):** `plans/us-121/contracts/market-data-provider-daily-bars.md`, `plans/us-121/contracts/ivr-collect-now.md`, `plans/us-121/contracts/watchlist-snapshot-ivrank.md`, `plans/us-121/contracts/test-iv-history.md`
- **Quickstart & Verification:** `plans/us-121/quickstart.md`

## Prerequisites

All on `main` at `55773d2`:

- `MarketDataProvider.getMarketCalendar` and `trading_session` (US-98/US-116) — the calendar the
  window and expiration shifting read.
- `collectIVRSnapshots` / `IvrOnDemand` / `ivr:snapshot-updated` (US-44/US-97/US-100) — the job,
  trigger and push this story re-bodies.
- `assessIvRank`, `IvrCell`, `FreshnessRing`, `ivr-tooltip.ts` (US-98/US-96) — the freshness and
  display surfaces this story feeds.
- `buildOccSymbol` / `parseOccSymbol` (`src/shared/option-symbol.ts`), `mapWithConcurrency`,
  `etDateOf` / `etInstantAt`, `apiFetch` with 429 retry.
- `decimal.js`, `date-fns`, `pino`. No new dependency. (`cheerio` in `package.json` is already
  unused by anything under `src/` — pre-existing dead weight, noted here, not removed by this story.)

## Implementation Areas

### 1. Black–Scholes pricer and inversion

**Files to create or modify:**

- `src/main/core/black-scholes.ts` — `normalCdf`, `blackScholesPrice`, `impliedVolatility` (pure, `Number` math)
- `src/main/core/black-scholes.test.ts`

**Red — tests to write:**

- `normalCdf(0)` is `0.5`; `normalCdf(1.96)` ≈ `0.975` and `normalCdf(-1.96)` ≈ `0.025` within `1e-6`; large magnitudes saturate to 0/1.
- `blackScholesPrice` call and put satisfy put–call parity `C − P = S·e^{−qT} − K·e^{−rT}` within `1e-9` for `S=200, K=200, T=30/365, r=0.045, q=0, σ=0.25`.
- A call is monotone increasing in `volatility`; price at `σ → 0` tends to discounted intrinsic.
- `impliedVolatility` round-trips: price at σ=0.2475 then invert → `0.2475` within `1e-8`, for a call and a put, ATM and 2% OTM, at 7 and 45 DTE.
- `impliedVolatility` returns `null` when `price ≤ discounted intrinsic` (e.g. deep ITM call priced at intrinsic) and when `price` is 0 or negative; returns `null` (not throws) for `yearsToExpiry ≤ 0`.
- Bisection converges for σ as low as 0.02 and as high as 4.0.

**Green — implementation:**

- `normalCdf` via the Abramowitz–Stegun 26.2.17 rational approximation (the spike's `ncdf`), symmetric for negative `x`.
- `blackScholesPrice({ type, spot, strike, yearsToExpiry, rate, dividendYield, volatility })` with continuous dividend yield (`q` is always `0` in this story, but the parameter exists so a dividend model is a recompute later).
- `impliedVolatility(...)`: guard `price > intrinsic`, bisection on `[0.001, 10]` for 100 iterations; `null` when unbracketed.

**Refactor — cleanup to consider:**

- Keep the module free of `Decimal` and of any import outside `core/`; check naming matches `costbasis.ts` style (exported plain functions, `type` not `interface`).

**Acceptance criteria covered:**

- Foundation for "Today's reading is computed the same way as the history" (the one engine both paths share).

### 2. Expiration and strike selection

**Files to create or modify:**

- `src/main/core/iv30-selection.ts` — `weeklyCandidates`, `monthlyCandidates`, `selectExpirationPair`, `strikeCandidates`, `daysToExpiry`, `planSessionProbe`
- `src/main/core/iv30-selection.test.ts`

**Red — tests to write:**

- `selectExpirationPair` scenario-outline rows: candidates at `[+3, +31]` → near excluded → `{ near: +31, far: null }`; `[+6, +34]` → `{ near: +34, far: null }`; `[+7, +35]` → `{ near: +7, far: +35 }`; `[+9, +37]` → `{ near: +9, far: +37 }`; `[+14, +45]` → `{ near: +14, far: +45 }`.
- Exactly 30 DTE in candidates → `{ near: +30, far: null }`; bracketing Fridays `[+24, +31]` → `{ near: +24, far: +31 }`; all candidates `> 30` → nearest alone; all `< 7` → `null`.
- `weeklyCandidates(session, sessions)`: returns every Friday between `+7` and `+45` inclusive; a Friday that is not in `sessions` (holiday) is replaced by the prior session; a Friday under 7 DTE is not returned.
- `monthlyCandidates`: returns third Fridays in `[+7, +70]` (asserts on a fixed session like `2026-03-12`: `2026-03-20` is 8 DTE → included; `2026-04-17`, `2026-05-15`); Good-Friday-style closure shifts to Thursday.
- `strikeCandidates(200.4)` → `[200.5, 200, 201, 202.5, 205]` (nearest first, deduplicated); `strikeCandidates(200)` → `[200]`; `strikeCandidates(37.3)` → `[37.5, 37, 38, 35, 40]`.
- `daysToExpiry('2026-03-12', '2026-04-11')` is `30`; DST boundary (`2026-03-06` → `2026-04-05`) is `30`, not `29`/`31`.
- `planSessionProbe` builds `C` and `P` OCC symbols for every strike × expiration in both tiers via `buildOccSymbol`; `weekly`/`monthly` are `null` when the tier has no pair; symbol list is deduplicated.

**Green — implementation:**

- Constants `TARGET_DTE = 30`, `MIN_DTE = 7`, `STRIKE_INCREMENTS = [0.5, 1, 2.5, 5]` per `data-model.md §2`.
- `daysToExpiry` with `differenceInCalendarDays(parseISO(expiration), parseISO(session))` (no string slicing, no `Date` subtraction).
- Friday/third-Friday enumeration with `date-fns` (`eachWeekOfInterval`/`nextFriday` or a simple day walk), shifting with a `Set` of session dates; DTE filter after shifting.
- `selectExpirationPair` per the rules in `research.md` (largest ≤ 30, smallest > 30, one-sided → nearest alone).

**Refactor — cleanup to consider:**

- `ExpirationPair`/`ExpirationTier` types exported once here and imported by `iv30.ts`; no duplicated Friday arithmetic between weekly and monthly helpers (one `shiftToSession` helper).

**Acceptance criteria covered:**

- Scenario Outline "Expirations too near expiry are excluded from IV30" (all five rows).
- Setup for "An untraded strike is skipped for its neighbour" (strike order) and "Thin weeklies fall back to the monthly expirations" (monthly candidates).

### 3. IV30 reading engine

**Files to create or modify:**

- `src/main/core/iv30.ts` — `computeIv30`, `iv30FromInputs`, constants, `DailyBar`/`LegSelection`/`Iv30Inputs`/`Iv30Reading`/`Iv30Outcome` types
- `src/main/core/iv30.test.ts`
- `src/main/core/test-fixtures/iv30-bars.ts` — a test-only bar builder that prices legs at a target IV with `blackScholesPrice` (mirrors what the fake provider will do; shared by areas 3, 7 and 9 tests)

**Red — tests to write:**

- Flat surface at σ=0.2475, price 200.4, weekly pair present, both legs `tradeCount ≥ 1` → `reading` with `iv30 === '0.2475'`, `tier === 'weekly'`, `near.strike === '200.5000'`, trade counts copied from the bars, `rate === '0.0450'`, `dividendYield === '0.0000'`.
- Near expiration σ=0.20, far σ=0.30 at 24/31 DTE → `iv30` equals the hand-computed total-variance interpolation (assert the exact 4-dp string, not "between").
- Exactly-30-DTE plan (`far: null`) → `iv30 === nearIV`, `far === null` on the reading.
- Nearest strike's **call** has no bar → the next-nearest strike (both legs traded) is used; `near.strike` reflects it and the untraded strike appears nowhere on the reading. Same with `tradeCount: 0` on the put.
- Nearest strike's call VWAP at/below intrinsic (inversion fails) → next strike is used; if no strike inverts → contributes to the tier failing.
- Every weekly strike fails the gate but the monthly pair passes → `tier === 'monthly'` and the monthly expirations are on the reading.
- No strike passes in either tier → `{ status: 'gap', reason: 'no_tradeable_pair' }`.
- `underlyingBar` undefined → `{ status: 'gap', reason: 'no_underlying_bar' }` (option bars ignored).
- `iv30FromInputs(reading)` over the inputs of a computed reading reproduces `reading.iv30` exactly; `iv30FromInputs` with a stored call VWAP below intrinsic → `null`.
- `computeIv30` never uses a vendor `impliedVolatility` field (type-level: `DailyBar` has none — assert the fixture type has exactly `date, vwap, close, volume, tradeCount`).

**Green — implementation:**

- Per `data-model.md §2` rules 1–5. Strings out via `new Decimal(x).toFixed(4)`; inputs in via `Number(...)`.
- `IV30_ENGINE_VERSION = 1`, `IV30_METHOD = 'daily_vwap'`, `DEFAULT_RISK_FREE_RATE = '0.0450'`, `DEFAULT_DIVIDEND_YIELD = '0.0000'`, `MIN_TRADES_PER_LEG = 1`.
- Strike walk as a `find` over `strikeCandidates` with a `legQualifies` predicate; per-expiration IV as a small pure helper reused by `iv30FromInputs` (one arithmetic path, two entry points).

**Refactor — cleanup to consider:**

- Ensure `computeIv30` and `iv30FromInputs` share `expirationIv(leg, underlying, T, rate, q)` and `interpolateTotalVariance(near, far)`; no logging (core rule); no `Decimal` inside the loops.

**Acceptance criteria covered:**

- "An untraded strike is skipped for its neighbour", "Thin weeklies fall back to the monthly expirations", "A day with no tradeable ATM pair is left as a gap", "Today's reading is computed the same way as the history" (engine half), "A corrected engine recomputes every derived metric from stored inputs" (engine half).

### 4. IV metrics engine (rank, percentile, range, coverage)

**Files to create or modify:**

- `src/main/core/iv-metrics.ts` — `computeIvMetrics`, `RANK_WINDOW_SESSIONS`, `MIN_WINDOW_COVERAGE`, `IvMetrics`
- `src/main/core/iv-metrics.test.ts`

**Red — tests to write:**

- 252 window sessions all with readings spanning `0.1800..0.4500`, anchor `0.2475` → `{ rank: 25, low: '0.1800', high: '0.4500', coverage: 252 }`.
- 252 readings with exactly 180 strictly below `0.2475` (and some equal) → `percentile: 71` (180/252 = 71.43 → 71); ties are not counted as below.
- Anchor `0.4700` above the window → `rank: 100`, `high: '0.4500'`; anchor below the window → `rank: 0`.
- Every window reading `0.2000`, anchor `0.2000` → `rank: null`, `percentile: 0`, low/high `'0.2000'`.
- Rounding: a rank computing to `71.5` → `72`, `71.49` → `71` (half-up via `Decimal`).
- 252 window sessions with readings on only 150 → `null`; 199 → `null`; 200 → metrics returned with `coverage: 200`.
- Fewer than 252 window sessions supplied (young calendar) with 60 readings → `null`.
- The anchor session's own reading is **not** in the window even if present in `readings` (window of 252 with anchor `0.9` → `high` is the window max, not `0.9`).

**Green — implementation:**

- `computeIvMetrics({ anchorIv30, windowSessions, readings })` per `data-model.md §2`: collect window values via `windowSessions.flatMap`, coverage gate, min/max with `Decimal` comparisons on the strings, rank/percentile with `Decimal` `toDecimalPlaces(0, ROUND_HALF_UP)`, clamp before rounding.

**Refactor — cleanup to consider:**

- One `roundHalfUp(x: Decimal): number` helper; check whether `screener.ts` already has an equivalent to reuse rather than duplicate.

**Acceptance criteria covered:**

- "IV rank is computed from the app's own IV history", "IV percentile is computed alongside IV rank", "The IV range behind the rank is reported with it", "A reading outside the window's range is clamped", "A flat window withholds rank but not percentile", "A reading is withheld while the window is too sparse to trust", "A young history is withheld the same way".

### 5. Reading shape: nullable rank with percentile and range through freshness, gates and floor

**Files to create or modify:**

- `src/main/core/ivr-freshness.ts` — `IvRankReading`, `AssessedIvRank`, `validReading` accepts `value: null`
- `src/main/core/ivr-freshness.test.ts`
- `src/main/core/watchlist-signal.ts` — `ivGate` treats `value === null` as `unknown('IV unavailable')`
- `src/main/core/watchlist-signal.test.ts`
- `src/main/services/screener.ts` — `usableIvRanks` drops `value === null`
- `src/main/services/screener.test.ts`
- `src/preload/index.d.ts` — `IpcIvRank` per `contracts/watchlist-snapshot-ivrank.md`

**Red — tests to write:**

- `assessIvRank({ value: null, percentile: '40', low: '0.2000', high: '0.2000', observedAt })` → `assessed` with `value: null` and the tier by age; `percentile`/`low`/`high` pass through unchanged.
- `assessIvRank` with `value: 'abc'` or `percentile: ''` → `unreadable`; with `value: '25'` behaves exactly as today's tests (existing cases updated to the new shape, not weakened).
- `ivGate(30, { value: null, state: 'fresh', … })` → `{ verdict: 'unknown', label: 'IV unavailable' }`; `ivGate(30, { value: '30' })` → `met`; `ivGate(30, { value: '29' })` → `unmet('IV low')`.
- `usableIvRanks` excludes a fresh reading with `value: null` and includes `{ value: '30' }` as `{ value: '30', observedAt }`.
- `iv_rank_floor` (existing `screener.test.ts` cases) still exclude `'29'` below `30` and include `'30'` at `30` with integer strings.

**Green — implementation:**

- Types per `data-model.md §2`; `validReading` checks `observedAt`, `value` (null or finite), `percentile`/`low`/`high` finite.
- `ivGate` null branch before the usability check.
- `IpcIvRank` doc comment updated (`value` is an integer rank, no longer 1 dp).

**Refactor — cleanup to consider:**

- Confirm `ScreenerIvRank` (area 11) stays a field-for-field mirror; grep for `// 1dp` comments on the old shape and fix them.

**Acceptance criteria covered:**

- "A flat window withholds rank but not percentile" (gate half), Scenario Outline "The computed rank drives the screener floor" (engine half: 29 excluded / 30 included / n/a treated as today).

### 6. Migration 016 — `iv30_reading`, `iv30_gap`, drop `ivr_snapshot`

**Files to create or modify:**

- `migrations/016_create_iv30_history.sql`
- `src/main/db/migrate.test.ts` — extend the "applies all migrations" assertions

**Red — tests to write:**

- After `runMigrations`, `iv30_reading` exists with the exact column list from `data-model.md §1` (`PRAGMA table_info`), primary key `(underlying, session, method)`, `method` default `'daily_vwap'`, and index `idx_iv30_reading_underlying_session_desc`.
- `iv30_gap` exists with `reason` CHECK rejecting `'other'` and accepting both allowed values; PK `(underlying, session, method)`.
- Inserting two rows with the same `(underlying, session, method)` into `iv30_reading` raises a constraint error; `expiration_tier = 'daily'` is rejected.
- `ivr_snapshot` and `idx_ivr_snapshot_underlying_observed_at_desc` no longer exist after the run (`sqlite_master`); a DB seeded with legacy rows before migration 016 migrates without error.

**Green — implementation:**

- The SQL in `data-model.md §1`, with a header comment explaining the inputs-stored / metrics-derived split and the gap table's role (mirroring the style of `015_create_trading_session.sql`), ending with `DROP TABLE ivr_snapshot;` — the rows are Barchart's rank, a different quantity from ours, and nothing reads them.

**Refactor — cleanup to consider:**

- None expected; verify the file sorts after `015` and that `docs/spec/schema/migrations.md` will be updated by `/update-spec`, not by hand here.

**Acceptance criteria covered:**

- Storage for every persistence scenario ("…strike and trade counts used are stored with the reading", "…records that the monthly tier was used", "no reading is stored for that day").

### 7. MarketDataProvider daily bars: port, Alpaca adapter, fake provider

**Files to create or modify:**

- `src/main/integrations/market-data-provider.ts` — `DailyBar`, `DailyBarRange`, `getOptionDailyBars`, `getStockDailyBars`, `IvHistoryBarSource`
- `src/main/integrations/alpaca-market-data-mappers.ts` — `buildOptionBarsUrl`, `buildStockBarsUrl`, `mapDailyBar`, `AlpacaBarsResponse` type, `chunkSymbols`
- `src/main/integrations/alpaca-market-data.ts` — the two methods (chunk 100, paginate, sequential)
- `src/main/integrations/alpaca-market-data.test.ts`, `alpaca-market-data-mappers.test.ts` (if present; else in the provider test)
- `src/main/integrations/fake-market-data.ts` — series fixture parsing, bar synthesis via `blackScholesPrice`, request log + counter, `latencyMs`, `failWith`, `untraded`, trade counts by expiration kind
- `src/main/integrations/fake-market-data.test.ts`
- `src/main/integrations/market-data-provider.test.ts` — type-conformance test extended

**Red — tests to write:**

- `buildOptionBarsUrl(['A','B'], { start: '2025-09-19' })` has `timeframe=1Day`, `limit=10000`, the joined symbols, **no** `end` param; with `end` supplied it appears; `page_token` appended when given.
- `buildStockBarsUrl('AAPL', { start, end })` has `feed=sip`, `adjustment=raw`, `timeframe=1Day`.
- `mapDailyBar({ t: '2026-03-12T05:00:00Z', vw: 200.123456, c: 201, v: 10, n: 7 })` → `{ date: '2026-03-12', vwap: '200.1235', close: '201.0000', volume: 10, tradeCount: 7 }`; a bar with `vw: NaN` → `null`; `t` at `04:00:00Z` (EDT) also maps to the ET day.
- `getOptionDailyBars` with 250 symbols issues 3 requests (100/100/50) with mocked `fetch`, merges bars per symbol across two pages (`next_page_token`), and returns a map missing symbols the vendor omitted; `symbols: []` → no fetch.
- `getStockDailyBars` returns ascending bars; a 403 → `MarketDataError('auth_failed')`; a 429 twice then 200 → success (existing retry).
- Fake: fixture `{ AAPL: { price: 200.4, sessions: { '2026-03-12': 0.2475 } } }` → `getOptionDailyBars(['AAPL260410C00200500', 'AAPL260410P00200500'], { start: '2026-03-12' })` returns one bar per symbol whose `vwap` equals `blackScholesPrice(...)` at σ 0.2475 and `tradeCount: 100`; a session absent from the fixture → no bar; a symbol for an unfixtured ticker → absent.
- Fake `untraded: [{ strike: 200.5, type: 'call' }]` → the call has no bar, the put does; `weeklyTradeCount: 0` → non-third-Friday symbols absent, third-Friday symbols present; `tradeCount: 0` → nothing for that session.
- Fake records each request `{ kind, underlying, start, end: null | string }` and `dailyBarRequestCount()` increments; `failWith: 'network_error'` throws `MarketDataError` for that ticker only; `latencyMs: 50` delays resolution (fake timers).
- Fake `getStockDailyBars` returns one bar per fixture session with `vwap === '200.4000'`.

**Green — implementation:**

- Port and adapter per `contracts/market-data-provider-daily-bars.md`; `end` param appended only when defined; `etDateOf` for `date`.
- Fake per `contracts/test-iv-history.md` "Fake pricing rule"; fixture from `WHEELBASE_FAKE_IV_SERIES` at construction plus `setFakeIvSeries()` module function; `parseOccSymbol` for symbol identity; third-Friday detection shared with… **not** shared — the fake decides "monthly" by day-of-month/weekday locally (no import of selection logic; only the pricer is shared).
- Logging in the Alpaca adapter: DEBUG per batch, INFO `alpaca_daily_bars_mapped`.

**Refactor — cleanup to consider:**

- Pull the `do…while (pageToken)` loop into a `fetchAllPages` helper reused by chain snapshots and open interest if it reads cleanly; otherwise leave — two copies is the current state and three is where extraction earns its name.

**Acceptance criteria covered:**

- Transport for every collection scenario; "Bar requests never name the current calendar day as their end" (adapter passes `end` verbatim — the rule itself is area 9).

### 8. Trading-calendar store lookback

**Files to create or modify:**

- `src/main/services/trading-calendar-store.ts` — `READ_LOOKBACK_DAYS = 400`, `READ_LOOKAHEAD_DAYS = 50`, `REFRESH_LOOKBACK_DAYS = 420`, `needsRefresh` first-day check
- `src/main/services/trading-calendar-store.test.ts`

**Red — tests to write:**

- `readTradingCalendar` on a store seeded 450 days back returns `firstDay = now − 400d` and `lastDay = now + 50d` (clipped to stored coverage as today).
- `needsRefresh` is true when stored `first_day` is later than `now − 400d` even if `last_day` is far ahead (the upgraded-install case); false when both bounds are satisfied within the interval.
- `refreshTradingCalendar` requests `start = now − 420d`, `end = now + 400d`.
- Existing US-98/US-116 tests still pass with the wider bounds (the ten-session stale boundary is unaffected).

**Green — implementation:**

- Constant changes and the extra `needsRefresh` clause; update the header comments that justify the bounds (they currently argue for 45 days).

**Refactor — cleanup to consider:**

- `e2e/trading-day-fixtures.ts` `CALENDAR_LOOKBACK_DAYS` must be raised to ≥ 450 in area 12 so explicit fixtures cover the refresh range.

**Acceptance criteria covered:**

- Enables every rank scenario on a fresh install ("Given 252 completed sessions…"); the story's "Calendar coverage… is in scope".

### 9. IV-history service: store, per-ticker collection, recompute, metrics read

**Files to create or modify:**

- `src/main/services/iv-history.ts` — `listMissingSessions`, `collectIvHistory`, `recomputeIvHistory`, `readIvMetricsByUnderlying`, persistence helpers
- `src/main/services/iv-history.test.ts` (uses `makeTestDb`, `seedTradingCalendar`, `makeSpyLogger`, the area-3 bar fixture builder as a mock `IvHistoryBarSource`)

**Red — tests to write:**

- `listMissingSessions` returns required sessions with neither a reading nor a gap, ascending; a session with a gap row is not missing.
- `collectIvHistory` on an empty table with a 253-session calendar requests stock bars once and option bars in symbol batches whose union covers every planned symbol, persists 253 readings, returns `{ status: 'collected', readings: 253, gaps: 0 }`, and stamps `observed_at` with each session's `close_at` and `engine_version` with `IV30_ENGINE_VERSION`.
- Second call with nothing missing → `{ status: 'up_to_date' }` and **zero** provider calls.
- Most recent stored reading three sessions old → exactly three sessions requested (`start` = oldest missing), three readings persisted.
- `end` rule: `now` after today's close (today is the newest completed session) → provider called with `end: undefined`; `now` on a Saturday → `end` = Friday's date; in neither case does `end` equal `etDateOf(now)` when that is the calendar day.
- A missing session whose bars fail the gate → a row in `iv30_gap` with `reason: 'no_tradeable_pair'`, **unless** it is the newest completed session, which gets no gap row and is still missing next call.
- No stock bar for a session → gap `no_underlying_bar`.
- A later run producing a reading for a session that has a gap row deletes the gap (same transaction).
- Provider throws `MarketDataError('auth_failed')` → the error propagates (the batch classifies it); throws `'network_error'` → `{ status: 'failed' }` and a WARN with `err`, nothing persisted for that ticker.
- `recomputeIvHistory(db, { ticker })` rewrites `iv30` for rows with `engine_version < IV30_ENGINE_VERSION` from stored inputs (seed a row with `iv30 = '0.5200'`, `engine_version = 0`, inputs that reproduce `'0.2600'` → becomes `'0.2600'` and the current version), touches no current-version row, makes no provider call (no provider argument exists), and returns counts; `force: true` rewrites current-version rows too; a row whose inputs no longer invert is counted `unrecomputable` and left unchanged with a WARN.
- `collectIvHistory` calls `recomputeIvHistory` for the ticker before computing missing sessions (spy order).
- `readIvMetricsByUnderlying(db, ['AAPL'], calendar)` with 253 seeded readings (window 0.18–0.45, anchor 0.2475) → `{ value: '25', percentile: <expected>, low: '0.1800', high: '0.4500', observedAt: <anchor close> }`; with 150 window readings → `null`; ticker with no rows → `null`; anchor stale by 3 sessions → `observedAt` is the stale anchor's close and the window is the 252 before _it_.
- `readIvMetricsByUnderlying` is synchronous and takes no provider (type-level assertion in the test).

**Green — implementation:**

- Per `data-model.md §3`. SQL as module constants (`INSERT … ON CONFLICT DO UPDATE` for readings so a forced re-probe is idempotent; `DELETE FROM iv30_gap WHERE …` before insert; `SELECT session, iv30 FROM iv30_reading WHERE underlying = ? AND session >= ? AND session <= ? AND method = ?`).
- Required sessions from `calendar.sessions` filtered by `hasClosedBy(now)` (reuse `getMostRecentCompletedSession` + slice of the last 253).
- Window sessions for read: the 252 `calendar.sessions` dates strictly before the anchor session.
- Logging: INFO `iv_history_collected { ticker, readings, gaps, requests }`, `iv_history_recomputed { ticker, recomputed }`; DEBUG `iv_history_missing_sessions`, `iv_history_bar_request { kind, start, end }`, `iv_history_session_outcome`; WARN on failure with `err`.

**Refactor — cleanup to consider:**

- Keep this file under ~300 lines by moving pure SQL/row mapping into `iv-history-store.ts` if it grows; ensure no `Decimal` arithmetic here (the engines own it) and no direct Alpaca knowledge.

**Acceptance criteria covered:**

- "Reading IV metrics makes no market-data request", "Missed sessions are caught up by the next daily run", "Bar requests never name the current calendar day as their end", "Today's reading is available the same evening", "A corrected engine recomputes every derived metric from stored inputs" (service half), "A day with no tradeable ATM pair is left as a gap" (persistence half).

### 10. Rewire the collector, on-demand path and read path; retire Barchart

**Files to create or modify:**

- `src/main/services/ivr-collector.ts` — `collectIVRSnapshots` loops `collectIvHistory`; auth abort → `skippedReason: 'market_data_unavailable'`; remove `collectTicker`, `persistSnapshot`, `utcDayBounds`, the `fetchIvr` seam, the Barchart import, **and the closed-day guard** (the `trigger` parameter, the `getTradingSession` verdict and the `'market_closed'` branch — a run on a closure finds no missing sessions and is `up_to_date` for free); `marketDataProvider` becomes the full `MarketDataProvider` (calendar + bars)
- `src/main/index.ts` — the `ivr-collect` handler no longer forwards `trigger`; `JobRunContext.trigger` stays on the scheduler (US-46 infrastructure with its own dev channel) and is noted as currently unconsumed
- `src/main/services/ivr-collector.test.ts`
- `src/main/services/ivr-on-demand.ts` — `collect(ticker)` → `ensureTradingCalendar` → `collectIvHistory`; `onCollected` on `'collected'`; drop `getLatestIvrByUnderlying` same-session check
- `src/main/services/ivr-on-demand.test.ts`
- `src/main/services/ivr-snapshots.ts` — `getAssessedIvrByUnderlying` reads `readIvMetricsByUnderlying`; delete `getLatestIvrByUnderlying` and `LATEST_IVR_QUERY` (the table is gone)
- `src/main/services/ivr-snapshots.test.ts`, `src/main/services/screener.test.ts` — both mock/use `getLatestIvrByUnderlying` today; re-point at `readIvMetricsByUnderlying`
- `src/main/test-utils.ts` — delete `seedIvr` / `IvrSeedRow`; add `seedIv30Series(db, ticker, rows)` writing `iv30_reading`
- `src/main/core/trading-calendar.ts` — remove `observationWindowOf` (orphaned by `persistSnapshot`'s removal) and its tests
- `src/main/schemas.ts` — `CollectIvrNowBatchSchema.skippedReason` enum widened; `schemas.test.ts`
- `src/main/integrations/fake-clock.ts` (new) — `WHEELBASE_FAKE_NOW`, `setFakeNow`, `createFakeClock()`; `fake-clock.test.ts`
- **Delete:** `src/main/integrations/barchart-ivr-scraper.ts` (+test), `src/main/integrations/fake-ivr.ts` (+test)
- `src/main/ipc/test-ivr.ts` → `src/main/ipc/test-iv-history.ts` — channels per `contracts/test-iv-history.md`; `test-iv-history.test.ts`
- `src/main/ipc/ivr.test.ts` — schema acceptance of the new reason
- `src/preload/index.ts`, `src/preload/index.d.ts` — new `_test:*` bridges; remove `testIvrSetOutcomes`/`testIvrFetchLog`/`testIvrSnapshots`; `IpcCollectIvrNowBatch.skippedReason`
- `src/main/index.ts` — `createFakeClock()` replaces `createFakeIvrCollaborators()`; job handler passes `marketDataProvider: marketDataFactory.create()` (already does) and no `fetchIvr`; `registerTestIvHistoryIpc(db)`
- `src/main/index.test.ts` — wiring assertions updated

**Red — tests to write:**

- `collectIVRSnapshots` with three targets where the provider rejects the second ticker with `network_error` → `{ successCount: 2, errorCount: 1, skippedCount: 0, skippedReason: null }`, a WARN with `err` for that ticker, readings persisted for the other two.
- First ticker throws `auth_failed` → `{ 0, 0, 0, skippedReason: 'market_data_unavailable' }`, one INFO `ivr_collection_skipped_no_market_data`, no further tickers attempted.
- Ticker already complete → counted in `skippedCount` (`up_to_date`).
- A run at a Saturday clock (or a recognised holiday) with every ticker complete through Friday → every ticker `up_to_date`, `skippedReason: null`, and **zero** bar requests on the provider mock — the property the old `market_closed` guard protected, now a consequence of `listMissingSessions`. The US-100 weekend/holiday guard tests are deleted, not weakened.
- `collectIVRSnapshots` accepts no `trigger` argument (type-level).
- Abort signal set between tickers stops the loop (existing test retained).
- `ivrOnDemand.collect('MSFT')` awaits `ensureTradingCalendar`, calls `collectIvHistory` for exactly `MSFT`, fires `onCollected('MSFT')` on `collected`, not on `up_to_date` or `failed`; a rejecting provider is logged and **never rejects the returned promise**; the returned promise resolves before a slow provider resolves (fake timers) — proving the add would not wait.
- `getAssessedIvrByUnderlying` with no `iv30_reading` rows → `null` for that ticker; with a complete series → assessed reading carrying `percentile/low/high`; `assessIvRank` `unreadable` still logs `ivr_assessment_unreadable_snapshot`.
- `CollectIvrNowBatchSchema.parse({ …, skippedReason: 'market_data_unavailable' })` succeeds; `'barchart_down'` fails.
- `createFakeClock()` returns `undefined` when `WHEELBASE_FAKE_NOW` is unset and a clock reading the env/`setFakeNow` value otherwise (moved tests from `fake-ivr.test.ts`).
- `test-iv-history` handlers: `_test:iv-series-set` replaces the fixture and resets the request log; `_test:iv30-corrupt` sets `iv30` and `engine_version = 0`; `_test:table-exists` answers from `sqlite_master`; `_test:iv30-history` returns rows ordered `(underlying, session)`.
- `src/main/index.test.ts`: `ivr-collect` still registered with `{ kind: 'afterClose', offsetMinutes: 60 }`; no import of `barchart-ivr-scraper` anywhere under `src/` (a grep-style assertion or simply the build).

**Green — implementation:**

- Per `contracts/ivr-collect-now.md` and `research.md` ADRs "auth failure aborts…", "Barchart is retired…", "The e2e seam…".
- `IvrOnDemand.collect` body: `try { await ensureTradingCalendar; const calendar = readTradingCalendar; const outcome = await collectIvHistory({ … provider: getProvider() … }); if (outcome.status === 'collected') { logger.info(...); onCollected?.(ticker) } } catch (err) { logger.error({ ticker, err }, 'ivr_on_demand_failed') }` — `getProvider()` inside the try so an unconfigured provider is a logged skip.
- Update the ADR-referencing comments in `ivr-collector.ts` (`persistSnapshot` outside the try → now `persistIvHistory` inside `collectIvHistory`, which rethrows DB errors — keep them systemic: do not catch `SqliteError` in the per-ticker catch; assert this in a test).

**Refactor — cleanup to consider:**

- `ivr-collector.ts` should shrink to targets + loop + classification; if `collectIVRSnapshots` and `IvrOnDemand.collect` both build the same `CollectIvHistoryInput`, extract `ivHistoryDeps(...)`. Remove the now-unused `IVRResult` type imports everywhere (`grep -rn IVRResult src e2e`).

**Acceptance criteria covered:**

- "One ticker's backfill failure leaves the others intact", "Adding a ticker does not wait on its backfill", "No market-data credentials leaves IV rank unavailable, not broken", "Today's reading is computed the same way as the history" (wiring half).

### 11. Renderer: range and percentile in the IvrCell tooltip, null rank, settings message

**Files to create or modify:**

- `src/renderer/src/api/screener.ts` — `ScreenerIvRank` mirror
- `src/renderer/src/lib/ivr-tooltip.ts` — `ivrTooltipCopy` appends the range/percentile line; `formatIvRange(low, high)`
- `src/renderer/src/lib/ivr-tooltip.test.ts`
- `src/renderer/src/components/IvrCell.tsx` — `value === null` → `n/a` numeral with `data-ivr-state={state}` and the tooltip retained; aria-label includes percentile and range
- `src/renderer/src/components/IvrCell.test.tsx`
- `src/renderer/src/components/ReadingNote.tsx` — `formatIvrValue` guarded for `null` (note text says "IV rank unavailable for a flat 52-week range" in the `null` case)
- `src/renderer/src/components/ReadingNote.test.tsx` (if present; else `BenchDetail.test.tsx`)
- `src/renderer/src/lib/screener-format.ts` — `formatIvrValue(value: string | null)` → `'n/a'` for null
- `src/renderer/src/api/ivr.ts` — `skippedReason` union
- `src/renderer/src/pages/SettingsPage.tsx` — messages per `contracts/ivr-collect-now.md`
- `src/renderer/src/pages/SettingsPage.test.tsx`
- `src/renderer/src/components/bench-test-utils.ts` — fixture readings carry the new fields

**Red — tests to write:**

- `ivrTooltipCopy({ state: 'fresh', value: '25', percentile: '71', low: '0.1800', high: '0.4500', … }).body` ends with `52-wk IV 0.1800–0.4500 · IV percentile 71`; the same suffix appears for `aging`, `stale`, `expired`, `predates_earnings`.
- `IvrCell` with `value: null` renders text `n/a`, `data-testid="ivr-cell"`, `data-ivr-state="fresh"`, and hovering shows the tooltip with the range and percentile (unlike `ivRank={null}`, which renders the plain `n/a` span with `data-ivr-state="empty"` and no tooltip — assert both).
- `IvrCell` with `value: '25'` renders `25` (no decimal), aria-label contains `IV percentile 71` and `52-week IV 0.1800 to 0.4500`.
- `ReadingNote` with `value: null` on a fresh reading renders an info note naming the flat range; with `value: '25'` renders nothing for fresh (unchanged).
- `SettingsPage` shows the credentials message on `skippedReason: 'market_data_unavailable'` and the updated completion text on `null`.

**Green — implementation:**

- Tailwind/`wb-*` tokens only (no inline styles); reuse `TIER_TEXT`; keep `IvrCell` under the existing structure — one extra `<span>` line in `TooltipContent` for the range/percentile in `font-wb-mono text-[0.62rem] text-wb-text-muted`.
- `formatIvRange` uses the en dash (`–`) the criteria strip already uses.

**Refactor — cleanup to consider:**

- `isUsableIvrState` remains the renderer's single copy of the rule; do not add a second null check path — route `null` through `formatIvrValue`.

**Acceptance criteria covered:**

- "The IV range behind the rank is reported with it" (…appear in the IvrCell tooltip beside the freshness copy), "A flat window withholds rank but not percentile" (display half), "No market-data credentials leaves IV rank unavailable, not broken" (existing unavailable copy).

### 12. E2E harness migration to the series seam

**Files to create or modify:**

- `e2e/ivr-helpers.ts` — remove `IvrOutcome`/`okOutcome`/`notAvailableOutcome`/`networkErrorOutcome`/`parseErrorOutcome`/`setIvrOutcomes`/`readIvrFetchLog`; add `FakeIvSeriesFixture` types, `seriesForRank(rank, { endingSessionsAgo = 0, tradingSessions })`, `seriesWithRange({ low, high, today, sessions })`, `seriesWithPercentile({ belowCount, today, low, high })`, `flatSeries(iv)`, `sparseSeries(readingCount)`, `setIvSeries(page, fixture)`, `readIv30History(page)`, `readIv30Gaps(page)`, `readDailyBarRequests(page)`, `recomputeIvHistory(page, opts?)`, `corruptIv30(page, …)`, `tableExists(page, name)`; `buildIvrLaunchEnv` sets `WHEELBASE_FAKE_IV_SERIES` from `opts.ivSeries` and no longer sets `WHEELBASE_FAKE_IVR`; `seedBenchAndSettle` polls `readIv30History`
- `e2e/trading-day-fixtures.ts` — `CALENDAR_LOOKBACK_DAYS = 450`; `sessionsBetween(from, count)` helper for building 253-session series
- `e2e/screener-helpers.ts` — `IvrFixture` → `number | { rank: number; endingSessionsAgo: number }`; `seedIvr` builds series into the launch env (collection now fires on `watchlist.add`) and waits for rows; `assertIvrTickersCollectible` retained
- `e2e/ivr-collector.spec.ts` — retitle to the surviving US-44 ACs: scheduling, targets, persistence (asserts `iv30_reading` rows), same-day rerun idempotent (`up_to_date`), one-failure-continues. "Market is closed on a non-trading day" becomes "A scheduled weekend run makes no bar requests" (clock at `WEEKEND_NOW`, series complete through Friday, `collectIvScheduled` → `skippedCount === targets`, `readDailyBarRequests()` unchanged). Delete `not_available` and `parse_error` cases (Barchart-only).
- `e2e/ivr-on-demand.spec.ts` (US-100 guard half) — delete "The scheduled run still skips a weekend"; keep "Manual refresh works on a weekend / on a weekday market holiday" and "The scheduled run still fires after hours on a weekday", asserting on `iv30_reading` rows
- `e2e/ivr-on-demand.spec.ts` — same ACs on the new seam; "A ticker Barchart does not cover" becomes "A ticker with no bar data is added without an IV rank" (series absent → gaps, `n/a`, add ok)
- `e2e/ivr-watchlist-collection.spec.ts` — union/dedupe/removal ACs on the new seam; "no IVR coverage is skipped" becomes "no bar data → `n/a`, others unaffected"; reason text `IV rank 22 (…) below 30`
- `e2e/ivr-staleness.spec.ts` — `ivr: { KO: { rank: 38, endingSessionsAgo: k } }`; morning/holiday cases keep the clock movement; assertions on integer values
- `e2e/screener-results.spec.ts`, `e2e/screening-criteria.spec.ts`, `e2e/screener-earnings.spec.ts`, `e2e/watchlist-bench.spec.ts`, `e2e/watchlist-edit.spec.ts`, `e2e/watchlist.spec.ts`, `e2e/market-facts-without-broker.spec.ts` — `ivr:` fixtures to rank numbers; `'38.0'`-style expectations to `'38'`; `IV rank 22.0 below 30` → `IV rank 22 (…) below 30`

**Red — tests to write:**

- Every existing e2e in the files above passes on the new seam with its AC name unchanged (or renamed as listed). Run `pnpm test:e2e` as the red/green signal for this area.

**Green — implementation:**

- Helper implementations per `contracts/test-iv-history.md`; `seriesForRank(r)` → 252 window values evenly spaced in `[0.2000, 0.6000]` plus today `= 0.2 + 0.004·r`, sessions = the 253 weekday sessions ending `endingSessionsAgo` before `FAKE_NOW_DAY`.

**Refactor — cleanup to consider:**

- Delete every `IVRResult`-shaped type in `e2e/`; ensure no spec still references `WHEELBASE_FAKE_IVR`.

**Acceptance criteria covered:**

- Regression protection for US-44/US-97/US-98/US-100 ACs under the new source; harness for area 13.

### 13. E2e Tests

**Files to create or modify:**

- `e2e/iv-history.spec.ts` — one `it()` per acceptance scenario, named verbatim; Background: AAPL on the bench, no Barchart

**Red — tests to write:**

- `IV rank is computed from the app's own IV history` — launch with `AAPL: seriesWithRange({ low: 0.18, high: 0.45, today: 0.2475 })` (252 window sessions); bench `ivrCell(page, 'AAPL')` reads `25`.
- `IV percentile is computed alongside IV rank` — `seriesWithPercentile({ belowCount: 180, today: 0.2475 })`; tooltip contains `IV percentile 71`.
- `The IV range behind the rank is reported with it` — same as the first; hover the ring; tooltip contains `52-wk IV 0.1800–0.4500` **and** `IV percentile` beside the freshness title (assert the tooltip's tier title is also present).
- `A reading outside the window's range is clamped` — `today: 0.47` → cell `100`, tooltip high `0.4500`.
- `A flat window withholds rank but not percentile` — `flatSeries(0.2)` → cell `n/a` with `data-ivr-state="fresh"` and tooltip `IV percentile 0`.
- `A corrected engine recomputes every derived metric from stored inputs` — backfill AAPL at 0.26 on a window session `S`; `corruptIv30(page, { ticker: 'AAPL', session: S, iv30: '0.5200' })`; note the request count; `recomputeIvHistory(page)`; `readIv30History` shows `S` at `0.2600` and current version; reload bench → rank/percentile/low/high equal the uncorrupted run's; `readDailyBarRequests` count unchanged.
- `Reading IV metrics makes no market-data request` — after backfill, record `readDailyBarRequests().length`, `reloadBench` twice, count unchanged.
- `A reading is withheld while the window is too sparse to trust` — NVDA `sparseSeries(150)` → `n/a`, `data-ivr-state="empty"` (no tooltip range).
- `A young history is withheld the same way` — NVDA series of 60 sessions → `n/a`; `readIv30History` has 60 NVDA rows (proves it is withheld, not missing).
- `Adding a ticker does not wait on its backfill` — MSFT series with `latencyMs: 3000`; time `watchlist.add` (< 1 s); card shows `n/a`; then within 10 s the cell resolves to an integer (push event).
- `One ticker's backfill failure leaves the others intact` — AAPL/MSFT/SPY series, NVDA `failWith: 'network_error'`; `collectIvNow` → `errorCount: 1`, `successCount ≥ 3`; `readIv30History` has rows for the three and none for NVDA.
- `Missed sessions are caught up by the next daily run` — launch with the clock at `afterCloseOn(sessionsBefore(BASE_DAY, 3))` and a series through that day; then `setIvrNow(afterCloseOn(BASE_DAY))`, `setIvSeries` extended through `BASE_DAY`, `collectIvScheduled` → exactly three new AAPL rows; assert the same request `kind`s were used as the initial backfill (one code path).
- `An untraded strike is skipped for its neighbour` — session `S` spec `{ iv: 0.26, untraded: [{ strike: 200.5, type: 'call' }] }` with price 200.4 → the `S` row has `near_strike = '200.0000'`, `near_call_trades = 100`, `near_put_trades = 100`.
- `Thin weeklies fall back to the monthly expirations` — CHWY series with `weeklyTradeCount: 0` → every row `expiration_tier = 'monthly'` and `near_expiration` is a third Friday.
- `A day with no tradeable ATM pair is left as a gap` — session `S` (not the newest) `{ iv: 0.26, tradeCount: 0 }` → no `iv30_reading` row for `S`, one `iv30_gap` row `no_tradeable_pair`; with 200 readings otherwise the metrics still publish, with 199 they read `n/a` (the gap counts).
- `Today's reading is computed the same way as the history` — series includes `BASE_DAY`; after the run the `BASE_DAY` row has the same `method`/`engine_version`/`rate` as the oldest row and `iv30` equals the programmed value; `readDailyBarRequests` shows only `option`/`stock` daily-bar kinds (no snapshot call was needed — assert the fake's snapshot counter, if exposed, else assert row provenance only).
- `Bar requests never name the current calendar day as their end` — after a full backfill with the clock after today's close, every entry in `readDailyBarRequests` has `end === null || end < FAKE_NOW_DAY`; then a Saturday-clock run has every `end` equal to Friday.
- `Today's reading is available the same evening` — clock `afterCloseOn(BASE_DAY)`; run; the `BASE_DAY` row exists with `observed_at === sessionCloseOn(BASE_DAY)` and the requests that produced it have `end === null`.
- `Barchart readings are removed on upgrade` — before launch, the spec opens the temp DB with `better-sqlite3`, runs migrations 001–015 only, and inserts one legacy `ivr_snapshot` row for AAPL; after boot `tableExists(page, 'ivr_snapshot')` is `false`, `tableExists(page, 'iv30_reading')` is `true`, and the AAPL cell reads `n/a` with `data-ivr-state="empty"` — nothing survived to feed it.
- `No market-data credentials leaves IV rank unavailable, not broken` — launch `withoutBrokerCredentials: true` (no env keys, no preseed) and `FAKE_MARKET_DATA_ERROR=auth_failed`; add MSFT → add ok; card `n/a` with title `No IV rank collected`; `collectIvNow` → `skippedReason: 'market_data_unavailable'`.
- `The computed rank drives the screener floor — 29 is excluded` — NVDA `seriesForRank(29)`, floor 30 → excluded list reason `IV rank 29 (…) below 30`.
- `The computed rank drives the screener floor — 30 is included` — `seriesForRank(30)` → ranked.
- `The computed rank drives the screener floor — n/a is treated as it is today when IVR is unavailable` — NVDA `sparseSeries(150)` → ranked with `n/a` (floor not applied), matching US-98 AC12 behaviour.
- `Expirations too near expiry are excluded from IV30 — 3 DTE excluded` — AAPL `weeklyTradeCount: 0`, one session `S` three days before a third Friday → `near_expiration` is the _next_ third Friday (≈31 DTE), `far_expiration` null.
- `… — 6 DTE excluded` — `S` six days before the third Friday → same shape.
- `… — 7 DTE used` — `S` seven days before → `near_expiration` = that third Friday, `far_expiration` = the following one.
- `… — 9 DTE used`, `… — 14 DTE used` — likewise, `near_expiration` = the 9- / 14-DTE third Friday.

**Green — implementation:**

- The spec file and any helper the Red bullets name that area 12 did not already add. Each test launches its own app (`tmpDb`, `afterEach` close + `cleanupDb`) in the style of `ivr-staleness.spec.ts`.

**Refactor — cleanup to consider:**

- Share the 252/253-session series builders between `iv-history.spec.ts` and `screener-helpers.ts`; keep each test under ~40 lines by leaning on helpers.

**Acceptance criteria covered:**

- Every scenario and every outline row in the story (see the audit below).

## AC Audit

| #     | Acceptance scenario (Linear)                                          | E2e test (area 13)                                          | Engine/service tests |
| ----- | --------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------- |
| 1     | IV rank is computed from the app's own IV history                     | same name                                                   | area 4, 9            |
| 2     | IV percentile is computed alongside IV rank                           | same name                                                   | area 4               |
| 3     | The IV range behind the rank is reported with it                      | same name                                                   | area 4, 11           |
| 4     | A reading outside the window's range is clamped                       | same name                                                   | area 4               |
| 5     | A flat window withholds rank but not percentile                       | same name                                                   | area 4, 5, 11        |
| 6     | A corrected engine recomputes every derived metric from stored inputs | same name                                                   | area 3, 9            |
| 7     | Reading IV metrics makes no market-data request                       | same name                                                   | area 9               |
| 8     | A reading is withheld while the window is too sparse to trust         | same name                                                   | area 4               |
| 9     | A young history is withheld the same way                              | same name                                                   | area 4               |
| 10    | Adding a ticker does not wait on its backfill                         | same name                                                   | area 10              |
| 11    | One ticker's backfill failure leaves the others intact                | same name                                                   | area 10              |
| 12    | Missed sessions are caught up by the next daily run                   | same name                                                   | area 9               |
| 13    | An untraded strike is skipped for its neighbour                       | same name                                                   | area 3               |
| 14    | Thin weeklies fall back to the monthly expirations                    | same name                                                   | area 2, 3            |
| 15    | A day with no tradeable ATM pair is left as a gap                     | same name                                                   | area 3, 9            |
| 16    | Today's reading is computed the same way as the history               | same name                                                   | area 3, 9, 10        |
| 17    | Bar requests never name the current calendar day as their end         | same name                                                   | area 7, 9            |
| 18    | Today's reading is available the same evening                         | same name                                                   | area 9               |
| 19    | Barchart readings are removed on upgrade                              | same name                                                   | area 6               |
| 20    | No market-data credentials leaves IV rank unavailable, not broken     | same name                                                   | area 10              |
| 21a   | The computed rank drives the screener floor — 29 excluded             | `… — 29 is excluded`                                        | area 5               |
| 21b   | … — 30 included                                                       | `… — 30 is included`                                        | area 5               |
| 21c   | … — n/a treated as today                                              | `… — n/a is treated as it is today when IVR is unavailable` | area 5               |
| 22a–e | Expirations too near expiry are excluded from IV30 (3, 6, 7, 9, 14)   | one test per row                                            | area 2               |

Every scenario has a named e2e test; no AC is uncovered.

## Out of scope (restated from the story, so `/plan-tasks` does not invent them)

Reviving the scraper or solving the WAF challenge; honest failure reporting for the dead
Barchart path; a paid vendor; minute/hour-bar methods; a rate series or dividend model; IV − HV,
IV change, term structure; screening or alerting on percentile/range; intraday IV; backfilling
beyond the rank window; charted IV history; reworking the bench card layout; renaming the `ivr:*`
channels or the `ivr-collect` job.
