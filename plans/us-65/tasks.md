# US-65 — Score wheel candidates against configurable screening criteria — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

**Source documents:** `plans/us-65/plan.md`, `research.md`, `data-model.md`,
`contracts/screener-results.md`, `quickstart.md`,
`docs/epics/08-stories/US-65-score-wheel-candidates.md`

**Story-wide invariants** (apply to every task):

- `src/main/core/screener.ts` is a **pure** engine — no DB, provider, or `logger` imports
  (pure-core-engines ADR). Only `decimal.js`, `date-fns`, `core/dte`, and type-only
  imports from `core/candidate-chain`.
- All money/ratio math via `decimal.js` (`ROUND_HALF_UP` is set globally in
  `core/costbasis.ts`); build one unrounded `Decimal` chain and **round once** when
  writing each output field.
- Delta is **absolute** in every engine comparison and output; the adapter keeps the
  signed value.
- Dates via `date-fns` / `computeDte` — never `timestamp.slice(0, 10)`.
- Exclusion reason strings are rendered verbatim by US-66 — the **en dash** `–` (U+2013)
  in band strings is load-bearing.
- No migrations, no new dependencies.

---

## Layer 1 — Foundation (no cross-area dependencies)

> These two areas touch disjoint files and can be started immediately in parallel.

### Screener Engine (pure core)

> Plan Areas 1–3 all live in `src/main/core/screener.ts` + `src/main/core/screener.test.ts`.
> They are **one area worked by one agent** in three sequential Red/Green cycles — do not
> split them across parallel agents, they would collide on the same two files.

**Cycle 1 — scoring criteria + yield math**

