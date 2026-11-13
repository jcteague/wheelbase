# US-110 — Add PMCC screening criteria to the candidate screener — Tasks

Plan: `plans/us-110/plan.md` (re-verified against `main` 2026-11-11 — read its "Revision 2026-11-11" section first). Supporting: `research.md`, `data-model.md`, `contracts/screener-pmcc.md`, `quickstart.md`. Mockups: `mockups/us-110-pmcc-screening-bench.mdx`, `mockups/us-110-pmcc-criteria-sheet.mdx`.

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- `pnpm rebuild:node` before Vitest; `pnpm rebuild:electron` before `pnpm test:e2e` (see quickstart)

---

## Layer 1 — Pure foundations and the chain pull (no dependencies)

> These areas can be started immediately and run in parallel.

### Area 1 — Shared bounds and messages for the PMCC criteria

- [x] **[Red]** Write failing tests — `src/main/core/screening-criteria.test.ts`, `src/main/core/screening-criteria.property.test.ts` (new)
  - Test cases:
    - `isLongDteInRange` accepts `180`, `'540'`, `730`; rejects `0`, `731`, `'180.5'`, `' 180'`
    - `isDebitToWidthInRange` accepts `'1'`, `'90'`, `'100'`; rejects `'0'`, `'100.01'`, `''`, `'9e1'`
    - `isIvRankCeilingInRange` matches `isIvRankFloorInRange` on `'0'`, `'100'`, `'100.1'`, `'-1'`
    - The five message constants equal exactly: `LEAPS DTE must be at most 730`, `Max debit / width must be between 1% and 100%`, `IV rank ceiling must be between 0 and 100`, `IV-rank floor must be less than IV-rank ceiling`, `LEAPS minimum DTE must exceed short-call maximum DTE`
  - Property cases — `screening-criteria.property.test.ts`:
    - bound/oracle: for every integer `n` in `-100..1000`, `isLongDteInRange(n) === (n >= 1 && n <= 730)`, compared against the literal bounds, not `LONG_DTE_MAX`
    - bound/oracle: for every 2-dp string in `0.00..150.00`, `isDebitToWidthInRange(s) === (1 <= Number(s) && Number(s) <= 100)`
    - invariant: `isIvRankCeilingInRange` and `isIvRankFloorInRange` agree on every generated string
  - Run `pnpm test src/main/core/screening-criteria` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/screening-criteria.ts` _(depends on: Area 1 Red ✓)_
  - `LONG_DTE_MAX = 730`, `DEBIT_TO_WIDTH_MIN/MAX`, the five messages as template literals beside the existing ones
  - `isLongDteInRange` (requires `Number.isInteger`), `isDebitToWidthInRange`, `isIvRankCeilingInRange` built on the existing `parseNumeric`; zero imports stays zero imports
  - Run `pnpm test src/main/core/screening-criteria` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/screening-criteria.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: a private `isWholeNumberInRange(value, min, max)` shared by `isDteInRange` / `isLongDteInRange`, only if it reads better
  - `pnpm test:mutation --mutate src/main/core/screening-criteria.ts` — kill survivors with tests
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 2 — The PMCC screening engine

- [x] **[Red]** Write failing tests — `src/main/core/pmcc-screener.test.ts` (new), `src/main/core/pmcc-screener.property.test.ts` (new)
  - Test cases (fixtures from the data-model table; valuation date Fri 2026-09-18 injected):
    - `scorePmccPair` XLF `$42C 10.30 Δ0.81` / `$53C 0.64 Δ0.29`, dte 35, price `51.20` → `netDebit '9.66'`, `capitalAtRisk '966.00'`, `strikeWidth '11.00'`, `debitToWidthPercent '87.82'`, `cycleYield '0.0663'`, `annualizedYield '0.6909'`, `returnPerDelta '2.3825'`, `longExtrinsic '1.10'`, `extrinsicCoverage '0.5818'`
    - `scorePmccPair` with `underlyingPrice: null` → `longExtrinsic null`, `extrinsicCoverage null`, every other field identical
    - `scorePmccPair` with `price − long.strike > long.mark` → `longExtrinsic '0.00'`, `extrinsicCoverage null`
    - `screenPmccTicker` AMD → `best null`, `excluded[0]` = `{ stage: 'pair', code: 'debit_to_width', reason: 'debit 93.84% of width exceeds 90%' }`
    - LEAPS delta `0.62` → `stage: 'long'`, reason `LEAPS delta 0.62 outside 0.70–0.85` (en dash)
    - short OI `120`, `minOpenInterest 200` → `short call open interest 120 below 200`
    - short `$40` vs LEAPS `$42` → `short_strike_not_above_long`, `short strike $40.00 not above LEAPS strike $42.00`
    - `maxIvRank '55'`, `ivRank { value: '58', observedAt: '2026-09-17T20:00:00Z' }` → single row `{ stage: 'ticker', code: 'iv_rank_ceiling', reason: 'IV rank 58 (Sep 17) above 55' }`, nothing leg-level evaluated
    - `maxIvRank '55'`, `ivRank null` → not excluded on IV
    - `minIvRank '50'`, `maxIvRank '55'`, value `'55'` → passes (inclusive both ends)
    - earnings inside the short window + `exclude` → `stage: 'short'`, `earnings_in_window`; same date after the short expiry but inside the LEAPS life → not excluded
    - earnings inside the window + `flag` → `best.earnings.status === 'flagged'` with `daysBeforeExpiry`
    - best-pair choice: highest `returnPerDelta`; on an exact tie the lower `debitToWidthPercent`, then the lower LEAPS strike
    - `rankPmccCandidates([KO, XLF, AAPL])` → `[XLF, AAPL, KO]`; a `flagged` candidate sorts after every `clear` one
    - module purity: no import from `services/`, `integrations/`, `../logger`, `better-sqlite3`
  - Property cases — `pmcc-screener.property.test.ts` (generators from `test-fixtures/arbitraries.ts` + local `callStrike` on `positiveMoney`):
    - oracle: `netDebit`, `strikeWidth`, `debitToWidthPercent` equal an independent `Decimal` computation rounded half-up to 2 dp
    - guard: every `best` has `short.strike > long.strike`, both deltas in band, both DTEs in window, `debitToWidthPercent ≤ maxDebitToWidthPercent`
    - invariant (extrinsic display-only): `underlyingPrice: null` vs any generated price → same `best` pair and same `excluded` codes
    - order independence: shuffling `longCalls` / `shortCalls` leaves `best` unchanged; shuffling `rankPmccCandidates` input leaves its output order unchanged
    - bound: non-null `longExtrinsic ≥ 0`; non-null `extrinsicCoverage > 0`
  - Run `pnpm test src/main/core/pmcc-screener` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/pmcc-screener.ts` (new), `src/main/core/screener.ts` _(depends on: Area 2 Red ✓)_
  - `core/screener.ts`: export `EN_DASH`, `formatBand`, `formatPercent`, `formatMoney`, `formatObservedOn` and the earnings-window predicate — no behaviour change
  - Types per data-model: `PmccScreeningCriteria`, `DEFAULT_PMCC_SCREENING_CRITERIA`, `PmccTickerScreeningInput`, `PmccLeg`, `PmccScoredCandidate`, `PmccExclusionCode`, `PmccExcludedCandidate`, `PmccTickerScreeningResult`
  - `TICKER_FILTERS`, `LEG_FILTERS` (role-parameterised, reasons prefixed `LEAPS ` / `short call `), `PAIR_FILTERS` — each `{ code, applies, test, reason }`; generic `evaluateStage(filters, ctx, criteria)`
  - `short_strike_not_above_long` test is `shortStrikeAboveLeaps` from `core/pmcc-rules.ts`
  - `scorePmccPair`: one unrounded `Decimal` chain; `fixed4` (from `src/shared/decimal-text.ts`) for 4-dp fractions, 2-dp half-up for money/percent; `toFiniteDecimal` for quote strings; LEAPS extrinsic = `mark − max(0, price − strike)` clamped at 0 (same formula as `shortExtrinsic` in `core/pmcc-card.ts`)
  - `screenPmccTicker`: ticker stage → leg stage (`computeDte`) → longs × shorts → pair stage → score → sort `earningsTier`, `returnPerDelta` desc, `debitToWidthPercent` asc, `long.strike` asc; `excluded` deepest stage first
  - `rankPmccCandidates`: `earningsTier`, `returnPerDelta` desc, `ticker.localeCompare`
  - Run `pnpm test src/main/core/pmcc-screener src/main/core/screener` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/pmcc-screener.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: `evaluateFilters` in `screener.ts` delegating to `evaluateStage` (only as a pure extraction with `screener.test.ts` unchanged); keep `PmccFilter<C>` local; rename `shortExtrinsic` → `legExtrinsic` if both call sites read the same
  - `pnpm test:mutation --mutate src/main/core/pmcc-screener.ts` — kill survivors with tests
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — Chain pull takes a contract type

