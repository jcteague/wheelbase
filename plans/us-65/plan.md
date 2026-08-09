---
story: us-65
kind: feature
parent: null
topics: [screener, market-data]
status: planned
---

# Implementation Plan: US-65 — Score wheel candidates against configurable screening criteria

## Summary

Turn US-64's raw put chains into a ranked, explainable candidate list: a new pure engine
`src/main/core/screener.ts` disqualifies strikes against six hard filters (each with a
machine-readable reason), scores the survivors on premium yield, and ranks the best
strike per ticker by **yield-per-delta** (annualized return-if-flat ÷ |delta|). A thin
`src/main/services/screener.ts` joins the chains with the latest IVR (new `ivr_snapshot`
read path) and exposes the whole thing over a new `screener:results` IPC channel. Done =
all eight AC scenarios pass headlessly, exclusions travel alongside survivors, and the
full suite stays green. No renderer work — US-66 consumes the channel.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and
API contract:

- **User Story & Acceptance Criteria:** `docs/epics/08-stories/US-65-score-wheel-candidates.md`
- **Research & Design Decisions:** `plans/us-65/research.md`
- **Data Model & Selection Logic:** `plans/us-65/data-model.md`
- **API Contract:** `plans/us-65/contracts/screener-results.md`
- **Quickstart & Verification:** `plans/us-65/quickstart.md`
- **Display surface these numbers feed (context only, not built here):**
  `mockups/us-66-screener-results.mdx`

## Prerequisites

All required infrastructure exists — **no migrations, no new dependencies**:

- **US-64 (landed):** `src/main/core/candidate-chain.ts` (`CandidateStrike`, `DteWindow`)
  and `src/main/services/candidate-chains.ts` (`pullWatchlistChains` →
  `{ status, tickers: (ok | no_options_listed | data_unavailable)[] }`). Not modified by
  this story.
- **US-44 (landed):** `ivr_snapshot` table (`migrations/007_create_ivr_snapshot.sql`),
  written by `services/ivr-collector.ts`. US-65 adds the first **read** path.
- **US-63 (landed):** `watchlist` table + `listWatchlist(db)`.
- `src/main/core/dte.ts` `computeDte`, `decimal.js` (global `ROUND_HALF_UP` set in
  `core/costbasis.ts`), `date-fns`, `handleIpcCall` (`src/main/ipc/utils.ts`).
- Precision as **actually implemented** (not as the US-64 plan doc states): `strike` 4dp,
  `mark`/`bid`/`ask` 2dp, `delta` 4dp and **signed** (puts come back negative).

## Implementation Areas

### 1. Screening criteria + yield math (pure core)

**Files to create or modify:**

- `src/main/core/screener.ts` — new pure module: criteria types, defaults, and the
  scoring helpers. No DB / provider / logger imports (`pure-core-engines` ADR).
- `src/main/core/screener.test.ts` — new test file.

**Red — tests to write** (`src/main/core/screener.test.ts`):

- `DEFAULT_SCREENING_CRITERIA` equals the story Background: `deltaMin '0.20'`,
  `deltaMax '0.30'`, `dteMin 30`, `dteMax 45`, `minOpenInterest 500`,
  `maxSpreadPercent '10'`, `maxSpreadAbsolute '0.10'`, `maxUnderlyingPrice null`,
  `earningsHandling 'exclude'`.
- `scoreCandidate` on the AC-1 strike (strike `180.0000`, mark `2.70`, dte 37,
  delta `-0.2800`) returns `periodYield '0.0150'`, `annualizedYield '0.1480'`,
  `capitalSecured '18000.00'`, `yieldPerDelta '0.5285'` — asserting the round-once rule
  (`0.5285`, **not** `0.5286` from a pre-rounded annualized).
- `scoreCandidate` absolutizes a negative put delta: input `-0.2800` → output
  `delta '0.2800'`.
- Yield-per-delta worked examples from AC-2: annualized `0.3000` ÷ delta `0.30` →
  `'1.0000'`; annualized `0.2400` ÷ delta `0.20` → `'1.2000'`.
- `scoreCandidate` computes `spreadAbsolute '0.60'` / `spreadPercent '22.22'` for
  bid `2.40` / ask `3.00` / mark `2.70`.
- Mark is copied from the strike, never recomputed: a strike whose `mark` disagrees with
  `(bid+ask)/2` still yields on the supplied `mark`.

**Green — implementation:**

- `EarningsHandling`, `ScreeningCriteria`, `DEFAULT_SCREENING_CRITERIA`,
  `TickerScreeningInput`, `ScoredCandidate` types exactly per `data-model.md`.
