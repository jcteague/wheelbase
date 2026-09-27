# US-121 — Compute IV rank from our own IV history instead of scraping Barchart — Tasks

Plan: `plans/us-121/plan.md` · Story: Linear [OPT-27 / US-121](https://linear.app/optionswheel/issue/OPT-27/us-121-compute-iv-rank-from-our-own-iv-history-instead-of-scraping)
Supporting: `research.md`, `data-model.md`, `contracts/*.md`, `quickstart.md`

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Area numbers match the plan's "Implementation Areas" sections — read that section before starting an area
- `src/main/core/` stays pure: no logging, no DB/broker imports
- ABI: run `pnpm rebuild:node` before `pnpm test`, `pnpm rebuild:electron` before `pnpm test:e2e`

### Dependency graph

```
L1  [1] Black–Scholes   [2] Selection   [4] Metrics   [5] Reading shape   [6] Migration   [8] Calendar lookback
L2  [3] IV30 engine ← 1,2      [7] Daily bars + fake ← 1      [12] Renderer ← 5
L3  [9] IV-history service ← 3,4,6,7,8
L4  [10] Run state ← 9 (IvHistoryTickerOutcome type)
L5  [11] Rewire collector / on-demand / read path; retire Barchart ← 5,7,9,10
L6  [13] E2E harness migration ← 8,11,12
L7  [14] E2E acceptance tests ← 13
```

---

## Layer 1 — Pure engines, schema and calendar (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Black–Scholes pricer and inversion

- [x] **[Red]** Write failing tests — `src/main/core/black-scholes.test.ts`
  - `normalCdf(0) === 0.5`; `normalCdf(±1.96)` ≈ `0.975` / `0.025` within `1e-6`; large magnitudes saturate to 0/1
  - Put–call parity `C − P = S·e^{−qT} − K·e^{−rT}` within `1e-9` at `S=200, K=200, T=30/365, r=0.045, q=0, σ=0.25`
  - Call price monotone increasing in σ; σ → 0 tends to discounted intrinsic
  - `impliedVolatility` round-trips σ=0.2475 within `1e-8` for call and put, ATM and 2% OTM, at 7 and 45 DTE
  - Returns `null` (never throws) when price ≤ discounted intrinsic, price ≤ 0, or `yearsToExpiry ≤ 0`
  - Bisection converges for σ = 0.02 and σ = 4.0
  - Run `pnpm test src/main/core/black-scholes.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/black-scholes.ts` _(depends on: Area 1 Red ✓)_
  - `normalCdf` — Abramowitz–Stegun 26.2.17, symmetric for negative `x` (the spike's `ncdf`)
  - `blackScholesPrice({ type, spot, strike, yearsToExpiry, rate, dividendYield, volatility })` with continuous dividend yield
  - `impliedVolatility(...)` — guard `price > intrinsic`, bisection on `[0.001, 10]` for 100 iterations, `null` when unbracketed
  - Plain `Number` math; no `Decimal`, no imports outside `core/` (see `data-model.md §2 black-scholes.ts`)
  - Run `pnpm test src/main/core/black-scholes.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/black-scholes.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Check naming matches `costbasis.ts` style (exported plain functions, `type` not `interface`)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — Expiration and strike selection

- [x] **[Red]** Write failing tests — `src/main/core/iv30-selection.test.ts`
  - `selectExpirationPair` outline rows: `[+3,+31]` → `{ near: +31, far: null }`; `[+6,+34]` → `{ near: +34, far: null }`; `[+7,+35]` → `{ near: +7, far: +35 }`; `[+9,+37]`; `[+14,+45]`
  - Exactly 30 DTE → `{ near: +30, far: null }`; `[+24,+31]` → bracket; all > 30 → nearest alone; all < 7 → `null`
  - `weeklyCandidates`: every Friday in `[+7, +45]`; a holiday Friday shifts to the prior session; < 7 DTE after shift not returned
  - `monthlyCandidates` from `2026-03-12`: `2026-03-20` (8 DTE), `2026-04-17`, `2026-05-15` in `[+7, +70]`; Good-Friday closure shifts to Thursday
  - `strikeCandidates(200.4)` → `[200.5, 200, 201, 202.5, 205]`; `strikeCandidates(200)` → `[200]`; `strikeCandidates(37.3)` → `[37.5, 37, 38, 35, 40]`
  - `daysToExpiry('2026-03-12', '2026-04-11') === 30`; DST boundary `2026-03-06` → `2026-04-05` is `30`
  - `planSessionProbe` builds deduplicated C and P OCC symbols for every strike × expiration in both tiers via `buildOccSymbol`; a tier with no pair is `null`
  - Run `pnpm test src/main/core/iv30-selection.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/iv30-selection.ts` _(depends on: Area 2 Red ✓)_
  - Constants `TARGET_DTE = 30`, `MIN_DTE = 7`, `STRIKE_INCREMENTS = [0.5, 1, 2.5, 5]` (`data-model.md §2`)
  - `daysToExpiry` via `differenceInCalendarDays(parseISO(expiration), parseISO(session))` — no string slicing, no `Date` subtraction
  - Friday / third-Friday enumeration with `date-fns`, shifted against a `Set` of session dates, DTE filter after shifting
  - `selectExpirationPair`: largest ≤ 30, smallest > 30, one-sided → nearest alone (`research.md` ADR "Contract selection is generic…")
  - Export `ExpirationPair` / `ExpirationTier` types for Area 3
  - Run `pnpm test src/main/core/iv30-selection.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/iv30-selection.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - One `shiftToSession` helper shared by weekly and monthly enumeration; no duplicated Friday arithmetic
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — IV metrics engine (rank, percentile, range, coverage)

- [x] **[Red]** Write failing tests — `src/main/core/iv-metrics.test.ts`
  - 252 window readings over `0.1800..0.4500`, anchor `0.2475` → `{ rank: 25, low: '0.1800', high: '0.4500', coverage: 252 }`
  - Exactly 180 of 252 strictly below the anchor (some equal) → `percentile: 71`; ties are not "below"
  - Anchor `0.4700` above the window → `rank: 100`, `high: '0.4500'`; anchor below → `rank: 0`
  - Flat window `0.2000`, anchor `0.2000` → `rank: null`, `percentile: 0`, low/high `'0.2000'`
  - Rounding half-up: `71.5` → `72`, `71.49` → `71`
  - Coverage: 150 → `null`; 199 → `null`; 200 → metrics with `coverage: 200`; young calendar (< 252 window sessions) with 60 readings → `null`
  - The anchor session's own reading is excluded from the window (anchor `0.9` in `readings` does not become `high`)
  - Run `pnpm test src/main/core/iv-metrics.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/iv-metrics.ts` _(depends on: Area 4 Red ✓)_
  - `computeIvMetrics({ anchorIv30, windowSessions, readings })`, `RANK_WINDOW_SESSIONS = 252`, `MIN_WINDOW_COVERAGE = 200`, `IvMetrics` type (`data-model.md §2 iv-metrics.ts`)
  - Window values via `windowSessions.flatMap`; coverage gate; min/max via `Decimal` comparisons; clamp before rounding; `toDecimalPlaces(0, ROUND_HALF_UP)`
  - Run `pnpm test src/main/core/iv-metrics.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/iv-metrics.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - One `roundHalfUp(x: Decimal): number` helper; reuse an equivalent from `screener.ts` if one exists
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — Reading shape: nullable rank with percentile and range

- [x] **[Red]** Write failing tests — `src/main/core/ivr-freshness.test.ts`, `src/main/core/watchlist-signal.test.ts`, `src/main/services/screener.test.ts`
  - `assessIvRank({ value: null, percentile: '40', low: '0.2000', high: '0.2000', observedAt })` → `assessed`, `value: null`, tier by age, percentile/low/high passed through
  - `value: 'abc'` or `percentile: ''` → `unreadable`; `value: '25'` behaves as today (update existing cases to the new shape, don't weaken them)
  - `ivGate(30, { value: null, state: 'fresh', … })` → `unknown('IV unavailable')`; `'30'` → `met`; `'29'` → `unmet('IV low')`
  - `usableIvRanks` drops a fresh `value: null` reading and keeps `{ value: '30', observedAt }`
  - Existing `iv_rank_floor` cases still exclude `'29'` and include `'30'` at floor 30 with integer strings
  - Run `pnpm test src/main/core/ivr-freshness.test.ts src/main/core/watchlist-signal.test.ts src/main/services/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/ivr-freshness.ts`, `src/main/core/watchlist-signal.ts`, `src/main/services/screener.ts`, `src/preload/index.d.ts` _(depends on: Area 5 Red ✓)_
  - `IvRankReading` / `AssessedIvRank` per `data-model.md §2 ivr-freshness.ts`; `validReading` accepts `value` null or finite, requires finite percentile/low/high
  - `ivGate` null branch before the usability check
  - `usableIvRanks` drops `value === null`
  - `IpcIvRank` per `contracts/watchlist-snapshot-ivrank.md`; doc comment says `value` is an integer rank, not 1 dp
  - Run the three test files — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Grep for `// 1dp`-style comments on the old shape and fix them
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 6 — Migration 016: `iv30_reading`, `iv30_gap`, drop `ivr_snapshot`

- [x] **[Red]** Write failing tests — `src/main/db/migrate.test.ts`
  - `iv30_reading` has the exact column list from `data-model.md §1` (`PRAGMA table_info`), PK `(underlying, session, method)`, `method` default `'daily_vwap'`, index `idx_iv30_reading_underlying_session_desc`
  - `iv30_gap` PK `(underlying, session, method)`; `reason` CHECK accepts both allowed values and rejects `'other'`
  - Duplicate `(underlying, session, method)` insert into `iv30_reading` raises; `expiration_tier = 'daily'` rejected
  - `ivr_snapshot` and `idx_ivr_snapshot_underlying_observed_at_desc` absent from `sqlite_master`; a DB with legacy `ivr_snapshot` rows migrates cleanly
  - Run `pnpm test src/main/db/migrate.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `migrations/016_create_iv30_history.sql` _(depends on: Area 6 Red ✓)_
  - SQL from `data-model.md §1`, header comment on the inputs-stored / metrics-derived split and the gap table's role (style of `015_create_trading_session.sql`), ending with `DROP TABLE ivr_snapshot;`
  - Run `pnpm test src/main/db/migrate.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `migrations/016_create_iv30_history.sql` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify the file sorts after `015`; leave `docs/spec/schema/migrations.md` to `/update-spec`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 8 — Trading-calendar store lookback

- [x] **[Red]** Write failing tests — `src/main/services/trading-calendar-store.test.ts`
  - `readTradingCalendar` on a store seeded 450 days back → `firstDay = now − 400d`, `lastDay = now + 50d` (clipped to stored coverage)
  - `needsRefresh` true when stored `first_day` is later than `now − 400d` even with `last_day` far ahead; false when both bounds are satisfied
  - `refreshTradingCalendar` requests `start = now − 420d`, `end = now + 400d`
  - Existing US-98/US-116 tests still pass (ten-session stale boundary unaffected)
  - Run `pnpm test src/main/services/trading-calendar-store.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/trading-calendar-store.ts` _(depends on: Area 8 Red ✓)_
  - `READ_LOOKBACK_DAYS = 400`, `READ_LOOKAHEAD_DAYS = 50`, `REFRESH_LOOKBACK_DAYS = 420`, extra first-day clause in `needsRefresh`
  - Rewrite the header comments that argue for 45 days
  - Run `pnpm test src/main/services/trading-calendar-store.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/trading-calendar-store.ts` _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Note for Area 13: `e2e/trading-day-fixtures.ts` `CALENDAR_LOOKBACK_DAYS` must rise to ≥ 450
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — IV30 engine, daily-bar transport, renderer (depends on Layer 1)

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### Area 3 — IV30 reading engine

**Requires:** Area 1 Green ✓, Area 2 Green ✓

- [x] **[Red]** Write failing tests — `src/main/core/iv30.test.ts` (+ fixture builder `src/main/core/test-fixtures/iv30-bars.ts`) _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Fixture builder prices legs at a target IV with `blackScholesPrice`; shared later by Areas 7 and 9 tests
  - Flat σ=0.2475, price 200.4, weekly pair, both legs traded → `iv30 === '0.2475'`, `tier === 'weekly'`, `near.strike === '200.5000'`, trade counts copied, `rate === '0.0450'`, `dividendYield === '0.0000'`
  - Near σ=0.20 / far σ=0.30 at 24/31 DTE → exact 4-dp total-variance interpolation string
  - Exactly-30-DTE plan → `iv30 === nearIV`, `far === null`
  - Nearest strike's call has no bar (or put `tradeCount: 0`) → next strike used; untraded strike appears nowhere on the reading
  - Nearest call VWAP at/below intrinsic → next strike used; no strike inverts → tier fails
  - Every weekly strike fails, monthly passes → `tier === 'monthly'` with monthly expirations
  - Neither tier passes → `{ status: 'gap', reason: 'no_tradeable_pair' }`; `underlyingBar` undefined → `{ status: 'gap', reason: 'no_underlying_bar' }`
  - `iv30FromInputs(reading)` reproduces `reading.iv30` exactly; stored call VWAP below intrinsic → `null`
  - `DailyBar` fixture type has exactly `date, vwap, close, volume, tradeCount` (no vendor IV field)
  - Run `pnpm test src/main/core/iv30.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/iv30.ts` _(depends on: Area 3 Red ✓)_
  - `computeIv30`, `iv30FromInputs`; types `DailyBar`, `LegSelection`, `Iv30Inputs`, `Iv30Reading`, `Iv30Outcome` per `data-model.md §2 iv30.ts` rules 1–5
  - Constants `IV30_ENGINE_VERSION = 1`, `IV30_METHOD = 'daily_vwap'`, `DEFAULT_RISK_FREE_RATE = '0.0450'`, `DEFAULT_DIVIDEND_YIELD = '0.0000'`, `MIN_TRADES_PER_LEG = 1`
  - Strike walk as `find` over `strikeCandidates` with a `legQualifies` predicate; `Number` inside, `new Decimal(x).toFixed(4)` at the output boundary
  - Run `pnpm test src/main/core/iv30.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/iv30.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `computeIv30` and `iv30FromInputs` share `expirationIv(...)` and `interpolateTotalVariance(near, far)` — one arithmetic path
  - No logging, no `Decimal` inside loops; `ExpirationPair`/`ExpirationTier` imported from `iv30-selection.ts`, not redeclared
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 7 — MarketDataProvider daily bars: port, Alpaca adapter, fake provider

**Requires:** Area 1 Green ✓ (the fake prices bars with `blackScholesPrice`)

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts` (mapper cases in `alpaca-market-data-mappers.test.ts` if present), `src/main/integrations/fake-market-data.test.ts`, `src/main/integrations/market-data-provider.test.ts` _(depends on: Area 1 Green ✓)_
  - `buildOptionBarsUrl(['A','B'], { start })` → `timeframe=1Day`, `limit=10000`, joined symbols, **no** `end`; `end` present when supplied; `page_token` appended when given
  - `buildStockBarsUrl('AAPL', { start, end })` → `feed=sip`, `adjustment=raw`, `timeframe=1Day`
  - `mapDailyBar({ t: '2026-03-12T05:00:00Z', vw: 200.123456, c: 201, v: 10, n: 7 })` → `{ date: '2026-03-12', vwap: '200.1235', close: '201.0000', volume: 10, tradeCount: 7 }`; `vw: NaN` → `null`; `04:00:00Z` maps to the ET day
  - `getOptionDailyBars` with 250 symbols → 3 requests (100/100/50), merges two pages via `next_page_token`, omits vendor-missing symbols; `symbols: []` → no fetch
  - `getStockDailyBars` ascending; 403 → `MarketDataError('auth_failed')`; 429 ×2 then 200 → success
  - Fake: fixture `{ AAPL: { price: 200.4, sessions: { '2026-03-12': 0.2475 } } }` → one bar per symbol with `vwap` = BS price at σ 0.2475, `tradeCount: 100`; unfixtured session or ticker → absent
  - Fake `untraded: [{ strike: 200.5, type: 'call' }]` → call absent, put present; `weeklyTradeCount: 0` → only third-Friday symbols; `tradeCount: 0` → nothing for that session
  - Fake request log `{ kind, underlying, start, end: null | string }` and `dailyBarRequestCount()`; `failWith: 'network_error'` throws for that ticker only; `latencyMs: 50` delays (fake timers)
  - Fake `getStockDailyBars` → one bar per fixture session, `vwap === '200.4000'`
  - Type-conformance test covers the two new port methods
  - Run the four test files — all new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/market-data-provider.ts`, `alpaca-market-data-mappers.ts`, `alpaca-market-data.ts`, `fake-market-data.ts` _(depends on: Area 7 Red ✓)_
  - Port per `contracts/market-data-provider-daily-bars.md`: `DailyBar`, `DailyBarRange`, `getOptionDailyBars`, `getStockDailyBars`, `IvHistoryBarSource`
  - Adapter: chunk 100, paginate, sequential; `end` appended only when defined; `date` via `etDateOf`; DEBUG per batch, INFO `alpaca_daily_bars_mapped`
  - Fake per `contracts/test-iv-history.md` "Fake pricing rule": fixture from `WHEELBASE_FAKE_IV_SERIES` plus `setFakeIvSeries()`; `parseOccSymbol` for identity; "monthly" decided locally by day-of-month/weekday (import only the pricer from core, not selection logic)
  - Run the four test files — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider a `fetchAllPages` helper shared with chain snapshots / open interest only if it reads cleanly (third copy is where extraction earns its name)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 12 — Renderer: tooltip range/percentile, null rank, absence reasons, settings message

**Requires:** Area 5 Green ✓ (`IpcIvRank` shape). The renderer types are mirrors of `contracts/watchlist-snapshot-ivrank.md`, so this area does not wait for Area 11's preload changes.

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/ivr-tooltip.test.ts`, `src/renderer/src/components/IvrCell.test.tsx`, `src/renderer/src/components/ReadingNote.test.tsx` (else `BenchDetail.test.tsx`), `src/renderer/src/pages/SettingsPage.test.tsx` _(depends on: Area 5 Green ✓)_
  - `ivrTooltipCopy({ state: 'fresh', value: '25', percentile: '71', low: '0.1800', high: '0.4500', … }).body` ends with `52-wk IV 0.1800–0.4500 · IV percentile 71`; same suffix for `aging`, `stale`, `expired`, `predates_earnings`
  - `IvrCell` `value: null` → text `n/a`, `data-ivr-state="fresh"`, tooltip with range and percentile; contrast with `ivRank={null}` (plain `n/a`, `data-ivr-state="empty"`, no tooltip)
  - `IvrCell` `ivRank={null}`, `absence={{ reason: 'pending' }}` → `…`, `data-ivr-state="pending"`, `animate-wb-pulse`, `title="Computing IV history"`, no ring, no tooltip
  - `IvrCell` `ivRank={null}` for `not_collected` / `failed` / `no_market_data` / `insufficient_history (150/252/200)` → `n/a`, `data-ivr-state="empty"`, `data-ivr-reason`, and the contract-table `title`; update the existing "muted n/a" case to pass `not_collected`
  - `IvrCell` `value: '25'` → `25`; aria-label contains `IV percentile 71` and `52-week IV 0.1800 to 0.4500`
  - `ReadingNote` `ivRank={null}` → one note per reason with `data-kind`; `pending`/`insufficient_history`/`not_collected` are `info`, `failed`/`no_market_data` are `warning`; texts carry the coverage numbers, credentials name, failed-run wording, ticker and condition phrase
  - `ReadingNote` fresh `value: null` → info note naming the flat range; fresh `value: '25'` → nothing
  - `SettingsPage` shows the credentials message for `skippedReason: 'market_data_unavailable'` and the updated completion text for `null`
  - Run the test files — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/ivr-tooltip.ts`, `components/IvrCell.tsx`, `components/ReadingNote.tsx`, `components/BenchCard.tsx`, `components/BenchDetail.tsx`, `lib/screener-format.ts`, `api/screener.ts`, `api/watchlist.ts`, `api/ivr.ts`, `pages/SettingsPage.tsx`, `components/bench-test-utils.ts` _(depends on: Area 12 Red ✓)_
  - `ScreenerIvRank` mirror, `ScreenerIvRankAbsence`, `ScreenerCandidate.ivRankAbsence`, `WatchlistSnapshotRow.ivRankAbsence`, `skippedReason` union
  - `formatIvRange(low, high)` with en dash; `ivrAbsenceTitle(absence)` and `ivrAbsenceNote(ticker, absence, condition)` as `switch`es over `absence.reason`
  - `IvrCell` props `{ ivRank, absence }`; one early-return block for `ivRank === null`; one extra tooltip `<span>` in `font-wb-mono text-[0.62rem] text-wb-text-muted`
  - `ReadingNote.noteFor` null branch calls `ivrAbsenceNote`; `formatIvrValue(null)` → `'n/a'`
  - Tailwind / `wb-*` tokens only, no inline styles
  - Run the test files — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 12 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `isUsableIvrState` stays the renderer's single copy of the rule; route `null` through `formatIvrValue`, not a second check path
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — IV-history service (depends on Layers 1–2)

### Area 9 — IV-history service: store, collection, recompute, metrics read

**Requires:** Area 3 Green ✓, Area 4 Green ✓, Area 6 Green ✓, Area 7 Green ✓, Area 8 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/iv-history.test.ts` _(depends on: Areas 3, 4, 6, 7, 8 Green ✓)_
  - Uses `makeTestDb`, `seedTradingCalendar`, `makeSpyLogger`, and the Area 3 bar fixture as a mock `IvHistoryBarSource`
  - `listMissingSessions` → sessions with neither reading nor gap, ascending
  - Empty table, 253-session calendar → stock bars once, option batches covering every planned symbol, 253 readings, `{ status: 'collected', readings: 253, gaps: 0 }`, `observed_at` = session `close_at`, `engine_version = IV30_ENGINE_VERSION`
  - Second call → `{ status: 'up_to_date' }` with zero provider calls; three sessions stale → exactly three requested (start = oldest missing)
  - `end` rule: after today's close → `end: undefined`; Saturday → `end` = Friday; never `etDateOf(now)`
  - Failed gate → `iv30_gap` `no_tradeable_pair`, **except** the newest completed session (no gap row, still missing next call); no stock bar → gap `no_underlying_bar`; a later reading deletes its gap in the same transaction
  - `auth_failed` → `{ status: 'no_market_data' }`, one INFO `iv_history_no_market_data`, nothing persisted; `network_error` → `{ status: 'failed' }` + WARN with `err`; a `SqliteError` is **not** caught
  - `recomputeIvHistory` rewrites `engine_version < current` rows from stored inputs (`'0.5200'` v0 → `'0.2600'` current), leaves current rows alone, takes no provider, returns counts; `force: true` rewrites all; non-inverting inputs → `unrecomputable`, unchanged, WARN
  - `collectIvHistory` calls `recomputeIvHistory` before computing missing sessions (spy order)
  - `readIvMetricsByUnderlying` → `reading` (`value '25'`, percentile, `low '0.1800'`, `high '0.4500'`, anchor close `observedAt`); 150 window readings → `insufficient` coverage 150; 60 rows → coverage 60; no rows → `none`; stale anchor → window is the 252 before it
  - `readIvMetricsByUnderlying` is synchronous and takes no provider (type-level)
  - Run `pnpm test src/main/services/iv-history.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/iv-history.ts` _(depends on: Area 9 Red ✓)_
  - `listMissingSessions`, `collectIvHistory`, `recomputeIvHistory`, `readIvMetricsByUnderlying` (`IvMetricsRead`), `IvHistoryTickerOutcome` (four statuses) per `data-model.md §3`
  - Knows nothing about run state; SQL as module constants (`INSERT … ON CONFLICT DO UPDATE`, gap delete before insert, window `SELECT`)
  - Required sessions via `getMostRecentCompletedSession` + last 253; window = 252 sessions strictly before the anchor
  - Logging: INFO `iv_history_collected`, `iv_history_recomputed`; DEBUG `iv_history_missing_sessions`, `iv_history_bar_request`, `iv_history_session_outcome`; WARN with `err`
  - Run `pnpm test src/main/services/iv-history.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/iv-history.ts` _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Split SQL/row mapping into `iv-history-store.ts` if the file passes ~300 lines; no `Decimal` arithmetic here, no Alpaca knowledge
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Run state (depends on Layer 3)

### Area 10 — IV run state: in-memory absence reasons

**Requires:** Area 9 Green ✓ (`settle` takes `IvHistoryTickerOutcome`)

- [x] **[Red]** Write failing tests — `src/main/services/iv-run-state.test.ts` _(depends on: Area 9 Green ✓)_
  - Fresh instance → `get('AAPL')` is `undefined`
  - `markPending('aapl')` → `get('AAPL') === 'pending'` (upper-cased on write and read)
  - `settle` with `collected` or `up_to_date` clears the entry; `failed` → `'failed'`; `no_market_data` → `'no_market_data'`
  - `markNoMarketData(['MSFT','NVDA'])` → both `'no_market_data'`; later `markPending('MSFT')` → `'pending'`; later `settle(collected)` → `undefined`
  - Two instances do not share state
  - Run `pnpm test src/main/services/iv-run-state.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/iv-run-state.ts` _(depends on: Area 10 Red ✓)_
  - `IvRunStatus`, `IvRunState`, `createIvRunState()` per `data-model.md §3b`: four functions over one `Map`, `settle` as a `switch` on `outcome.status`; never persisted, no logging
  - Run `pnpm test src/main/services/iv-run-state.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/iv-run-state.ts` _(depends on: Area 10 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm Area 11 imports the type from here rather than redeclaring it
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Rewire and retire Barchart (depends on Layers 1–4)

### Area 11 — Rewire collector, on-demand path and read path; retire Barchart

**Requires:** Area 5 Green ✓, Area 7 Green ✓, Area 9 Green ✓, Area 10 Green ✓

- [x] **[Red]** Write failing tests _(depends on: Areas 5, 7, 9, 10 Green ✓)_ — `src/main/services/ivr-collector.test.ts`, `ivr-on-demand.test.ts`, `ivr-snapshots.test.ts`, `watchlist-snapshot.test.ts`, `screener.test.ts`, `src/main/ipc/watchlist.test.ts`, `ipc/screener.test.ts`, `ipc/ivr.test.ts`, `ipc/test-iv-history.test.ts`, `src/main/schemas.test.ts`, `src/main/integrations/fake-clock.test.ts`, `src/main/index.test.ts`
  - Collector: second of three tickers `network_error` → `{ successCount: 2, errorCount: 1, skippedCount: 0, skippedReason: null }`, WARN with `err`, others persisted
  - Collector: first ticker `no_market_data` → `skippedReason: 'market_data_unavailable'`, one INFO `ivr_collection_skipped_no_market_data`, loop stops, every target reads `'no_market_data'`
  - Collector run-state order: `markPending(t)` before `collectIvHistory(t)`, `settle(t, outcome)` after; `failed` ticker reads `'failed'`, others `undefined`
  - Collector: complete ticker → `skippedCount`; Saturday/holiday clock with complete series → all `up_to_date`, zero bar requests; delete the US-100 weekend guard tests; no `trigger` argument (type-level); abort signal test retained; `SqliteError` not caught per ticker
  - On-demand: `collect('MSFT')` awaits `ensureTradingCalendar`, collects only MSFT, fires `onCollected` only on `collected`, never rejects; `addWatchlistEntry` returns before a slow collect (retained)
  - On-demand: `runState.get('MSFT') === 'pending'` synchronously after `collect` is called; afterwards `undefined` / `'failed'` / `'no_market_data'` (including when `getProvider()` throws)
  - `absenceFor` precedence table: `(pending, insufficient)` → `pending`; `(no_market_data, none)`; `(failed, insufficient)`; `(undefined, insufficient 150)` → `{ insufficient_history, coverage: 150, window: 252, required: 200 }`; `(undefined, none)` → `not_collected`
  - `readIvRankLookup`: no rows → `{ reading: null, absence: not_collected }`; complete series → reading wins even while `pending`; 150 window readings → `insufficient_history`; `unreadable` logs `ivr_assessment_unreadable_snapshot` and reports `not_collected`
  - `buildWatchlistSnapshot`: exactly one of `ivRank` / `ivRankAbsence` non-null; `pending` gives the same `unknown('IV unavailable')` gate as `not_collected`
  - `screenWatchlistCandidates`: candidate carries `ivRankAbsence`; `failed` ticker ranks `n/a` with floor not applied
  - IPC: `registerWatchlistIpc` / `registerScreenerIpc` forward the given `runState` (spy); `index.test.ts` asserts one `createIvRunState()` reaches all four consumers, `ivr-collect` still `{ kind: 'afterClose', offsetMinutes: 60 }`, no `barchart-ivr-scraper` import
  - Schema: `skippedReason: 'market_data_unavailable'` parses; `'barchart_down'` fails
  - `createFakeClock()` → `undefined` without `WHEELBASE_FAKE_NOW`, else reads env / `setFakeNow` (tests moved from `fake-ivr.test.ts`)
  - `test-iv-history` handlers: `_test:iv-series-set` replaces fixture and resets log; `_test:iv30-corrupt` sets `iv30` + `engine_version = 0`; `_test:table-exists` reads `sqlite_master`; `_test:iv30-history` ordered `(underlying, session)`
  - Re-point `ivr-snapshots.test.ts` and `screener.test.ts` from `getLatestIvrByUnderlying` / `seedIvr` to `readIvMetricsByUnderlying` / `seedIv30Series`
  - Run `pnpm test src/main` — all new tests must fail
- [x] **[Green]** Implement _(depends on: Area 11 Red ✓)_ — per `contracts/ivr-collect-now.md`, `contracts/watchlist-snapshot-ivrank.md`, `contracts/test-iv-history.md`, `data-model.md §3b/§4`, and the `research.md` ADRs on auth-abort, absence reasons, Barchart retirement and the e2e seam
  - `ivr-collector.ts`: loop `collectIvHistory` with `markPending` / `settle`; `no_market_data` → `markNoMarketData(remaining)` + break; remove `collectTicker`, `persistSnapshot`, `utcDayBounds`, `fetchIvr`, the Barchart import and the closed-day guard (`trigger`, `getTradingSession`, `'market_closed'`); provider becomes the full `MarketDataProvider`
  - `ivr-on-demand.ts`: `runState.markPending(ticker)` as the first statement, then the try block from the plan with `getProvider()` inside it; drop the same-session check
  - `ivr-snapshots.ts`: `readIvRankLookup`, `IvRankAbsence`, `IvRankLookup`, pure `absenceFor`; delete `getLatestIvrByUnderlying` / `LATEST_IVR_QUERY`
  - `watchlist-snapshot.ts` and `screener.ts`: `ivRankAbsence` on rows/candidates, `runState` in options, only `ivRank` reaches `evaluateEntry`; `usableIvRanks` reads `lookup.reading`
  - `ipc/watchlist.ts`, `ipc/screener.ts`: required `runState` parameter, handlers stay one-liners
  - `test-utils.ts`: delete `seedIvr` / `IvrSeedRow`, add `seedIv30Series`; `core/trading-calendar.ts`: remove `observationWindowOf` and its tests
  - `schemas.ts`: widen `CollectIvrNowBatchSchema.skippedReason`
  - New `integrations/fake-clock.ts`; rename `ipc/test-ivr.ts` → `ipc/test-iv-history.ts` with the new channels
  - **Delete** `integrations/barchart-ivr-scraper.ts` (+test) and `integrations/fake-ivr.ts` (+test)
  - `preload/index.ts`, `preload/index.d.ts`: new `_test:*` bridges, remove `testIvrSetOutcomes` / `testIvrFetchLog` / `testIvrSnapshots`, `IpcIvRankAbsence`, `ivRankAbsence` on snapshot rows and screener candidates, `skippedReason`
  - `index.ts`: `createFakeClock()` replaces `createFakeIvrCollaborators()`; one `ivRunState` passed to on-demand, both IPC registrations and the `ivr-collect` handler (no `trigger`, no `fetchIvr`); `registerTestIvHistoryIpc(db)`
  - Logging: INFO `ivr_collection_skipped_no_market_data`; DEBUG `iv_run_state_settled { ticker, status }`; update ADR-referencing comments about `persistSnapshot`
  - Run `pnpm test` — all tests must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 11 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `ivr-collector.ts` shrinks to targets + loop + classification; extract `ivHistoryDeps(...)` if collector and on-demand build the same `CollectIvHistoryInput`
  - Remove now-unused `IVRResult` imports (`grep -rn IVRResult src e2e`)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — E2E harness migration (depends on all main-process and renderer Green tasks)

### Area 13 — E2E harness migration to the series seam

**Requires:** Area 8 Green ✓, Area 11 Green ✓, Area 12 Green ✓

- [x] **[Red]** Migrate existing e2e specs to the series seam _(depends on: Areas 8, 11, 12 Green ✓)_
  - `pnpm rebuild:electron`, then run `pnpm test:e2e` and record the failures the removed Barchart seam causes. This is the red signal.
  - Update, keeping AC names unless renamed below: `e2e/ivr-collector.spec.ts`, `ivr-on-demand.spec.ts`, `ivr-watchlist-collection.spec.ts`, `ivr-staleness.spec.ts`, `screener-results.spec.ts`, `screening-criteria.spec.ts`, `screener-earnings.spec.ts`, `watchlist-bench.spec.ts`, `watchlist-edit.spec.ts`, `watchlist.spec.ts`, `market-facts-without-broker.spec.ts`
  - Renames: "Market is closed on a non-trading day" → "A scheduled weekend run makes no bar requests"; "A ticker Barchart does not cover" → "A ticker with no bar data is added without an IV rank"; "no IVR coverage is skipped" → "no bar data → `n/a`, others unaffected"
  - Deletions: `not_available` and `parse_error` collector cases; "The scheduled run still skips a weekend"
  - Expectations: `ivr:` fixtures become rank numbers or `{ rank, endingSessionsAgo }`; `'38.0'` → `'38'`; `IV rank 22.0 below 30` → `IV rank 22 (…) below 30`; persistence asserts `iv30_reading` rows
- [x] **[Green]** Implement harness — `e2e/ivr-helpers.ts`, `e2e/trading-day-fixtures.ts`, `e2e/screener-helpers.ts` _(depends on: Area 13 Red ✓)_
  - `ivr-helpers.ts`: remove the `IvrOutcome` family, `setIvrOutcomes`, `readIvrFetchLog`; add `FakeIvSeriesFixture`, `seriesForRank`, `seriesWithRange`, `seriesWithPercentile`, `flatSeries`, `sparseSeries`, `setIvSeries`, `readIv30History`, `readIv30Gaps`, `readDailyBarRequests`, `recomputeIvHistory`, `corruptIv30`, `tableExists`, `readingNote`; `buildIvrLaunchEnv` sets `WHEELBASE_FAKE_IV_SERIES`, not `WHEELBASE_FAKE_IVR`; `seedBenchAndSettle` polls `readIv30History`
  - `seriesForRank(r)`: 252 window values evenly spaced in `[0.2000, 0.6000]` plus today `= 0.2 + 0.004·r`, ending `endingSessionsAgo` before `FAKE_NOW_DAY`
  - `trading-day-fixtures.ts`: `CALENDAR_LOOKBACK_DAYS = 450`, `sessionsBetween(from, count)`
  - `screener-helpers.ts`: `ivrCell` returns `reason` and `title`, recognises `data-ivr-state="pending"`; `IvrFixture` → `number | { rank; endingSessionsAgo }`; `seedIvr` builds series into the launch env and waits for rows
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e harness _(depends on: Area 13 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Delete every `IVRResult`-shaped type in `e2e/`; no spec references `WHEELBASE_FAKE_IVR`

---

## Layer 7 — E2E acceptance tests

**Requires:** All Green tasks from previous layers ✓

### Area 14 — E2E Tests

- [x] **[Red]** Write failing e2e tests — `e2e/iv-history.spec.ts` _(depends on: Area 13 Green ✓)_
  - One `it()` per acceptance scenario, named verbatim from Linear OPT-27. Each test launches its own app (`tmpDb`, `afterEach` close + `cleanupDb`) in the style of `ivr-staleness.spec.ts`. Background: AAPL on the bench, no Barchart.
  - AC coverage (fixtures and assertions are spelled out in plan Area 14):
    - AC-1: IV rank is computed from the app's own IV history → `it('IV rank is computed from the app\'s own IV history')`
    - AC-2: IV percentile is computed alongside IV rank → `it('IV percentile is computed alongside IV rank')`
    - AC-3: The IV range behind the rank is reported with it → `it('The IV range behind the rank is reported with it')`
    - AC-4: A reading outside the window's range is clamped → `it('A reading outside the window\'s range is clamped')`
    - AC-5: A flat window withholds rank but not percentile → `it('A flat window withholds rank but not percentile')`
    - AC-6: A corrected engine recomputes every derived metric from stored inputs → `it('A corrected engine recomputes every derived metric from stored inputs')`
    - AC-7: Reading IV metrics makes no market-data request → `it('Reading IV metrics makes no market-data request')`
    - AC-8: A reading is withheld while the window is too sparse to trust → `it('A reading is withheld while the window is too sparse to trust')`
    - AC-9: A young history is withheld the same way → `it('A young history is withheld the same way')`
    - AC-10: Adding a ticker does not wait on its backfill → `it('Adding a ticker does not wait on its backfill')`
    - AC-11: One ticker's backfill failure leaves the others intact → `it('One ticker\'s backfill failure leaves the others intact')`
    - AC-12: Missed sessions are caught up by the next daily run → `it('Missed sessions are caught up by the next daily run')`
    - AC-13: An untraded strike is skipped for its neighbour → `it('An untraded strike is skipped for its neighbour')`
    - AC-14: Thin weeklies fall back to the monthly expirations → `it('Thin weeklies fall back to the monthly expirations')`
    - AC-15: A day with no tradeable ATM pair is left as a gap → `it('A day with no tradeable ATM pair is left as a gap')`
    - AC-16: Today's reading is computed the same way as the history → `it('Today\'s reading is computed the same way as the history')`
    - AC-17: Bar requests never name the current calendar day as their end → `it('Bar requests never name the current calendar day as their end')`
    - AC-18: Today's reading is available the same evening → `it('Today\'s reading is available the same evening')`
    - AC-19: Barchart readings are removed on upgrade → `it('Barchart readings are removed on upgrade')`
    - AC-20: No market-data credentials leaves IV rank unavailable, not broken → `it('No market-data credentials leaves IV rank unavailable, not broken')`
    - AC-21a: screener floor, 29 → `it('The computed rank drives the screener floor — 29 is excluded')`
    - AC-21b: screener floor, 30 → `it('The computed rank drives the screener floor — 30 is included')`
    - AC-21c: screener floor, n/a → `it('The computed rank drives the screener floor — n/a is treated as it is today when IVR is unavailable')`
    - AC-22a–e: Expirations too near expiry are excluded from IV30 → `it('Expirations too near expiry are excluded from IV30 — 3 DTE excluded')`, `— 6 DTE excluded`, `— 7 DTE used`, `— 9 DTE used`, `— 14 DTE used`
  - Absence scenarios (AC-8, 9, 10, 11, 20) assert `ivrCell(...).reason` / `.title` and `readingNote(page)`, never a bare `n/a`
  - Run `pnpm test:e2e` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: Area 14 Red ✓)_
  - Add any helper the tests need that Area 13 did not
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: Area 14 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Share 252/253-session series builders between `iv-history.spec.ts` and `screener-helpers.ts`; keep each test under ~40 lines

---

## Out of scope (from the plan — do not add tasks for these)

Reviving the scraper or the WAF challenge; honest failure reporting for the dead Barchart path; a
paid vendor; minute/hour-bar methods; a rate series or dividend model; IV − HV, IV change, term
structure; screening or alerting on percentile/range; intraday IV; backfilling beyond the rank
window; charted IV history; reworking the bench card layout; renaming the `ivr:*` channels or the
`ivr-collect` job.

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC (AC audit table in `plan.md`)
- [x] No reference to `barchart-ivr-scraper`, `fake-ivr`, `WHEELBASE_FAKE_IVR` or `ivr_snapshot` remains in `src/` or `e2e/` (migration 007 and 016 excepted)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [x] `pnpm format`
- [x] `/update-spec us-121`