- [x] **[Red]** Write failing tests — `src/main/services/candidate-chains.integration.test.ts`
  - Test cases:
    - `pullWatchlistChains(provider, db, { type: 'call', window: { min: 180, max: 540 } })` calls the provider with `type: 'call'` and range `today+180 .. today+540`; omitting `type` still sends `'put'`
    - against the fake provider holding a 35-DTE and a 490-DTE call for one ticker: the `180–540` call pull returns only the 490-DTE strike; the `20–45` pull only the 35-DTE one
  - Run `pnpm test src/main/services/candidate-chains` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/candidate-chains.ts` _(depends on: Area 4 Red ✓)_
  - `PullOptions.type?: 'put' | 'call'` (default `'put'`), threaded into `getOptionChainSnapshot`; `no_options_listed` debug log includes the type
  - No change to `fake-market-data.ts` — `expirationTo` is already at line 272
  - Run `pnpm test src/main/services/candidate-chains` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/candidate-chains.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Criteria persistence (depends on Layer 1)

### Area 3 — PMCC criteria persistence and payload schema

**Requires:** Area 1 Green ✓ (bounds + messages), Area 2 Green ✓ (`PmccScreeningCriteria`, `DEFAULT_PMCC_SCREENING_CRITERIA`)

- [x] **[Red]** Write failing tests — `src/main/services/pmcc-screening-criteria.test.ts` (new), `src/main/schemas.test.ts` _(depends on: Area 1 Green ✓, Area 2 Green ✓)_
  - Test cases:
    - empty `app_settings` → `DEFAULT_PMCC_SCREENING_CRITERIA` (deep equality)
    - stored document missing `maxIvRank` → `maxIvRank: null`, other stored values intact
    - unparseable JSON → whole defaults; `longDteMin 40` + `shortDteMax 45` → whole defaults; `minIvRank '60'` + `maxIvRank '40'` → whole defaults; `longDeltaMin '0.85'` + `longDeltaMax '0.70'` → whole defaults
    - save defaults minus `maxSpreadAbsolute` → returns full document incl. `maxSpreadAbsolute: '0.10'`; subsequent `get` matches
    - save `longDteMin 40` → `ValidationError` `{ field: 'longDteMin', code: 'overlapping_windows', message: 'LEAPS minimum DTE must exceed short-call maximum DTE' }` **and** the prior document is still stored
    - `longDteMax 800` → `field 'longDteMax'`, `code 'out_of_range'`, `LEAPS DTE must be at most 730`; `maxDebitToWidthPercent '0'` → `Max debit / width must be between 1% and 100%`; `minIvRank '60'` + `maxIvRank '40'` → `field 'maxIvRank'`, `code 'inverted_band'`
    - a wheel `saveScreeningCriteria` leaves `pmcc_screening_criteria` untouched, and vice versa
    - `SavePmccScreeningCriteriaPayloadSchema` rejects `maxIvRank: '120'` with `IV rank ceiling must be between 0 and 100`; accepts both IV fields `null`; extra-key strictness mirrors the wheel schema
  - Run `pnpm test src/main/services/pmcc-screening-criteria src/main/schemas` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/pmcc-screening-criteria.ts` (new), `src/main/schemas.ts` _(depends on: Area 3 Red ✓)_
  - `PMCC_SCREENING_CRITERIA_KEY = 'pmcc_screening_criteria'`, `StoredPmccScreeningCriteriaSchema` (every field `.default()`ed), `SavePmccScreeningCriteriaInput = Omit<PmccScreeningCriteria, 'maxSpreadAbsolute'>`, `getPmccScreeningCriteria(db)`, `savePmccScreeningCriteria(db, input)`, private `assertValid`
  - US-67 shape: wholesale fallback on parse failure or any failed cross-field check; per-field bounds first, then the six cross-field rules in data-model order; single `appSettings.set` after validation
  - `SavePmccScreeningCriteriaPayloadSchema` verbatim from `contracts/screener-pmcc.md`; confirm or widen `ValidationError` code type for `overlapping_windows`
  - INFO `PMCC criteria saved` / `PMCC criteria rejected`
  - Run `pnpm test src/main/services/pmcc-screening-criteria src/main/schemas` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/pmcc-screening-criteria.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: a `readSettingsDocument(db, key, schema, defaults, isConsistent)` helper re-pointing US-67's file, only if it falls out naturally
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — The PMCC screener service (depends on Layers 1–2)