- `scoreCandidate(strike: CandidateStrike, ticker, dte, ivRank, criteria?)` building the
  `ScoredCandidate`: `spreadAbsolute = ask − bid` (2dp),
  `spreadPercent = (ask − bid) / mark × 100` (2dp), `capitalSecured = strike × 100` (2dp),
  `periodYield = mark / strike` (4dp), `annualizedYield = periodYield × 365 / dte` (4dp),
  `yieldPerDelta = annualizedYield / |delta|` (4dp) — all derived from one unrounded
  `Decimal` chain, rounded only when writing each field (`round once` ADR). Calendar 365,
  never 252.
- Carry through `openInterest`, `volume`, `ivRank`, `timestamp`, `contractId`,
  `expiration`, `bid`, `ask`, `mark`, `strike`; emit `delta` as `|delta|` at 4dp.

**Refactor — cleanup to consider:**

- Keep a single `toDecimal`/formatting seam so no field re-parses a rounded string.
- Confirm no `logger` import crept in and that the only imports are `decimal.js`,
  `date-fns` (if needed), and type-only imports from `core/candidate-chain`.

**Acceptance criteria covered:** "Premium yield is computed on capital secured";
supplies the score for "Rank is annualized yield per unit of delta".

### 2. Hard-filter registry + exclusion reasons (pure core)

**Files to create or modify:**

- `src/main/core/screener.ts` — add the ordered `FILTERS` registry, `ExclusionCode`,
  `ExcludedCandidate`, and the reason-formatting helpers.
- `src/main/core/screener.test.ts` — extend.

**Red — tests to write** (`src/main/core/screener.test.ts`):

- Delta band: `|delta| 0.42` against `0.20–0.30` → excluded, `code 'delta_band'`,
  `reason 'delta 0.42 outside 0.20–0.30'` (2dp, **en dash** U+2013). A signed `-0.4200`
  produces the same message.
- Delta band boundaries: `0.2000` and `0.3000` are **inclusive** (not excluded).
- Open interest: `120` against floor `500` → `code 'open_interest'`,
  `reason 'open interest 120 below 500'`. `openInterest: null` does **not** exclude;
  `openInterest: 0` does.
- Spread: bid `2.40` / ask `3.00` / mark `2.70` → `code 'spread'`,
  `reason 'spread 22% exceeds 10%'` (percent rendered 0dp).
- Spread absolute escape hatch: bid `0.08` / ask `0.15` → **not** excluded, because the
  `$0.07` absolute spread is within the `$0.10` floor even though it is 58% of mark
  (both thresholds must be breached).
- DTE window: expiration 52 days out against `30–45` → `code 'dte_window'`,
  `reason 'DTE 52 outside 30–45'`. An unparseable expiration and a `dte` of `0` also
  fail `dte_window` (guards a divide-by-zero in the annualized yield).
- Missing delta: `delta: null` → `code 'delta_unavailable'`, `reason 'delta unavailable'`.
- Price ceiling: `maxUnderlyingPrice '75'` with `underlyingPrice '412.00'` →
  `code 'price_ceiling'`, `reason 'underlying $412.00 above $75.00 ceiling'`; with
  `maxUnderlyingPrice: null` **or** `underlyingPrice: null` the filter does not fire.
- Earnings: `earningsHandling 'exclude'` + `earningsDate '2026-07-31'` +
  expiration `2026-08-21` → `code 'earnings_in_window'`,
  `reason 'earnings 2026-07-31 falls before expiry'`; earnings **after** expiry does not
  fire; `earningsHandling 'flag'` does not fire; `earningsDate: null` does not fire.
- First failure wins: a strike breaching both the delta band and the OI floor reports
  only `delta_band` (the earlier filter).

**Green — implementation:**

- `ExclusionCode` union and `ExcludedCandidate` per `data-model.md`.
- `FILTERS: FilterDefinition[]` — an ordered array of pure
  `{ code, applies, test, reason }` objects in the registry order
  `price_ceiling → earnings_in_window → dte_window → delta_unavailable → delta_band →
open_interest → spread`, following `core/alerts.ts`'s `RULES` shape
  (`alert-rule-registry` ADR). `applies` returning `false` means "cannot evaluate" and
  the candidate passes (`never exclude on a missing input` ADR).