- [x] **[Red]** Write failing tests — `src/main/core/screener.test.ts`
  - `DEFAULT_SCREENING_CRITERIA` equals the story Background: `deltaMin '0.20'`,
    `deltaMax '0.30'`, `dteMin 30`, `dteMax 45`, `minOpenInterest 500`,
    `maxSpreadPercent '10'`, `maxSpreadAbsolute '0.10'`, `maxUnderlyingPrice null`,
    `earningsHandling 'exclude'`
  - `scoreCandidate` on the AC-1 strike (strike `180.0000`, mark `2.70`, dte 37,
    delta `-0.2800`) → `periodYield '0.0150'`, `annualizedYield '0.1480'`,
    `capitalSecured '18000.00'`, `yieldPerDelta '0.5285'` (round-once rule — **not**
    `0.5286` from a pre-rounded annualized)
  - negative put delta is absolutized: input `-0.2800` → output `delta '0.2800'`
  - AC-2 worked examples: annualized `0.3000` ÷ delta `0.30` → `'1.0000'`;
    annualized `0.2400` ÷ delta `0.20` → `'1.2000'`
  - bid `2.40` / ask `3.00` / mark `2.70` → `spreadAbsolute '0.60'`, `spreadPercent '22.22'`
  - mark is copied from the strike, never recomputed: a strike whose `mark` disagrees
    with `(bid+ask)/2` still yields on the supplied `mark`
  - Run `pnpm test src/main/core/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement scoring — `src/main/core/screener.ts` _(depends on: Engine Cycle 1 Red ✓)_
  - Types exactly per `data-model.md`: `EarningsHandling`, `ScreeningCriteria`,
    `DEFAULT_SCREENING_CRITERIA`, `TickerScreeningInput`, `ScoredCandidate`
  - `scoreCandidate(strike, ticker, dte, ivRank, criteria?)`:
    `spreadAbsolute = ask − bid` (2dp), `spreadPercent = (ask − bid) / mark × 100` (2dp),
    `capitalSecured = strike × 100` (2dp), `periodYield = mark / strike` (4dp),
    `annualizedYield = periodYield × 365 / dte` (4dp — calendar 365, never 252),
    `yieldPerDelta = annualizedYield / |delta|` (4dp)
  - carry through `openInterest`, `volume`, `ivRank`, `timestamp`, `contractId`,
    `expiration`, `bid`, `ask`, `mark`, `strike`; emit `delta` as `|delta|` at 4dp
  - Run `pnpm test src/main/core/screener.test.ts` — all tests must pass

**Cycle 2 — hard-filter registry + exclusion reasons**

- [x] **[Red]** Extend failing tests — `src/main/core/screener.test.ts` _(depends on: Engine Cycle 1 Green ✓)_
  - delta band: `|delta| 0.42` vs `0.20–0.30` → `code 'delta_band'`,
    `reason 'delta 0.42 outside 0.20–0.30'`; signed `-0.4200` gives the same message
  - delta band bounds `0.2000` / `0.3000` are **inclusive**
  - open interest `120` vs floor `500` → `code 'open_interest'`,
    `reason 'open interest 120 below 500'`; `openInterest: null` does **not** exclude,
    `openInterest: 0` does
  - spread: bid `2.40` / ask `3.00` / mark `2.70` → `code 'spread'`,
    `reason 'spread 22% exceeds 10%'` (percent 0dp)
  - spread escape hatch: bid `0.08` / ask `0.15` → **not** excluded ($0.07 absolute is
    within the $0.10 floor even at 58% of mark — both thresholds must be breached)
  - DTE window: expiration 52 days out vs `30–45` → `code 'dte_window'`,
    `reason 'DTE 52 outside 30–45'`; unparseable expiration and `dte` of `0` also fail
    `dte_window` (guards divide-by-zero in the annualized yield)
  - `delta: null` → `code 'delta_unavailable'`, `reason 'delta unavailable'`
  - price ceiling: `maxUnderlyingPrice '75'` + `underlyingPrice '412.00'` →
    `code 'price_ceiling'`, `reason 'underlying $412.00 above $75.00 ceiling'`; does not
    fire when either `maxUnderlyingPrice` or `underlyingPrice` is `null`
  - earnings: `earningsHandling 'exclude'` + `earningsDate '2026-07-31'` + expiration
    `2026-08-21` → `code 'earnings_in_window'`,
    `reason 'earnings 2026-07-31 falls before expiry'`; does not fire when earnings is
    after expiry, when handling is `'flag'`, or when `earningsDate` is `null`
  - first failure wins: a strike breaching both the delta band and the OI floor reports
    only `delta_band`
  - Run `pnpm test src/main/core/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement the registry — `src/main/core/screener.ts` _(depends on: Engine Cycle 2 Red ✓)_
  - `ExclusionCode` union + `ExcludedCandidate` per `data-model.md`
  - `FILTERS: FilterDefinition[]` — ordered array of pure `{ code, applies, test, reason }`
    objects following `core/alerts.ts`'s `RULES` shape (alert-rule-registry ADR), order:
    `price_ceiling → earnings_in_window → dte_window → delta_unavailable → delta_band →
open_interest → spread`. `applies` returning `false` means "cannot evaluate" → the
    candidate passes (never-exclude-on-missing-input ADR)
  - named reason builders (one per filter) + shared formatters: `formatDelta` (2dp),
    `formatBand` (en dash U+2013), `formatPercent` (0dp + `%`), `formatMoney` (`$` + 2dp)
  - earnings comparison via `date-fns` (`parseISO` + `isAfter`/`compareAsc`)
  - `evaluateFilters(...)` → first failing `{ code, reason, index }` or `null`
  - Run `pnpm test src/main/core/screener.test.ts` — all tests must pass

**Cycle 3 — `screenTicker` + `rankCandidates`**