### Area 5 — The PMCC screener service

**Requires:** Area 2 Green ✓, Area 3 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/pmcc-screener.integration.test.ts` (new) _(depends on: Areas 2, 3, 4 Green ✓)_
  - Test cases (fake provider + in-memory DB, OCC call-symbol fixtures from data-model):
    - default criteria, nine-stock bench → `status 'ok'`, engine order `['XLF','AAPL','PEP','DIS','KO']`, `excluded` exactly `AMD`, `MSFT`, `ORCL`, `XYZ` with the data-model reasons
    - every watchlist ticker in exactly one of `ranked` / `excluded`
    - provider called twice per ticker with `type: 'call'` (once per window), never `'put'`
    - XYZ short-only → `{ code: 'no_options_listed', reason: 'no calls quoted in the 180–540 DTE window' }`; long-only → `no calls quoted in the 20–45 DTE window`
    - XLF stock quote throws → XLF still first, `returnPerDelta '2.3825'`, `longExtrinsic null`
    - stock quotes fetched without a price ceiling
    - either window pull `provider_unavailable` → results `provider_unavailable`, empty lists, null timestamp; `getProvider` throws → `provider_unavailable`
    - a stale/expired/predates-earnings IVR reaches `ranked[i].ivRank` with its `state` but the ceiling is not applied to a stale `58`
    - no IV history → `ivRank: null`, `ivRankAbsence: { reason: 'not_collected' }`; `runState` reporting `pending` → `ivRankAbsence: { reason: 'pending' }`
    - `runState` is forwarded to `readIvRankLookup` as the same object
    - `quoteTimestamp` = newest ranked leg timestamp
    - `opts.criteria` overrides the persisted document; absent, `getPmccScreeningCriteria(db)` is read
  - Run `pnpm test src/main/services/pmcc-screener` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/pmcc-screener.ts` (new), `src/main/services/screener.ts` _(depends on: Area 5 Red ✓)_
  - `PmccScreenOptions = { criteria?; currentDate?; runState: IvRunState }`; `RankedPmccCandidate = Omit<PmccScoredCandidate, 'ivRank'> & IvRankPair`; `PmccScreenerResults`
  - `screenWatchlistPmccCandidates(getProvider, db, opts)`: provider in try/catch → `Promise.all` of [both call-window pulls sequentially, `fetchIsolatedStockQuotes`, `readEarningsOrEmpty`, `ensureTradingCalendar`] → `readIvRanks(..., opts.runState)` → `usableIvRanks` into the engine → per-ticker `screenPmccTicker` in its own try/catch (`data_unavailable`) → `rankPmccCandidates` → `{ ...candidate, ...lookupOf(ivRankLookups, ticker) }` → `representativeExclusion` → `quoteTimestamp`
  - Widen `ScreenerExclusionCode` (or a PMCC union at the IPC type), whichever leaves `screener.ts` tests untouched
  - INFO `PMCC screen completed` with counts; DEBUG criteria in use, per-ticker chain sizes, each verdict
  - Run `pnpm test src/main/services/pmcc-screener src/main/services/screener` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/services/pmcc-screener.ts`, `src/main/services/screener.ts` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: move `readIvRanks`, `usableIvRanks`, `dataUnavailable`, `newestTimestamp`, `representativeExclusion` into `services/screener-shared.ts`; wheel service tests are the regression net
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — IPC and preload (depends on Layer 3)

### Area 6 — IPC handlers and preload

**Requires:** Area 3 Green ✓, Area 5 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/screener.test.ts` _(depends on: Areas 3, 5 Green ✓)_
  - Test cases:
    - `screener:pmcc-results` → `{ ok: true, status, ranked, excluded, quoteTimestamp }`; service throws → `{ ok: false, errors: [{ field: '__root__', code: 'internal_error' }] }`
    - `screener:pmcc-results` passes the registered `runState` (`toBe(RUN_STATE)`) and the injected `getCurrentDate()`
    - `screener:get-pmcc-criteria` → `{ ok: true, criteria }`
    - `screener:save-pmcc-criteria` valid → stored document; `maxIvRank: '120'` → `ok: false`, `field 'maxIvRank'` + ceiling message; overlapping window → `field 'longDteMin'`, `code 'overlapping_windows'`
    - existing wheel-channel tests untouched and green
  - Run `pnpm test src/main/ipc/screener` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/screener.ts`, `src/preload/index.ts`, `src/preload/index.d.ts` _(depends on: Area 6 Red ✓)_
  - Three thin `handleIpcCall` handlers mirroring the wheel ones; `registerScreenerIpc` already has `runState`, `src/main/index.ts` unchanged
  - Preload: `pmccResults`, `getPmccCriteria`, `savePmccCriteria`; types `IpcPmccLeg`, `IpcPmccScoredCandidate = { … } & IpcIvRankPair`, `IpcPmccScreenerResultsResult`, `IpcPmccScreeningCriteria`, `IpcPmccScreeningCriteriaResult`; widen `IpcScreenerExclusion.code`
  - Run `pnpm test src/main/ipc/screener` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/ipc/screener.ts`, `src/preload/index.d.ts` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Renderer data layer (depends on Layer 4)