- Named reason builders (one per filter, mirroring `alerts.ts`'s summary helpers) plus
  shared formatters: `formatDelta` (2dp), `formatBand` (en dash), `formatPercent` (0dp
  - `%`), `formatMoney` (`$` + 2dp).
- Earnings comparison via `date-fns` (`parseISO` + `isAfter`/`compareAsc`) — never string
  slicing (project Date Handling rule).
- `evaluateFilters(...)` returning the first failing `{ code, reason, index }` or `null`.

**Refactor — cleanup to consider:**

- Check the registry reads top-to-bottom as the funnel a trader would describe; the
  ordering rationale is load-bearing (it decides US-66's representative reason) so keep
  the comment explaining it next to the array.
- Look for duplication between the reason builders and `scoreCandidate`'s spread math —
  compute the spread once and pass it in rather than deriving it twice.

**Acceptance criteria covered:** "Exclude a strike outside the delta band"; "Exclude an
illiquid strike"; "Exclude a wide-spread strike"; "Narrow absolute spread on a cheap
option is not excluded".

### 3. `screenTicker` + `rankCandidates` (pure core composition)

**Files to create or modify:**

- `src/main/core/screener.ts` — add `TickerScreeningResult`, `screenTicker`,
  `rankCandidates`.
- `src/main/core/screener.test.ts` — extend.

**Red — tests to write** (`src/main/core/screener.test.ts`):

- `screenTicker` with three surviving AAPL strikes returns `best` = the highest
  `yieldPerDelta` one, and the other two survivors do **not** appear anywhere in the
  result (one strike represents the ticker).
- A high-yield strike outside the delta band lands in `excluded`, never in `best` — and
  a lower-yield in-band strike becomes `best` (a high score does not rescue).
- `excluded` ordering: given a ticker whose in-band strike fails `spread` and whose
  out-of-band strikes fail `delta_band`, `excluded[0].code === 'spread'` (latest filter
  stage first, per the representative-reason ADR).
- All strikes excluded → `best: null` with a non-empty `excluded`.
- `ivRank: null` flows into `best.ivRank === null` and the candidate still scores and
  ranks (no exclusion, no zero substituted).
- `rankCandidates` sorts bests by `yieldPerDelta` desc — AC-2's candidate B (`1.2000`)
  above candidate A (`1.0000`); equal scores tie-break by ticker ascending; tickers with
  `best: null` are omitted.

**Green — implementation:**

- `screenTicker(input, criteria, currentDate)`: compute `dte` per strike via
  `computeDte(expiration, currentDate)`, run `evaluateFilters`, score survivors with
  `scoreCandidate`, pick `best` by highest `yieldPerDelta` (tie → lower `strike`), and
  sort `excluded` by filter index desc then chain order.
- `rankCandidates(results)`: map non-null `best`, sort by `Decimal(yieldPerDelta)` desc
  then `ticker` asc.

**Refactor — cleanup to consider:**

- The best-of comparator and the rank comparator both compare `yieldPerDelta`; name one
  shared comparator rather than inlining `new Decimal(...).cmp(...)` twice.
- Verify `screenTicker` stays a fold over the strikes (`map`/`filter`/`reduce`, no
  mutation) per the functional-style rule.

**Acceptance criteria covered:** "Best strike per ticker is selected"; "Rank is
annualized yield per unit of delta"; "Missing IV rank does not exclude a candidate"
(engine half).

### 4. IVR read path

**Files to create or modify:**

- `src/main/services/ivr-snapshots.ts` — new read-only module.
- `src/main/services/ivr-snapshots.test.ts` — new test file (in-memory DB, migrations
  applied).

**Red — tests to write** (`src/main/services/ivr-snapshots.test.ts`):

- Two `ivr_snapshot` rows for AAPL with different `observed_at` → the map holds the
  **latest** row's `ivr`.
- A requested underlying with no rows is **absent** from the map (not `null`, not `'0'`).
- Lower-case input `'aapl'` resolves the stored `'AAPL'` row (collector stores upper-case).
- An empty `underlyings` array returns an empty map without preparing a statement.

**Green — implementation:**

- `getLatestIvrByUnderlying(db, underlyings): Map<string, string>` — prepare
  `SELECT ivr FROM ivr_snapshot WHERE underlying = ? ORDER BY observed_at DESC LIMIT 1`
  once, execute per upper-cased underlying, skip misses.
- `logger.debug` with the requested tickers and hit count.

**Refactor — cleanup to consider:**

- Confirm the module stays write-free and that `ivr-collector.ts` is untouched (the
  read/write split is a deliberate ADR).

**Acceptance criteria covered:** supplies the IVR join for "Missing IV rank does not
exclude a candidate".

### 5. Screener service orchestration

**Files to create or modify:**

- `src/main/services/screener.ts` — new service: `ScreenerExclusion`, `ScreenerResults`,
  `screenWatchlistCandidates`.
- `src/main/services/screener.test.ts` — new test file (stubbed provider, in-memory DB).

**Red — tests to write** (`src/main/services/screener.test.ts`):

- Calls `pullWatchlistChains` with the DTE window derived from the criteria
  (`{ min: dteMin, max: dteMax }`) and the supplied `currentDate`.
- Chains `status: 'provider_unavailable'` → returns
  `{ status: 'provider_unavailable', ranked: [], excluded: [], quoteTimestamp: null }`
  and never calls `getStockQuotes` or the IVR read.
- Two `ok` tickers with survivors → `ranked` in yield-per-delta order, one row per ticker.
- A ticker whose IVR row is missing still ranks, with `ivRank: null`.
- The IVR read throwing degrades to an empty map, logs at **warn**, and every candidate
  still ranks with `ivRank: null` (boundary I/O degrades to empty, per the
  `alert-evaluation-failure-isolation` ADR).
- `getStockQuotes` is called **only** when `criteria.maxUnderlyingPrice !== null`; when
  it throws, it degrades to an empty map + warn and the ceiling simply does not fire.
- `no_options_listed` → `excluded` row `{ code: 'no_options_listed', reason: 'no options
listed' }`; `data_unavailable` → `{ code: 'data_unavailable', reason: 'market data
unavailable' }`.
- A ticker with zero survivors contributes one `excluded` row carrying its representative
  `code`/`reason` (`excluded[0]` from the engine).
- `screenTicker` throwing for one ticker logs at error and drops that ticker to
  `data_unavailable` while the others still rank (failure-isolation regression).
- `quoteTimestamp` is the newest `timestamp` across `ranked`; `null` when `ranked` is
  empty.
- Omitted `criteria` falls back to `DEFAULT_SCREENING_CRITERIA`.

**Green — implementation:**

- `screenWatchlistCandidates(provider, db, opts)` following `data-model.md`'s
  orchestration steps 1–7: pull chains → short-circuit on outage → IVR join in
  `try/catch` → conditional quote fetch in `try/catch` → `earningsDate: null` for now
  (US-70 seam) → per-ticker `screenTicker` in its own `try/catch` → `rankCandidates` →
  `quoteTimestamp`.
- `logger.debug` for the request (tickers, criteria) and per-ticker outcomes;
  `logger.info` once with `{ status, rankedCount, excludedCount }` on completion,
  matching `candidate-chains.ts`'s logging shape.

**Refactor — cleanup to consider:**

- The `TickerChainResult` → `ScreenerExclusion` mapping is a small named function, not an
  inline switch inside the reduce.
- Compare the degrade-to-empty helpers here with `candidate-chains.ts`; if the shape is
  literally the same, share it rather than copying — otherwise leave both explicit.

**Acceptance criteria covered:** "Missing IV rank does not exclude a candidate" (service
half); assembles all eight scenarios end to end.

### 6. `screener:results` IPC + preload exposure

**Files to create or modify:**

- `src/main/ipc/screener.ts` — new handler `registerScreenerIpc({ db, getProvider })`.
- `src/main/ipc/screener.test.ts` — new test file.
- `src/main/index.ts` — register alongside `registerWatchlistIpc({ db })`, passing the
  same `getProvider` accessor `registerMarketDataHandlers` receives.
- `src/preload/index.ts` — add `screener: { results: () => invoke('screener:results') }`.
- `src/preload/index.d.ts` — add `IpcScoredCandidate`, `IpcScreenerExclusion`,
  `IpcScreenerResultsResult`, and the `screener` namespace on `Window.api`.

**Red — tests to write** (`src/main/ipc/screener.test.ts`, mocking `ipcMain` like
`src/main/ipc/watchlist.test.ts`):

- `screener:results` is registered and invoking it returns
  `{ ok: true, status, ranked, excluded, quoteTimestamp }` from a stubbed
  `screenWatchlistCandidates`.
- The handler takes no payload and passes `getProvider()` + `db` straight through — one
  service call, no branching (thin-handler rule).
- A service throw returns the envelope
  `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', ... }] }` and never
  rejects to the renderer, per `contracts/screener-results.md`.

**Green — implementation:**

- `registerScreenerIpc` wrapping a single `screenWatchlistCandidates(getProvider(), db)`
  call in `handleIpcCall('screener_results_error', ...)`. No Zod request schema — the
  channel takes no payload (see the contract).
- Wire registration in `src/main/index.ts` and the preload/`.d.ts` surface so US-66 can
  call `window.api.screener.results()`.

**Refactor — cleanup to consider:**

- Verify the handler file contains no business logic (Zod-parse-plus-single-call
  convention) and that the preload `.d.ts` types mirror `ScoredCandidate` field-for-field
  rather than widening to `unknown`.

**Acceptance criteria covered:** none directly — this is the delivery surface US-66
consumes; it is exercised by the integration tests in Area 7.

### 7. E2e Tests (headless AC integration)

> US-65 has no renderer surface (the table is US-66), so Playwright `_electron` does not
> apply — the same rationale as US-64's Area 4. AC coverage runs the **real**
> `screenWatchlistCandidates` against an in-memory SQLite DB (migrations applied,
> `watchlist` + `ivr_snapshot` seeded per `quickstart.md`) and a scripted
> `MarketDataProvider`. One test per AC, named to mirror the Gherkin.

**Files to create or modify:**

- `src/main/services/screener.integration.test.ts` — new file; seed helpers
  `seedWatchlist(db, tickers)` / `seedIvr(db, rows)` / `scriptChains(scenario)`.

**Red — tests to write** (one per AC, names mirror the story's scenario titles):

- `"premium yield is computed on capital secured"` — AAPL 37-DTE $180 put, mark $2.70;
  assert the ranked row shows `periodYield '0.0150'` (1.5%), `annualizedYield '0.1480'`
  (14.8%), and `capitalSecured '18000.00'`. (AC-1)
- `"rank is annualized yield per unit of delta"` — candidate A 0.30Δ / 30.0% annualized,
  candidate B 0.20Δ / 24.0% annualized on two tickers; assert B precedes A in `ranked`
  and their scores are `'1.2000'` and `'1.0000'`. (AC-2)
- `"a strike outside the delta band is excluded"` — an AMD strike at 0.42Δ with a fat
  yield; assert it is absent from `ranked` and present in `excluded` with reason
  `'delta 0.42 outside 0.20–0.30'`. (AC-3)
- `"an illiquid strike is excluded"` — OI 120 against the 500 floor; assert reason
  `'open interest 120 below 500'`. (AC-4)
- `"a wide-spread strike is excluded"` — bid 2.40 / ask 3.00 / mark 2.70; assert reason
  `'spread 22% exceeds 10%'`. (AC-5)
- `"a narrow absolute spread on a cheap option is not excluded"` — bid 0.08 / ask 0.15;
  assert the ticker appears in `ranked` and has no `spread` exclusion. (AC-6)
- `"missing IV rank does not exclude a candidate"` — seed `ivr_snapshot` for KO and AAPL
  but **not** MSFT; assert MSFT is in `ranked` with `ivRank: null` and its
  `yieldPerDelta` is unaffected. (AC-7)
- `"the best strike per ticker is selected"` — AAPL with three surviving strikes; assert
  exactly one AAPL row in `ranked` and that it is the highest-scoring survivor. (AC-8)

**Green — implementation:**

- No new production code beyond Areas 1–6; build the seeding/scripting harness and fix
  whatever full-scenario runs surface.

**Refactor — cleanup to consider:**

- Factor a `chainStrike({ strike, bid, ask, delta, oi, expiration })` builder so each
  test states only the fields its AC is about; check whether US-64's
  `candidate-chains.integration.test.ts` already has a compatible builder to reuse rather
  than duplicating one.

**Acceptance criteria covered:** all eight — one named test each.

## AC Audit

| #   | Acceptance criterion (from US-65)                        | Covered by e2e test in Area 7                                  |
| --- | -------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Premium yield is computed on capital secured             | `"premium yield is computed on capital secured"`               |
| 2   | Rank is annualized yield per unit of delta               | `"rank is annualized yield per unit of delta"`                 |
| 3   | Exclude a strike outside the delta band                  | `"a strike outside the delta band is excluded"`                |
| 4   | Exclude an illiquid strike                               | `"an illiquid strike is excluded"`                             |
| 5   | Exclude a wide-spread strike                             | `"a wide-spread strike is excluded"`                           |
| 6   | Narrow absolute spread on a cheap option is not excluded | `"a narrow absolute spread on a cheap option is not excluded"` |
| 7   | Missing IV rank does not exclude a candidate             | `"missing IV rank does not exclude a candidate"`               |
| 8   | Best strike per ticker is selected                       | `"the best strike per ticker is selected"`                     |

All eight ACs map to exactly one named e2e test. No uncovered ACs.
</content>