- [x] **[Red]** Extend failing tests — `src/main/core/screener.test.ts` _(depends on: Engine Cycle 2 Green ✓)_
  - `screenTicker` with three surviving AAPL strikes → `best` is the highest
    `yieldPerDelta`; the other two survivors appear **nowhere** in the result
  - a high-yield strike outside the delta band lands in `excluded`, never `best`; a
    lower-yield in-band strike becomes `best` (a high score does not rescue)
  - `excluded` ordering: in-band strike failing `spread` + out-of-band strikes failing
    `delta_band` → `excluded[0].code === 'spread'` (latest filter stage first)
  - all strikes excluded → `best: null` with a non-empty `excluded`
  - `ivRank: null` flows to `best.ivRank === null` and the candidate still scores and
    ranks (no exclusion, no zero substituted)
  - `rankCandidates` sorts bests by `yieldPerDelta` desc — AC-2's B (`1.2000`) above A
    (`1.0000`); equal scores tie-break by `ticker` ascending; `best: null` tickers omitted
  - Run `pnpm test src/main/core/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement composition — `src/main/core/screener.ts` _(depends on: Engine Cycle 3 Red ✓)_
  - `TickerScreeningResult` type per `data-model.md`
  - `screenTicker(input, criteria, currentDate)`: per-strike `dte` via
    `computeDte(expiration, currentDate)`, run `evaluateFilters`, score survivors, pick
    `best` by highest `yieldPerDelta` (tie → lower `strike`), sort `excluded` by filter
    index desc then chain order
  - `rankCandidates(results)`: map non-null `best`, sort by `Decimal(yieldPerDelta)` desc
    then `ticker` asc
  - Run `pnpm test src/main/core/screener.test.ts` — all tests must pass

**Refactor (whole engine, once all three cycles are green)**

- [x] **[Refactor]** `/refactor` — `src/main/core/screener.ts` _(depends on: Engine Cycle 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Keep a single `toDecimal`/formatting seam so no field re-parses a rounded string
  - Compute the spread **once** and pass it in rather than deriving it in both
    `scoreCandidate` and the spread reason builder
  - Name one shared `yieldPerDelta` comparator instead of inlining
    `new Decimal(...).cmp(...)` in both the best-of and rank comparators
  - Keep the comment explaining the registry ordering rationale next to the `FILTERS`
    array — the order decides US-66's representative reason
  - Verify `screenTicker` stays a fold (`map`/`filter`/`reduce`, no mutation) and that no
    `logger`/DB/provider import crept in
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### IVR Read Path

- [x] **[Red]** Write failing tests — `src/main/services/ivr-snapshots.test.ts`
  - Test cases (in-memory DB, migrations applied):
    - two `ivr_snapshot` rows for AAPL with different `observed_at` → the map holds the
      **latest** row's `ivr`
    - a requested underlying with no rows is **absent** from the map (not `null`, not `'0'`)
    - lower-case input `'aapl'` resolves the stored `'AAPL'` row
    - an empty `underlyings` array returns an empty map without preparing a statement
  - Run `pnpm test src/main/services/ivr-snapshots.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/ivr-snapshots.ts` _(depends on: IVR Read Path Red ✓)_
  - `getLatestIvrByUnderlying(db, underlyings): Map<string, string>` — prepare
    `SELECT ivr FROM ivr_snapshot WHERE underlying = ? ORDER BY observed_at DESC LIMIT 1`
    once, execute per upper-cased underlying, skip misses
  - `logger.debug` with the requested tickers and hit count
  - Run `pnpm test src/main/services/ivr-snapshots.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/ivr-snapshots.ts` _(depends on: IVR Read Path Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Confirm the module stays write-free and `services/ivr-collector.ts` is untouched
    (the read/write split is a deliberate ADR)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Service orchestration (depends on Layer 1)

> Single area — everything downstream funnels through it.

### Screener Service

**Requires:** Screener Engine Cycle 3 Green ✓ · IVR Read Path Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/screener.test.ts` _(depends on: Engine Cycle 3 Green ✓, IVR Read Path Green ✓)_
  - stubbed provider + in-memory DB. Test cases:
    - calls `pullWatchlistChains` with the DTE window derived from the criteria
      (`{ min: dteMin, max: dteMax }`) and the supplied `currentDate`
    - chains `status: 'provider_unavailable'` → returns
      `{ status: 'provider_unavailable', ranked: [], excluded: [], quoteTimestamp: null }`
      and never calls `getStockQuotes` or the IVR read
    - two `ok` tickers with survivors → `ranked` in yield-per-delta order, one row per ticker
    - a ticker whose IVR row is missing still ranks, with `ivRank: null`
    - the IVR read throwing degrades to an empty map, logs at **warn**, and every
      candidate still ranks with `ivRank: null` (boundary I/O degrades to empty —
      `alert-evaluation-failure-isolation` ADR)
    - `getStockQuotes` is called **only** when `criteria.maxUnderlyingPrice !== null`;
      when it throws, degrade to an empty map + warn and the ceiling simply does not fire
    - `no_options_listed` → `excluded` row `{ code: 'no_options_listed', reason: 'no options listed' }`
    - `data_unavailable` → `{ code: 'data_unavailable', reason: 'market data unavailable' }`
    - a ticker with zero survivors contributes one `excluded` row carrying its
      representative `code`/`reason` (`excluded[0]` from the engine)
    - `screenTicker` throwing for one ticker logs at error and drops that ticker to
      `data_unavailable` while the others still rank (failure-isolation regression)
    - `quoteTimestamp` is the newest `timestamp` across `ranked`; `null` when `ranked` is empty
    - omitted `criteria` falls back to `DEFAULT_SCREENING_CRITERIA`
  - Run `pnpm test src/main/services/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/screener.ts` _(depends on: Screener Service Red ✓)_
  - export `ScreenerExclusionCode`, `ScreenerExclusion`, `ScreenerResults` per `data-model.md`
  - `screenWatchlistCandidates(provider, db, opts?)` following `data-model.md`
    orchestration steps 1–7: pull chains → short-circuit on outage → IVR join in
    `try/catch` → conditional quote fetch in `try/catch` → `earningsDate: null` (US-70
    seam) → per-ticker `screenTicker` in its **own** `try/catch` → `rankCandidates` →
    `quoteTimestamp`
  - `logger.debug` for the request (tickers, criteria) and per-ticker outcomes;
    `logger.info` once on completion with `{ status, rankedCount, excludedCount }`,
    matching `candidate-chains.ts`'s logging shape
  - Run `pnpm test src/main/services/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/screener.ts` _(depends on: Screener Service Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Make the `TickerChainResult` → `ScreenerExclusion` mapping a small named function,
    not an inline switch inside the reduce
  - Compare the degrade-to-empty helpers with `candidate-chains.ts`; share only if the
    shape is literally the same, otherwise leave both explicit
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Delivery surface (depends on Layer 2)

### `screener:results` IPC + Preload

**Requires:** Screener Service Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/screener.test.ts` _(depends on: Screener Service Green ✓)_
  - mock `ipcMain` the same way `src/main/ipc/watchlist.test.ts` does. Test cases:
    - `screener:results` is registered; invoking it returns
      `{ ok: true, status, ranked, excluded, quoteTimestamp }` from a stubbed
      `screenWatchlistCandidates`
    - the handler takes no payload and passes `getProvider()` + `db` straight through —
      one service call, no branching (thin-handler rule)
    - a service throw returns
      `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', ... }] }` and
      never rejects to the renderer, per `contracts/screener-results.md`
  - Run `pnpm test src/main/ipc/screener.test.ts` — all new tests must fail
- [x] **[Green]** Implement + wire — `src/main/ipc/screener.ts` _(depends on: IPC Red ✓)_
  - `registerScreenerIpc({ db, getProvider })` wrapping a single
    `screenWatchlistCandidates(getProvider(), db)` call in
    `handleIpcCall('screener_results_error', ...)`. No Zod request schema — the channel
    takes no payload
  - `src/main/index.ts` — register alongside `registerWatchlistIpc({ db })`, passing the
    same `getProvider` accessor `registerMarketDataHandlers` receives
  - `src/preload/index.ts` — add `screener: { results: () => invoke('screener:results') }`
  - `src/preload/index.d.ts` — add `IpcScoredCandidate`, `IpcScreenerExclusion`,
    `IpcScreenerResultsResult`, and the `screener` namespace on `Window.api`
  - Run `pnpm test src/main/ipc/screener.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/screener.ts` _(depends on: IPC Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Verify the handler file contains no business logic (Zod-parse-plus-single-call
    convention) and that the preload `.d.ts` types mirror `ScoredCandidate`
    field-for-field rather than widening to `unknown`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — AC Integration Tests (headless)

**Requires:** All Green tasks from Layers 1–3 ✓

> US-65 has no renderer surface (the table is US-66), so Playwright `_electron` does not
> apply — same rationale as US-64's Area 4. AC coverage runs the **real**
> `screenWatchlistCandidates` against an in-memory SQLite DB (migrations applied,
> `watchlist` + `ivr_snapshot` seeded per `quickstart.md`) and a scripted
> `MarketDataProvider`. Seed: `watchlist` = KO, AAPL, MSFT, TSLA, XYZ; `ivr_snapshot`
> rows for KO (`38.0`) and AAPL (`44.0`), **no row for MSFT**.

### AC Integration Tests

- [x] **[Red]** Write failing integration tests — `src/main/services/screener.integration.test.ts` _(depends on: all Green tasks ✓)_
  - Build seed helpers `seedWatchlist(db, tickers)` / `seedIvr(db, rows)` /
    `scriptChains(scenario)`; one `it()` per AC bullet, names mirroring the Gherkin
  - AC coverage:
    - AC-1: Premium yield is computed on capital secured →
      `it('premium yield is computed on capital secured')` — AAPL 37-DTE $180 put, mark
      $2.70; assert `periodYield '0.0150'`, `annualizedYield '0.1480'`,
      `capitalSecured '18000.00'`
    - AC-2: Rank is annualized yield per unit of delta →
      `it('rank is annualized yield per unit of delta')` — candidate A 0.30Δ / 30.0% ann.,
      candidate B 0.20Δ / 24.0% ann. on two tickers; assert B precedes A in `ranked` and
      scores are `'1.2000'` / `'1.0000'`
    - AC-3: Exclude a strike outside the delta band →
      `it('a strike outside the delta band is excluded')` — AMD 0.42Δ with a fat yield;
      absent from `ranked`, present in `excluded` with `'delta 0.42 outside 0.20–0.30'`
    - AC-4: Exclude an illiquid strike → `it('an illiquid strike is excluded')` — OI 120
      vs the 500 floor; reason `'open interest 120 below 500'`
    - AC-5: Exclude a wide-spread strike → `it('a wide-spread strike is excluded')` —
      bid 2.40 / ask 3.00 / mark 2.70; reason `'spread 22% exceeds 10%'`
    - AC-6: Narrow absolute spread not excluded →
      `it('a narrow absolute spread on a cheap option is not excluded')` — bid 0.08 /
      ask 0.15; the ticker appears in `ranked` with no `spread` exclusion
    - AC-7: Missing IV rank does not exclude →
      `it('missing IV rank does not exclude a candidate')` — seed IVR for KO and AAPL but
      **not** MSFT; MSFT is in `ranked` with `ivRank: null` and an unaffected `yieldPerDelta`
    - AC-8: Best strike per ticker is selected →
      `it('the best strike per ticker is selected')` — AAPL with three surviving strikes;
      exactly one AAPL row in `ranked`, the highest-scoring survivor
  - Run `pnpm test src/main/services/screener.integration.test.ts` — all new tests must fail
- [x] **[Green]** Make integration tests pass _(depends on: AC Integration Red ✓)_
  - No new production code beyond Layers 1–3; build the seeding/scripting harness and fix
    whatever full-scenario runs surface
  - Run `pnpm test src/main/services/screener.integration.test.ts` — all tests must pass
- [x] **[Refactor]** `/refactor` integration tests _(depends on: AC Integration Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Factor a `chainStrike({ strike, bid, ask, delta, oi, expiration })` builder so each
    test states only the fields its AC is about; first check whether
    `candidate-chains.integration.test.ts` already has a compatible builder to reuse
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## AC Audit

| #   | Acceptance criterion (from US-65)                        | Covered by                                                     |
| --- | -------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Premium yield is computed on capital secured             | `'premium yield is computed on capital secured'`               |
| 2   | Rank is annualized yield per unit of delta               | `'rank is annualized yield per unit of delta'`                 |
| 3   | Exclude a strike outside the delta band                  | `'a strike outside the delta band is excluded'`                |
| 4   | Exclude an illiquid strike                               | `'an illiquid strike is excluded'`                             |
| 5   | Exclude a wide-spread strike                             | `'a wide-spread strike is excluded'`                           |
| 6   | Narrow absolute spread on a cheap option is not excluded | `'a narrow absolute spread on a cheap option is not excluded'` |
| 7   | Missing IV rank does not exclude a candidate             | `'missing IV rank does not exclude a candidate'`               |
| 8   | Best strike per ticker is selected                       | `'the best strike per ticker is selected'`                     |

All eight ACs map to exactly one named integration test. No uncovered ACs.

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason — Layer 4's
      passed on arrival by design, and was instead proven non-vacuous by mutation probes)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] Integration tests cover every AC (8/8)
- [x] `src/main/core/screener.ts` has no DB / provider / `logger` imports
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] `/update-spec us-65` run so the work lands in `docs/spec/` before the plan docs age out