### Area 7 — Adapters, hooks, formatters, generic bench

**Requires:** Area 6 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/bench.test.ts`, `src/renderer/src/lib/screener-format.test.ts`, `src/renderer/src/hooks/usePmccScreeningCriteria.test.ts` (new), `src/renderer/src/api/pmcc-screener.test.ts` (new) _(depends on: Area 6 Green ✓)_
  - Test cases:
    - `buildBench` over PMCC candidates: ranked + gates pass → `meets` with `rank`; ranked + blocking price gate → `waiting` with gate label and `candidate` attached; excluded → `waiting` with verbatim reason; `provider_unavailable` → every stock `Data unavailable · not evaluated`; put tests unchanged
    - `fmtPmccCriteriaSummary(DEFAULTS)` → exactly `LEAPS Δ 0.70–0.85`, `LEAPS 180–540 DTE`, `Short Δ 0.25–0.35`, `Short 20–45 DTE`, `Debit ≤ 90% width`, `OI ≥ 200`, `Spread ≤ 10%`, `Earnings Exclude`; with `minIvRank '30'`, `maxIvRank '55'` → `IVR ≥ 30`, `IVR ≤ 55` between Spread and Earnings
    - `fmtRatioPercent('87.82')` → `87.82%`, `('87.50')` → `87.5%`; `fmtDiagonalLine(XLF)` → `$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit`
    - PMCC save invalidates `pmccCriteria` and `pmccResults`, **not** `criteria` / `results`
    - `getPmccScreenerResults`: `provider_unavailable` resolves normally; `ok: false` throws `ApiError`
  - Run `pnpm test src/renderer/src/lib src/renderer/src/hooks src/renderer/src/api` — all new tests must fail
- [x] **[Green]** Implement — renderer data layer _(depends on: Area 7 Red ✓)_
  - `api/pmcc-screener.ts` (`PmccScreenerCandidate = { … } & IvRankPair`, `getPmccScreenerResults`), `api/pmcc-screening-criteria.ts`, widen `ScreenerExclusion['code']` in `api/screener.ts`
  - `hooks/screenerQueryKeys.ts` (`pmccResults`, `pmccCriteria`), `usePmccScreenerResults` (`enabled`, no `refetchInterval`), `usePmccScreeningCriteria` / `useSavePmccScreeningCriteria`; `useScreenerResults` / `useScreeningCriteria` accept `{ enabled }` (default `true`)
  - `lib/bench-strategy.ts` (`BenchStrategy`, `BENCH_STRATEGY_LABEL`); `lib/bench.ts` generic `buildBench<C extends BenchCandidate>`, body unchanged
  - `lib/screener-format.ts`: `fmtRatioPercent`, `fmtPmccCriteriaSummary`, `fmtDiagonalLine`; `lib/promote.ts` untouched
  - Run `pnpm test src/renderer/src/lib src/renderer/src/hooks src/renderer/src/api` — all tests must pass
- [x] **[Refactor]** `/refactor` — renderer data layer _(depends on: Area 7 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: shared chip builders so `fmtCriteriaSummary` and `fmtPmccCriteriaSummary` cannot drift in glyphs
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Criteria sheet in PMCC mode (depends on Layer 5)

### Area 8 — Criteria sheet in PMCC mode

**Requires:** Area 7 Green ✓. Follow `mockups/us-110-pmcc-criteria-sheet.mdx` (default, invalid, IV band on, saved).

- [x] **[Red]** Write failing tests — `src/renderer/src/schemas/pmcc-screening-criteria.test.ts` (new), `src/renderer/src/components/PmccScreeningCriteriaForm.test.tsx` (new), `src/renderer/src/components/ScreeningCriteriaSheet.test.tsx` _(depends on: Area 7 Green ✓)_
  - Test cases:
    - schema: defaults parse; `longDteMin '40'` → overlap message on `longDteMin` only when both windows are individually in range; `longDteMax '800'` → `LEAPS DTE must be at most 730`; `maxDebitToWidthPercent '0'` → ratio message; floor `'60'` + ceiling `'40'`, both on → IV-band message on `maxIvRank`; `'30'`/`'55'` valid; ceiling off ignores typed value; `toPayload` maps off → `null`; `toFormValues(DEFAULTS)` round-trips to `DEFAULTS` minus `maxSpreadAbsolute`
    - form: six group labels in order; inputs pre-filled; overlapping LEAPS min shows the inline message, disables **Save & re-screen**, footer reads **Fix the highlighted fields.**; save calls `onSaved` then `onClose`; subtitle `Applies to all 9 watchlist tickers · PMCC · LEAPS + short call`
    - sheet: `strategy 'PMCC'` renders the PMCC form, `'WHEEL'` the wheel form, both at width 460
    - `ScreeningCriteriaForm.test.tsx` stays green after the extraction (regression net)
  - Run `pnpm test src/renderer/src/schemas src/renderer/src/components/PmccScreeningCriteriaForm src/renderer/src/components/ScreeningCriteria` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/criteria-fields.tsx` (new), `ScreeningCriteriaForm.tsx`, `src/renderer/src/schemas/pmcc-screening-criteria.ts` (new), `PmccScreeningCriteriaForm.tsx` (new), `ScreeningCriteriaSheet.tsx` _(depends on: Area 8 Red ✓)_
  - Move `SheetGroup`, `SheetField`, `Segment`, `NumericInput`, `RangeField`, `OptionalNumericField`, `Divider` verbatim into `criteria-fields.tsx`; `ScreeningCriteriaForm` imports them, no other change
  - Form schema, `PMCC_SCREENING_CRITERIA_FIELDS`, `isPmccScreeningCriteriaField`, ordered `RULES`, `toFormValues`, `toPayload` per data-model "Form model"
  - `PmccScreeningCriteriaForm`: RHF + `zodResolver`, `mode: 'onChange'`; groups LEAPS (long call) / Short call / Spread efficiency / Liquidity (per leg) / IV environment (optional) / Policy with the captions in plan.md area 8; header eyebrow `Screener`, title `Screening Criteria`; **Reset to defaults** from `DEFAULT_PMCC_SCREENING_CRITERIA`
  - `ScreeningCriteriaSheet` takes `strategy: BenchStrategy` + `pmccCriteria`, same 460px `SheetPanel`
  - Tailwind + `wb-*` tokens only
  - Run the Red command — all tests must pass
- [x] **[Refactor]** `/refactor` — criteria sheet components _(depends on: Area 8 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: lift `CriteriaSheetFooter` and `bindCriteriaFieldErrors(setError, isField)` into `criteria-fields.tsx` if both forms stay under 200 lines
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — The bench in PMCC mode (depends on Layer 6)

### Area 9 — The bench in PMCC mode

**Requires:** Area 7 Green ✓, Area 8 Green ✓ (`Segment` in `criteria-fields.tsx`, `ScreeningCriteriaSheet` strategy prop). Follow `mockups/us-110-pmcc-screening-bench.mdx`.

- [x] **[Red]** Write failing tests — `StrategyToggle.test.tsx` (new), `BenchHeader.test.tsx`, `BenchCard.test.tsx`, `MatchingDiagonalCard.test.tsx` (new), `BenchDetail.test.tsx`, `BenchGrid.test.tsx` in `src/renderer/src/components/`; `src/renderer/src/pages/WatchlistPage.test.tsx` _(depends on: Area 8 Green ✓)_
  - Test cases:
    - toggle renders both options with `aria-pressed`; click raises `onChange('PMCC')`
    - header: toggle inside the left group; strip label `PMCC criteria` when told
    - card: PMCC `meets` → `#1`, `title '2.38'`, contract line `$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit`; `waiting` shows the reason; wheel case unchanged
    - diagonal card: XLF fixture renders every data-model metric string; `longExtrinsic null` → `—` in both extrinsic cells; no `Review trade`
    - detail: PMCC meets → `bench-detail-diagonal` present, `bench-detail-put` absent; PMCC waiting with candidate → held-back copy `A qualifying diagonal exists ($140.00 LEAPS · $190.00 short · Oct 23, 2026 · 5.64% on debit) but is held back by the entry conditions above.`
    - grid: PMCC, screened, empty meets → `screener-empty` with `No diagonals match your PMCC criteria`
    - page: default lens Wheel and only wheel queries fetch; PMCC fetches `pmcc-results` + `get-pmcc-criteria`, swaps chips and sections; PMCC save shows `Screening criteria saved` and refetches only PMCC results; back to Wheel shows wheel chips unchanged
  - Run `pnpm test src/renderer/src/components src/renderer/src/pages/WatchlistPage` — all new tests must fail
- [x] **[Green]** Implement — `StrategyToggle.tsx` (new), `BenchHeader.tsx`, `ScreenerCriteriaStrip.tsx`, `BenchCard.tsx`, `MatchingDiagonalCard.tsx` (new), `BenchDetail.tsx`, `BenchGrid.tsx`, `pages/WatchlistPage.tsx` _(depends on: Area 9 Red ✓)_
  - `StrategyToggle`: `Segment` pill, `bench-strategy-wheel` / `bench-strategy-pmcc`, `role="group" aria-label="Screening strategy" data-testid="bench-strategy"`
  - `BenchHeader` / `ScreenerCriteriaStrip` take `chips: string[]` + `label`; `BenchCard` generic with `describeMatch` and `score` props
  - `MatchingDiagonalCard` per mockup: `Matching diagonal · best score for this stock`; `bench-leg-long` (sky `LEAPS · BUY` tag) and `bench-leg-short` (violet `SHORT · SELL` tag) rows; 3×3 `bench-diagonal-metrics` dl; caption from plan.md area 9; no Review trade button
  - `BenchDetail` chooses put vs diagonal card; `BenchGrid` PMCC empty copy; `onReview` wheel-only
  - `WatchlistPage`: `strategy` state default `'WHEEL'`, not persisted; both hook pairs mounted with `enabled: strategy === …`; footer "a qualifying contract"
  - Tints: LEAPS `bg-wb-sky/10 text-wb-sky border-wb-sky/30`, short `bg-wb-violet-dim text-wb-violet border-wb-violet/30`; Tailwind only
  - Run the Red command — all tests must pass
- [x] **[Refactor]** `/refactor` — bench components and page _(depends on: Area 9 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: collapse `describeMatch` / `score` into one `matchSummary` prop; keep every touched component under 200 lines (`BenchDetail.tsx` at risk — extract `BenchDetailHeader` if needed)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 8 — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### Area 10 — E2E Tests

Fixtures are anchored to `BASE_DAY` (most recent real weekday). Every DTE is fixed by offset (35 / 364 / 490), so money, percent and score literals are asserted verbatim; dates use `shortLabel(35)`, `longLabel(35)`, `longLabel(490)`, `ivrAnchorLabel()`. Background = `BENCH_CONDITIONS`, `BENCH_IVR`, `BENCH_QUOTES`, `BENCH_EARNINGS` + `BENCH_DIAGONALS`, `DEFAULT_FAKE_NOW`, LIVE.

- [x] **[Red]** Write failing e2e tests — `e2e/pmcc-screener.spec.ts` (new), `e2e/pmcc-screener-helpers.ts` (new), `e2e/screener-helpers.ts` _(depends on: all Green tasks ✓)_
  - Helpers: `CallFixtureSpec`, `occCallSymbol`, `buildCallFixtures` (via `screenerDate`), `BENCH_DIAGONALS`, the four label helpers, `selectStrategy`, `detailDiagonalMetrics`, `legRow`, `setPmccCriteriaValues`, `pmccCriteriaChips`; `ScreenerLaunchOpts.callFixtures` merged into `WHEELBASE_MOCK_OPTION_SNAPSHOTS`
  - One `it()` per AC — test names mirror AC language:
    - AC-1: Switch the bench to the PMCC lens → `it('Switch the bench to the PMCC lens')` — strip `PMCC criteria` + the eight default chips; meets `['XLF', 'KO']`; no card contains ` put ·`; PMCC pressed
    - AC-2: A diagonal is ranked by annualized cycle yield per unit of short delta → `it('A diagonal is ranked by annualized cycle yield per unit of short delta')` — XLF `#1` title `2.38`, KO `#2` title `2.06`; XLF line `` `$42.00 LEAPS · $53.00 short ${shortLabel(35)} · 6.63% on debit` ``
    - AC-3: The detail panel shows both legs and the spread metrics → `it('The detail panel shows both legs and the spread metrics')` — leg rows with `longLabel(490) · 490 DTE` / `longLabel(35) · 35 DTE`, deltas, `2,140`; metrics `$9.66`, `$966.00`, `$11.00`, `87.82%`, `6.63%`, `69.09%/yr`, `$1.10`, `58.18%`, `0.29`; no `bench-review-XLF`
    - AC-4: An excluded diagonal names the stage that refused it → `it('An excluded diagonal names the stage that refused it')` — AMD `debit 93.84% of width exceeds 90%`; XYZ `no calls quoted in the 180–540 DTE window`
    - AC-5: Entry conditions gate a PMCC match exactly as they gate a put → `it('Entry conditions gate a PMCC match exactly as they gate a put')` — AAPL waiting `Price $178.40 above $170 target`; held-back copy with `longLabel(35)` and `5.64% on debit`
    - AC-6: Extrinsic is display-only → `it('Extrinsic is display-only')` — `stockQuotes` = `BENCH_QUOTES` minus XLF; XLF `#1` title `2.38`; both extrinsic cells `—`
    - AC-7: Edit PMCC criteria and re-screen → `it('Edit PMCC criteria and re-screen')` — subtitle contains `PMCC · LEAPS + short call`; set 85; `Screening criteria saved`; chip `Debit ≤ 85% width`; meets `['KO']`; XLF `debit 87.82% of width exceeds 85%`
    - AC-8: The wheel criteria are untouched by a PMCC save → `it('The wheel criteria are untouched by a PMCC save')` — wheel chips `['Δ 0.20–0.30', 'DTE 30–45', 'OI ≥ 500', 'Spread ≤ 10%', 'Earnings Exclude']`; wheel meets equal the US-96 result
    - AC-9: Saved PMCC criteria survive a restart, the lens does not → `it('Saved PMCC criteria survive a restart, the lens does not')` — `relaunchScreener`; Wheel pressed; PMCC shows `Debit ≤ 85% width`
    - AC-10: An IV-rank ceiling excludes a rich underlying → `it('An IV-rank ceiling excludes a rich underlying')` — ceiling on at 55; KO `` `IV rank 58 (${ivrAnchorLabel()}) above 55` ``; XLF still `#1`
    - AC-11: Reject an overlapping or inverted PMCC window → `it('Reject an overlapping or inverted PMCC window')` — five outline rows (LEAPS min DTE 40; LEAPS max DTE 800; debit/width 0; IV floor 60 / ceiling 40; short delta 0.35–0.25): inline message, save disabled, `Fix the highlighted fields.`, chips unchanged after dismiss
    - AC-12: A provider outage degrades the PMCC lens like the wheel → `it('A provider outage degrades the PMCC lens like the wheel')` — `marketDataError`; waiting-for-market-data `AlertBox`; every reason `Data unavailable · not evaluated`; meets `[]`
  - Run `pnpm test:e2e -- e2e/pmcc-screener.spec.ts` — all new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Calibrate fixtures so the real engine emits the exact strings; falsify each assertion once against a flipped expectation
  - Confirm unmodified suites pass: `watchlist-bench`, `screening-criteria`, `screener-results`, `promote-to-trade`, `screener-earnings`, `ivr-staleness`, `ivr-watchlist-collection`, `iv-history`
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: share the OCC symbol builder between put and call fixture helpers

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for right reason)
- [x] Core-engine areas have property tests, or a stated "no property" reason (Areas 1, 2)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] Mutation runs on `pmcc-screener.ts` and `screening-criteria.ts` — survivors killed or recorded as equivalent
- [x] E2E tests cover every AC (12 of 12)
- [x] `pnpm test && pnpm lint && pnpm typecheck` — all clean
- [ ] `/update-spec us-110`
