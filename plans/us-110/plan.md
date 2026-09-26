---
story: us-110
kind: feature
parent: null
topics: [screener, pmcc, watchlist, criteria, market-data]
status: planned
---

# Implementation Plan: US-110 — Add PMCC screening criteria to the candidate screener

## Summary

Give the Watchlist bench a second lens. A `Wheel | PMCC` control in the header switches the screen from "best put per ticker" to "best LEAPS + short-call diagonal per ticker", driven by its own persisted criteria document (two delta bands, two DTE windows, a debit-to-width ceiling, per-leg liquidity gates, an optional IV-rank band, earnings handling) and its own pure engine. Cards, the detail panel, the criteria strip and the criteria sheet all follow the lens; the trader's entry conditions gate both lenses identically. Done when the twelve acceptance scenarios pass end to end against the packaged app, the wheel lens is byte-for-byte unchanged, and every US-66/67/68/70/96/98 e2e suite still passes.

Estimated at **8 points**. Areas 1–6 are main-process and observable only through IPC; areas 7–10 are the bench. If the owner prefers two stories, the seam is between 6 and 7.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** Linear [OPT-18](https://linear.app/optionswheel/issue/OPT-18/us-110-add-pmcc-screening-criteria-to-candidate-screener) — saved 2026-09-20; there is no archived markdown story for US-110
- **Mockups:** `mockups/us-110-pmcc-screening-bench.mdx`, `mockups/us-110-pmcc-criteria-sheet.mdx`
- **Research & Design Decisions:** `plans/us-110/research.md`
- **Data Model, Funnel Table & Fixture Numbers:** `plans/us-110/data-model.md`
- **API Contracts:** `plans/us-110/contracts/screener-pmcc.md`
- **Quickstart & Verification:** `plans/us-110/quickstart.md`

## Prerequisites

None — all required schema and infrastructure already exists. `app_settings` (migration 006) holds the new document; `getOptionChainSnapshot` already takes `type: 'call'`; `fetchIsolatedStockQuotes`, `readEarningsOrEmpty`, `getAssessedIvrByUnderlying`, `ensureTradingCalendar` are reused as-is; `SheetPanel width={460}` and the `Sheet*` primitives exist. US-101 (PMCC entry form) is **not** a prerequisite — promotion is US-122.

## Implementation Areas

### 1. Shared bounds and messages for the PMCC criteria

**Files to create or modify:**

- `src/main/core/screening-criteria.ts` — add `LONG_DTE_MAX`, `DEBIT_TO_WIDTH_MIN/MAX`, the five new messages, and `isLongDteInRange`, `isDebitToWidthInRange`, `isIvRankCeilingInRange` (see data-model "New constants and messages"). Zero imports stays zero imports.

**Red — tests to write:**

- `src/main/core/screening-criteria.test.ts`: `isLongDteInRange` accepts `180`, `'540'`, `730`; rejects `0`, `731`, `'180.5'`, `' 180'`
- same file: `isDebitToWidthInRange` accepts `'1'`, `'90'`, `'100'`; rejects `'0'`, `'100.01'`, `''`, `'9e1'`
- same file: `isIvRankCeilingInRange` matches `isIvRankFloorInRange` on `'0'`, `'100'`, `'100.1'`, `'-1'`
- same file: the five message constants equal the exact strings in `contracts/screener-pmcc.md` (`LEAPS DTE must be at most 730`, `Max debit / width must be between 1% and 100%`, `IV rank ceiling must be between 0 and 100`, `IV-rank floor must be less than IV-rank ceiling`, `LEAPS minimum DTE must exceed short-call maximum DTE`)

**Green — implementation:**

- Constants and template-literal messages beside the existing ones; predicates built on the existing `parseNumeric`, `isLongDteInRange` requiring `Number.isInteger`

**Refactor — cleanup to consider:**

- `isDteInRange` and `isLongDteInRange` differ only in the upper bound — a private `isWholeNumberInRange(value, min, max)` serves both. Do it only if it reads better than two four-line functions.

**Acceptance criteria covered:** "Reject an overlapping or inverted PMCC window" (the messages); structural precondition for the sheet and the service.

---

### 2. The PMCC screening engine

**Files to create or modify:**

- `src/main/core/screener.ts` — `export` the reason helpers `EN_DASH`, `formatBand`, `formatPercent`, `formatMoney`, `formatObservedOn`, and the `earningsTier` / `isEarningsInWindow`-style predicate the `earnings_in_window` filter uses (extract if it is inline). No behaviour change.
- `src/main/core/pmcc-screener.ts` — **new**: `PmccScreeningCriteria`, `DEFAULT_PMCC_SCREENING_CRITERIA`, `PmccTickerScreeningInput`, `PmccLeg`, `PmccScoredCandidate`, `PmccExclusionCode`, `PmccExcludedCandidate`, `PmccTickerScreeningResult`, the three ordered registries (`TICKER_FILTERS`, `LEG_FILTERS`, `PAIR_FILTERS`), `toPmccLeg`, `scorePmccPair`, `screenPmccTicker`, `rankPmccCandidates`. Exact shapes and reason strings: data-model "Engine input and output" and "Filter funnel".

**Red — tests to write** (`src/main/core/pmcc-screener.test.ts`, fixtures from the data-model table):

- `scorePmccPair` on XLF `$42C 10.30 Δ0.81` / `$53C 0.64 Δ0.29`, dte 35, price `51.20` → `netDebit '9.66'`, `capitalAtRisk '966.00'`, `strikeWidth '11.00'`, `debitToWidthPercent '87.82'`, `cycleYield '0.0663'`, `annualizedYield '0.6909'`, `returnPerDelta '2.3825'`, `longExtrinsic '1.10'`, `extrinsicCoverage '0.5818'`
- `scorePmccPair` with `underlyingPrice: null` → `longExtrinsic null`, `extrinsicCoverage null`, every other field identical
- `scorePmccPair` when `price − long.strike > long.mark` (mark below intrinsic, a stale quote) → `longExtrinsic '0.00'`, `extrinsicCoverage null` (never divide by zero or emit negative)
- `screenPmccTicker` AMD fixture → `best null`, `excluded[0]` is `{ stage: 'pair', code: 'debit_to_width', reason: 'debit 93.84% of width exceeds 90%' }`
- `screenPmccTicker` with a LEAPS at delta `0.62` → `excluded[0]` reason `LEAPS delta 0.62 outside 0.70–0.85` (en dash) and `stage: 'long'`
- `screenPmccTicker` with a short at OI `120` and `minOpenInterest 200` → `short call open interest 120 below 200`
- `screenPmccTicker` with a short strike `$40` against a `$42` LEAPS → `short_strike_not_above_long`, reason `short strike $40.00 not above LEAPS strike $42.00`
- `screenPmccTicker` with `maxIvRank '55'` and `ivRank { value: '58.0', observedAt: '2026-09-17T20:00:00Z' }` → single excluded row `{ stage: 'ticker', code: 'iv_rank_ceiling', reason: 'IV rank 58.0 (Sep 17) above 55' }`, nothing leg-level evaluated
- `screenPmccTicker` with `maxIvRank '55'` and `ivRank null` → not excluded on IV (the `applies` guard)
- `screenPmccTicker` with `minIvRank '50'`, `maxIvRank '55'`, value exactly `'55.0'` → passes (inclusive both ends)
- `screenPmccTicker` earnings `{ status: 'found', date }` inside the short window, `exclude` → `stage: 'short'`, code `earnings_in_window`; the same date beyond the short expiry but inside the LEAPS life → **not** excluded
- `screenPmccTicker` earnings inside the window, `flag` → `best.earnings.status === 'flagged'` with `daysBeforeExpiry`
- best-pair choice: two shorts survive (`$53C 0.64 Δ0.29` score 2.38 vs `$52C 0.90 Δ0.36` → delta band fails) and two LEAPS survive (`$42C` vs `$40C 12.10 Δ0.83`): the winner is the highest `returnPerDelta`; on an exact tie the lower `debitToWidthPercent`, then the lower LEAPS strike
- `rankPmccCandidates([KO, XLF, AAPL])` → `[XLF, AAPL, KO]` (2.38, 2.18, 2.06); a `flagged` candidate sorts after every `clear` one regardless of score
- module purity: `pmcc-screener.ts` has no import from `services/`, `integrations/`, `../logger`, or `better-sqlite3` (assert with a source read, as `screener.test.ts` does if it already does; otherwise a `grep`-style test)

**Green — implementation:**

- `TICKER_FILTERS: PmccFilter<TickerContext>[]`, `LEG_FILTERS: PmccFilter<LegContext>[]` parameterised by `{ role: 'long' | 'short' }` so one registry serves both legs with `criteria.longDelta*`/`shortDelta*` chosen by role and the reason prefixed `LEAPS ` / `short call `; `PAIR_FILTERS: PmccFilter<PairContext>[]`. Each entry is `{ code, applies, test, reason }` exactly like `FilterDefinition`.
- `evaluateStage(filters, ctx, criteria): { code, reason, index } | null` — one generic `findIndex`, reused by all three stages
- `screenPmccTicker`: ticker stage → per-leg stage over `longCalls` and `shortCalls` (`computeDte` from `core/dte.ts` for each expiration) → pairs = surviving longs × surviving shorts → pair stage → `scorePmccPair` → sort `earningsTier`, `returnPerDelta` desc, `debitToWidthPercent` asc, `long.strike` asc → `best = survivors[0] ?? null`; `excluded` sorted by stage depth then index, deepest first
- `scorePmccPair`: one unrounded `Decimal` chain; round only on the way out (4dp fractions, 2dp money/percent); `extrinsicCoverage` only when `longExtrinsic.gt(0)`
- `rankPmccCandidates`: `earningsTier`, then `returnPerDelta` desc, then `ticker.localeCompare`

**Refactor — cleanup to consider:**

- If `evaluateStage` is a clean generic, `core/screener.ts`'s `evaluateFilters` could delegate to it — only if the diff is a pure extraction with `screener.test.ts` unchanged.
- Keep `PmccFilter<C>` a local type; do not generalise `FilterDefinition` in `screener.ts`.

**Acceptance criteria covered:** "A diagonal is ranked by annualized cycle yield per unit of short delta", "An excluded diagonal names the stage that refused it", "Extrinsic is display-only", "An IV-rank ceiling excludes a rich underlying".

---

### 3. PMCC criteria persistence and payload schema

**Files to create or modify:**

- `src/main/services/pmcc-screening-criteria.ts` — **new**: `PMCC_SCREENING_CRITERIA_KEY = 'pmcc_screening_criteria'`, `StoredPmccScreeningCriteriaSchema` (every field `.default()`ed), `SavePmccScreeningCriteriaInput = Omit<PmccScreeningCriteria, 'maxSpreadAbsolute'>`, `getPmccScreeningCriteria(db)`, `savePmccScreeningCriteria(db, input)`, private `assertValid`
- `src/main/schemas.ts` — `SavePmccScreeningCriteriaPayloadSchema` and its inferred type (verbatim in `contracts/screener-pmcc.md`)

**Red — tests to write:**

- `src/main/services/pmcc-screening-criteria.test.ts`: `getPmccScreeningCriteria` on an empty `app_settings` → `DEFAULT_PMCC_SCREENING_CRITERIA` by deep equality
- same: a stored document missing `maxIvRank` (written "before the field existed") reads back with `maxIvRank: null` and every other stored value intact
- same: unparseable JSON → whole defaults; a document with `longDteMin: 40, shortDteMax: 45` (overlapping) → whole defaults; `minIvRank '60', maxIvRank '40'` → whole defaults; `longDeltaMin '0.85', longDeltaMax '0.70'` → whole defaults
- same: `savePmccScreeningCriteria` with defaults minus `maxSpreadAbsolute` → returns the full document including `maxSpreadAbsolute: '0.10'` and a subsequent `get` matches it
- same: save with `longDteMin 40` → throws `ValidationError` with `field 'longDteMin'`, `code 'overlapping_windows'`, message `LEAPS minimum DTE must exceed short-call maximum DTE`; **and** `app_settings` still holds the prior document (nothing written)
- same: `longDteMax 800` → `field 'longDteMax'`, `code 'out_of_range'`, `LEAPS DTE must be at most 730`; `maxDebitToWidthPercent '0'` → `Max debit / width must be between 1% and 100%`; `minIvRank '60'` + `maxIvRank '40'` → `field 'maxIvRank'`, `code 'inverted_band'`
- same: a wheel `saveScreeningCriteria` call leaves `pmcc_screening_criteria` untouched and vice-versa (two keys, two documents)
- `src/main/schemas.test.ts`: `SavePmccScreeningCriteriaPayloadSchema` rejects `maxIvRank: '120'` with `IV rank ceiling must be between 0 and 100`, accepts both IV fields `null`, rejects an extra `maxSpreadAbsolute` key only if the wheel schema does (mirror its strictness)

**Green — implementation:**

- Copy the US-67 file's structure: wholesale fallback on `safeParse` failure **or** any failed `isAscending` / window-ordering / IV-band check after a successful parse; `assertValid` runs per-field bounds first, then the six cross-field rules in data-model order; one `appSettings.set` after validation; return `getPmccScreeningCriteria(db)`
- `ValidationError` codes: `out_of_range`, `inverted_band`, and the new `overlapping_windows` — confirm `ValidationError`'s code type in `core/lifecycle.ts` accepts a string or widen it there

**Refactor — cleanup to consider:**

- `services/screening-criteria.ts` and this file will share the shape "read JSON row → schema → fallback → write". If a `readSettingsDocument(db, key, schema, defaults, isConsistent)` helper falls out naturally, extract it and re-point US-67's file; otherwise leave two files.

**Acceptance criteria covered:** "Edit PMCC criteria and re-screen" (persistence half), "The wheel criteria are untouched by a PMCC save", "Saved PMCC criteria survive a restart, the lens does not", "Reject an overlapping or inverted PMCC window".

---

### 4. Chain pull takes a contract type; fake provider honours `expirationTo`

**Files to create or modify:**

- `src/main/services/candidate-chains.ts` — `PullOptions` gains `type?: 'put' | 'call'` (default `'put'`); `pullTickerChain` passes it to `getOptionChainSnapshot`; `no_options_listed` debug log includes the type
- `src/main/integrations/fake-market-data.ts` — add the missing `if (filter.expirationTo && quote.expiration > filter.expirationTo) return []` beside the `expirationFrom` check (line ~114)

**Red — tests to write:**

- `src/main/services/candidate-chains.integration.test.ts`: `pullWatchlistChains(provider, db, { type: 'call', window: { min: 180, max: 540 } })` calls the provider with `type: 'call'` and the range `today+180 .. today+540`; omitting `type` still sends `'put'` (US-64 callers unchanged)
- `src/main/integrations/fake-market-data.test.ts`: a fixture map holding a 35-DTE call and a 490-DTE call returns only the 490 one for `expirationFrom = +180, expirationTo = +540`, only the 35 one for `+20 .. +45`, and both with no range

**Green — implementation:**

- Thread `type` through; nothing else changes

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:** precondition for every ranked/excluded scenario; "An excluded diagonal names the stage that refused it" (XYZ's `no calls quoted in the 180–540 DTE window` needs an empty long window that does not swallow the short window).

---

### 5. The PMCC screener service

**Files to create or modify:**

- `src/main/services/pmcc-screener.ts` — **new**: `RankedPmccCandidate`, `PmccScreenerResults`, `screenWatchlistPmccCandidates(getProvider, db, opts)`; reuse `dataUnavailable`, `representativeExclusion`-style helpers (export from `services/screener.ts` or lift into a small `services/screener-shared.ts`), `readAssessedIvr`, `usableIvRanks`, `readEarningsOrEmpty`, `ensureTradingCalendar`, `fetchIsolatedStockQuotes`
- `src/main/services/screener.ts` — `ScreenerExclusionCode` widens to include `PmccExclusionCode` (or the PMCC service declares `PmccScreenerExclusionCode` and the IPC type unions them — pick the one that leaves `screener.ts`'s tests untouched)

**Red — tests to write** (`src/main/services/pmcc-screener.integration.test.ts`, fake provider + in-memory DB, fixtures = the data-model table keyed by OCC call symbols):

- default criteria, the nine-stock bench → `status 'ok'`, `ranked` tickers `['XLF', 'KO']` in that order (AAPL/PEP/DIS also rank — the _gates_ are the bench's, not the service's — so assert the full engine order `['XLF','AAPL','PEP','DIS','KO']` and that `excluded` holds exactly `AMD`, `MSFT`, `ORCL`, `XYZ` with the reasons in the data-model; note ORCL/MSFT reasons come from earnings/IV fixtures, choose fixtures so MSFT is `earnings 2026-09-21 falls on or before expiry` and ORCL ranks or is excluded deterministically)
- every watchlist ticker appears in exactly one of `ranked` / `excluded`
- the provider is called twice per ticker with `type: 'call'` — once per window — and never with `'put'`
- `XYZ` has a short-window chain but no long-window chain → `{ code: 'no_options_listed', reason: 'no calls quoted in the 180–540 DTE window' }`; a ticker with a long chain but no short chain → `no calls quoted in the 20–45 DTE window`
- XLF's stock quote throws → XLF still ranks first with `returnPerDelta '2.3825'` and `longExtrinsic null`
- stock quotes are fetched **without** a price ceiling being set (they are always needed here)
- the long-window pull returns `provider_unavailable` → results `provider_unavailable`, empty lists, null timestamp; same when only the short-window pull does
- `getProvider` throws → `provider_unavailable`
- a stale/expired/predates-earnings IVR reaches `ranked[i].ivRank` with its `state` but never reaches the engine (assert the ceiling is not applied to a stale `58.0`)
- `quoteTimestamp` is the newest of the ranked legs' timestamps
- `opts.criteria` overrides the persisted document; absent, `getPmccScreeningCriteria(db)` is read (spy)

**Green — implementation:**

- `criteria = opts.criteria ?? getPmccScreeningCriteria(db)`; `provider = getProvider()` in try/catch; `Promise.all` of `[pullWatchlistChains(long window, 'call'), pullWatchlistChains(short window, 'call'), fetchIsolatedStockQuotes, readEarningsOrEmpty(shortDteMax horizon), ensureTradingCalendar]` — the two chain pulls run sequentially inside one promise to keep the burst at `CHAIN_FETCH_CONCURRENCY`
- zip per ticker → `PmccTickerScreeningInput` or a chain-level exclusion; `screenPmccTicker` per ticker in its own try/catch (`data_unavailable` on throw, as US-65) → `rankPmccCandidates` → re-attach assessed IVR → `representativeExclusion` per non-ranking ticker → `quoteTimestamp`
- INFO log `PMCC screen completed` with counts; DEBUG for criteria in use, per-ticker chain sizes, and each ticker's verdict

**Refactor — cleanup to consider:**

- `services/screener.ts` and this file will share `readAssessedIvr`, `usableIvRanks`, `dataUnavailable`, `newestTimestamp`, `representativeExclusion`. Move them to `services/screener-shared.ts` once both compile; the wheel service's tests are the regression net.

**Acceptance criteria covered:** all ranked/excluded/outage scenarios at the IPC boundary: "Switch the bench to the PMCC lens", "A diagonal is ranked…", "An excluded diagonal…", "Extrinsic is display-only", "An IV-rank ceiling…", "A provider outage degrades the PMCC lens like the wheel".

---

### 6. IPC handlers and preload

**Files to create or modify:**

- `src/main/ipc/screener.ts` — three new `ipcMain.handle` registrations inside `registerScreenerIpc`: `'screener:pmcc-results'`, `'screener:get-pmcc-criteria'`, `'screener:save-pmcc-criteria'` (Zod parse + one service call, wrapped in `handleIpcCall`)
- `src/preload/index.ts`, `src/preload/index.d.ts` — `pmccResults`, `getPmccCriteria`, `savePmccCriteria`; `IpcPmccLeg`, `IpcPmccScoredCandidate`, `IpcPmccScreenerResultsResult`, `IpcPmccScreeningCriteria`, `IpcPmccScreeningCriteriaResult`; `IpcScreenerExclusion.code` widened

**Red — tests to write** (`src/main/ipc/screener.test.ts`):

- `screener:pmcc-results` returns `{ ok: true, status, ranked, excluded, quoteTimestamp }` from a stubbed service, and `{ ok: false, errors: [{ field: '__root__', code: 'internal_error' }] }` when the service throws
- `screener:get-pmcc-criteria` returns `{ ok: true, criteria }`
- `screener:save-pmcc-criteria` with a valid payload returns the stored document; with `maxIvRank: '120'` returns `ok: false` and an error row with `field 'maxIvRank'` and the ceiling message; with an overlapping window returns `field 'longDteMin'`, `code 'overlapping_windows'`
- the wheel channels' existing tests are untouched and green

**Green — implementation:**

- Mirror the three existing handlers line for line with the PMCC names

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:** transport for every scenario; "Reject an overlapping or inverted PMCC window" (server half).

---

### 7. Renderer data layer: adapters, hooks, formatters, generic bench

**Files to create or modify:**

- `src/renderer/src/api/pmcc-screener.ts` — **new**: renderer aliases of the IPC types, `getPmccScreenerResults()` (throws `ApiError` only on `ok: false`)
- `src/renderer/src/api/pmcc-screening-criteria.ts` — **new**: `PmccScreeningCriteria`, `SavePmccScreeningCriteriaPayload`, `getPmccScreeningCriteria`, `savePmccScreeningCriteria`
- `src/renderer/src/api/screener.ts` — `ScreenerExclusion['code']` widened
- `src/renderer/src/hooks/screenerQueryKeys.ts` — `pmccResults: ['screener', 'pmcc-results']`, `pmccCriteria: ['screener', 'pmcc-criteria']`
- `src/renderer/src/hooks/usePmccScreenerResults.ts` — **new**: `useQuery`, no `refetchInterval`, `enabled` option
- `src/renderer/src/hooks/usePmccScreeningCriteria.ts` — **new**: `usePmccScreeningCriteria({ enabled })`, `useSavePmccScreeningCriteria` invalidating `pmccCriteria` **and** `pmccResults` only
- `src/renderer/src/hooks/useScreenerResults.ts`, `useScreeningCriteria.ts` — accept `{ enabled }` (default `true`)
- `src/renderer/src/lib/bench-strategy.ts` — **new**: `BenchStrategy`, `BENCH_STRATEGY_LABEL = { WHEEL: 'Wheel', PMCC: 'PMCC' }`
- `src/renderer/src/lib/bench.ts` — `BenchCandidate`, `BenchResults<C>`, `BenchStock<C>`, `Bench<C>`, `buildBench<C>`, `defaultSelection<C>`
- `src/renderer/src/lib/screener-format.ts` — `fmtRatioPercent(percent: string)` (2dp, trailing zeros trimmed, `%`), `fmtPmccCriteriaSummary(criteria): string[]` with chips in this order: `LEAPS Δ 0.70–0.85`, `LEAPS 180–540 DTE`, `Short Δ 0.25–0.35`, `Short 20–45 DTE`, `Debit ≤ 90% width`, `OI ≥ 200`, `Spread ≤ 10%`, optional `IVR ≥ n`, optional `IVR ≤ n`, `Earnings Exclude|Flag only`; `fmtDiagonalLine(candidate)` → `$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit`
- `src/renderer/src/lib/promote.ts` — untouched; `buildPromoteSearch` still takes a put `ScreenerCandidate`

**Red — tests to write:**

- `lib/bench.test.ts`: `buildBench` over PMCC candidates partitions identically to puts — a ranked ticker with all gates passing → `meets` with `rank`; a ranked ticker with a blocking price gate → `waiting` with the gate label and `candidate` still attached; an excluded ticker → `waiting` with the verbatim reason; `provider_unavailable` → every stock `Data unavailable · not evaluated`; the existing put tests unchanged and green
- `lib/screener-format.test.ts`: `fmtPmccCriteriaSummary(DEFAULTS)` → the exact nine chips above (no IVR chips); with `minIvRank '30'`, `maxIvRank '55'` → both IVR chips between `Spread` and `Earnings`; `fmtRatioPercent('87.82')` → `87.82%`, `('87.50')` → `87.5%`; `fmtDiagonalLine` on the XLF fixture → the exact string
- `hooks/usePmccScreeningCriteria.test.ts`: a successful save invalidates `pmccCriteria` and `pmccResults` and **not** `criteria` / `results`
- `api/pmcc-screener.test.ts`: `status: 'provider_unavailable'` resolves normally; `ok: false` throws `ApiError`

**Green — implementation:**

- Follow `api/screener.ts` / `api/screening-criteria.ts` / `useScreeningCriteria.ts` shape for shape
- `buildBench<C extends BenchCandidate>` — the body is unchanged; only the type parameters move

**Refactor — cleanup to consider:**

- `fmtCriteriaSummary` and `fmtPmccCriteriaSummary` share the `Δ a–b` / `OI ≥` / `Spread ≤` / earnings chip builders — extract chip helpers so the two summaries cannot drift in glyphs.

**Acceptance criteria covered:** "Switch the bench to the PMCC lens" (strip chips), "Entry conditions gate a PMCC match exactly as they gate a put", "A provider outage degrades the PMCC lens like the wheel".

---

### 8. Criteria sheet in PMCC mode

**Files to create or modify:**

- `src/renderer/src/components/criteria-fields.tsx` — **new**: `SheetGroup`, `SheetField`, `Segment`, `NumericInput`, `RangeField`, `OptionalNumericField`, `Divider` moved verbatim out of `ScreeningCriteriaForm.tsx` and exported
- `src/renderer/src/components/ScreeningCriteriaForm.tsx` — imports them; no other change
- `src/renderer/src/schemas/pmcc-screening-criteria.ts` — **new**: the form schema, `PMCC_SCREENING_CRITERIA_FIELDS`, `isPmccScreeningCriteriaField`, ordered `RULES`, `toFormValues`, `toPayload` (data-model "Form model")
- `src/renderer/src/components/PmccScreeningCriteriaForm.tsx` — **new**: RHF + `zodResolver`, `mode: 'onChange'`, groups per the mockup: **LEAPS (long call)** → `RangeField` Delta band (`Δ`, caption "Deep in the money: the LEAPS stands in for shares."), `RangeField` DTE window (`days`, caption "Long enough that the LEAPS outlives several short cycles."); **Short call** → Delta band (caption "Assignment-probability band for the call you sell."), DTE window; **Spread efficiency** → `SheetField` Max debit / strike width (`%` suffix, caption "Net debit (LEAPS mark − short mark) as a share of strike width. Under 100% the width covers the debit if the short is assigned; 75% is the common comfort guideline."); **Liquidity (per leg)** → Minimum open interest, Max bid-ask spread; **IV environment (optional)** → `OptionalNumericField` IV-rank floor, `OptionalNumericField` IV-rank ceiling; **Policy** → Earnings handling `Segment` (caption "Judged against the short call's expiration."). Header: eyebrow `Screener`, title `Screening Criteria`, subtitle `Applies to all N watchlist tickers · PMCC · LEAPS + short call`. Footer identical to the wheel form; **Reset to defaults** resets from `DEFAULT_PMCC_SCREENING_CRITERIA`
- `src/renderer/src/components/ScreeningCriteriaSheet.tsx` — prop `strategy: BenchStrategy` plus `pmccCriteria`; renders `ScreeningCriteriaForm` or `PmccScreeningCriteriaForm` inside the same 460px `SheetPanel`

**Red — tests to write:**

- `schemas/pmcc-screening-criteria.test.ts`: defaults parse; `longDteMin '40'` → issue on `longDteMin` with the overlap message **only when both windows are individually in range**; `longDteMax '800'` → `LEAPS DTE must be at most 730`; `maxDebitToWidthPercent '0'` → the ratio message; floor `'60'` and ceiling `'40'` with both toggles on → issue on `maxIvRank` with the IV-band message; both on with `'30'`/`'55'` → valid; ceiling toggle off ignores whatever is typed in `maxIvRank`; `toPayload` maps an off toggle to `null`; `toFormValues(DEFAULTS)` round-trips through `toPayload` to `DEFAULTS` minus `maxSpreadAbsolute`
- `components/PmccScreeningCriteriaForm.test.tsx`: renders the six group labels in order; pre-fills every input from the criteria; typing an overlapping LEAPS min shows the message inline and disables **Save & re-screen** while **Fix the highlighted fields.** replaces the reset link; a successful save calls `onSaved` then `onClose`; the subtitle reads `Applies to all 9 watchlist tickers · PMCC · LEAPS + short call`
- `components/ScreeningCriteriaForm.test.tsx`: existing tests green after the extraction (regression net for `criteria-fields.tsx`)
- `components/ScreeningCriteriaSheet.test.tsx`: `strategy 'PMCC'` renders the PMCC form; `'WHEEL'` renders the wheel form; both at width 460

**Green — implementation:**

- As specified; `bindFieldErrors` copied with `isPmccScreeningCriteriaField`

**Refactor — cleanup to consider:**

- `bindFieldErrors`, `GENERIC_SAVE_ERROR` and the footer are now duplicated across the two forms — lift a `CriteriaSheetFooter` and a `bindCriteriaFieldErrors(setError, isField)` into `criteria-fields.tsx` if both forms stay under 200 lines either way.

**Acceptance criteria covered:** "Edit PMCC criteria and re-screen" (sheet half), "Reject an overlapping or inverted PMCC window", "An IV-rank ceiling excludes a rich underlying" (the control that enables it).

---

### 9. The bench in PMCC mode

**Files to create or modify:**

- `src/renderer/src/components/StrategyToggle.tsx` — **new**: `{ value: BenchStrategy; onChange }`, the `Segment` pill from `criteria-fields.tsx` with options `Wheel` (`bench-strategy-wheel`) / `PMCC` (`bench-strategy-pmcc`), wrapped in `role="group" aria-label="Screening strategy" data-testid="bench-strategy"`
- `src/renderer/src/components/BenchHeader.tsx` — renders `StrategyToggle` after the count badge; `criteria` prop becomes `criteriaChips: string[] | undefined` and `criteriaLabel: string` (`Criteria` / `PMCC criteria`) so the header stays strategy-agnostic
- `src/renderer/src/components/ScreenerCriteriaStrip.tsx` — takes `chips: string[]` and `label: string` instead of `criteria`
- `src/renderer/src/components/BenchCard.tsx` — generic over `BenchStock<C>`; second line from a `describeMatch: (candidate: C) => string` prop (`fmtDiagonalLine` for PMCC, the existing put string for the wheel); rank pill `title` from a `score: (c: C) => string` prop
- `src/renderer/src/components/MatchingDiagonalCard.tsx` — **new**, per the mockup: `SectionCard header="Matching diagonal · best score for this stock"`; two leg rows (`bench-leg-long`: sky `LEAPS · BUY` tag, `$42.00 CALL`, `Jan 21, 2028 · 490 DTE`, `mark $10.30 · Δ 0.81 · OI 640 · spread $0.30 (3%)`; `bench-leg-short`: violet `SHORT · SELL` tag, `$53.00 CALL`, `Oct 23, 2026 · 35 DTE`, `mark $0.64 · Δ 0.29 · OI 2,140 · spread $0.04 (6%)`); a 3×3 `dl` (`bench-diagonal-metrics`): Net debit / share, Per spread, Strike width, Debit / width, Cycle yield, Annualized (`/yr`), Extrinsic in LEAPS (`—` when null), Recovered per cycle (`—` when null), Short Δ; caption `Net debit uses marks, before fees. Under 100% of width, the strike width covers the debit if the short call is assigned. Cycle yield = short mark ÷ net debit.`; **no Review trade button**
- `src/renderer/src/components/BenchDetail.tsx` — generic; renders `MatchingPutCard` or `MatchingDiagonalCard` by strategy; held-back copy `A qualifying diagonal exists ($140.00 LEAPS · $190.00 short · Oct 23, 2026 · 5.64% on debit) but is held back by the entry conditions above.` for PMCC
- `src/renderer/src/components/BenchGrid.tsx` — `strategy` prop; PMCC empty copy: title `No diagonals match your PMCC criteria`, body `Every LEAPS and short-call pair on your watchlist was filtered out. Loosen a delta band, a DTE window, or the debit-to-width limit.`; `onReview` only wired for the wheel
- `src/renderer/src/pages/WatchlistPage.tsx` — `strategy` state (default `'WHEEL'`, resets to `'WHEEL'` on mount — not persisted); both results hooks and both criteria hooks mounted with `enabled: strategy === …`; `bench = buildBench(snapshot, activeResults)`; `staleQuoteTime`, `screened`, `criteriaUnloadable` derived from the active pair; footer copy says "a qualifying contract" instead of "a qualifying put"; `handleReview` unchanged

**Red — tests to write:**

- `components/StrategyToggle.test.tsx`: renders both options with `aria-pressed`; click raises `onChange('PMCC')`
- `components/BenchHeader.test.tsx`: toggle sits inside the left group; strip label reads `PMCC criteria` when told to
- `components/BenchCard.test.tsx`: PMCC stock in `meets` shows `#1` with `title '2.38'` and the `watchlist-contract` line `$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit`; in `waiting` shows the reason; the wheel case unchanged
- `components/MatchingDiagonalCard.test.tsx`: XLF fixture renders every metric string in the data-model row; `longExtrinsic null` renders `—` for both extrinsic cells; no element with text `Review trade`
- `components/BenchDetail.test.tsx`: PMCC meets → `bench-detail-diagonal` present, `bench-detail-put` absent; PMCC waiting with candidate → the held-back copy above
- `components/BenchGrid.test.tsx`: PMCC, screened, empty meets → `screener-empty` with the PMCC title
- `pages/WatchlistPage.test.tsx`: default lens is Wheel and only the wheel queries fetch; selecting PMCC fetches `pmcc-results` and `get-pmcc-criteria`, swaps the strip chips and the sections; a PMCC save shows `Screening criteria saved` and refetches only the PMCC results; selecting Wheel afterwards shows the wheel chips unchanged

**Green — implementation:**

- As specified. Leg-tag tints: LEAPS `bg-wb-sky/10 text-wb-sky border-wb-sky/30` (the HOLDING_SHARES colour — the LEAPS is the synthetic stock), short `bg-wb-violet-dim text-wb-violet border-wb-violet/30` (the CC_OPEN colour); Tailwind classes only

**Refactor — cleanup to consider:**

- `BenchCard`'s two `describe`/`score` props could collapse into one `matchSummary: (c) => { line: string; score: string }` — do it if it removes a prop without adding a type.
- Verify every touched component stays under 200 lines; `BenchDetail.tsx` is the one at risk — extract `BenchDetailHeader` if needed.

**Acceptance criteria covered:** "Switch the bench to the PMCC lens", "A diagonal is ranked…", "The detail panel shows both legs and the spread metrics", "An excluded diagonal…", "Entry conditions gate a PMCC match…", "Extrinsic is display-only", "Edit PMCC criteria and re-screen" (surface half), "The wheel criteria are untouched…", "Saved PMCC criteria survive a restart, the lens does not", "A provider outage degrades the PMCC lens like the wheel".

---

### 10. E2e Tests

**Files to create or modify:**

- `e2e/pmcc-screener-helpers.ts` — **new**: `CallFixtureSpec` (`ticker, strike, expirationOffset, bid, ask, mid, delta (positive), openInterest`), `occCallSymbol`, `buildCallFixtures`, the nine-stock `BENCH_DIAGONALS` (long + short spec per ticker from the data-model table; XYZ short-only; MSFT with earnings at `+3` days), `selectStrategy(page, 'PMCC' | 'WHEEL')`, `detailDiagonalMetrics(page)`, `legRow(page, 'long' | 'short')`, `setPmccCriteriaValues`, `pmccCriteriaChips`
- `e2e/screener-helpers.ts` — `ScreenerLaunchOpts` gains `callFixtures?: CallFixtureSpec[]` and `stockQuoteError?: string[]` (tickers whose quote the fake provider rejects), merged into `WHEELBASE_MOCK_OPTION_SNAPSHOTS` alongside the puts
- `e2e/pmcc-screener.spec.ts` — **new**, one `it()` per AC, named verbatim

**Red — tests to write** (each maps to exactly one AC; Background = the US-96 nine-stock bench plus `BENCH_DIAGONALS`, fake clock Fri 2026-09-18, LIVE):

- `Switch the bench to the PMCC lens` — click `bench-strategy-pmcc`; strip label `PMCC criteria` and chips equal the nine default PMCC chips; `meetsTickers()` is `['XLF', 'KO']`; no card text contains ` put ·`; `bench-strategy-pmcc` has `aria-pressed="true"`
- `A diagonal is ranked by annualized cycle yield per unit of short delta` — XLF card `watchlist-rank` text `#1` with `title '2.38'`, KO `#2` with `title '2.06'`; XLF `watchlist-contract` reads `$42.00 LEAPS · $53.00 short Oct 23 · 6.63% on debit`
- `The detail panel shows both legs and the spread metrics` — select XLF; `bench-leg-long` contains `$42.00 CALL`, `Jan 21, 2028 · 490 DTE`, `Δ 0.81`; `bench-leg-short` contains `$53.00 CALL`, `Oct 23, 2026 · 35 DTE`, `Δ 0.29`, `2,140`; metrics read `$9.66`, `$966.00`, `$11.00`, `87.82%`, `6.63%`, `69.09%/yr`, `$1.10`, `58.18%`, `0.29`; no `bench-review-XLF` button exists
- `An excluded diagonal names the stage that refused it` — `cardReason('AMD')` is `debit 93.84% of width exceeds 90%`; `cardReason('XYZ')` is `no calls quoted in the 180–540 DTE window`
- `Entry conditions gate a PMCC match exactly as they gate a put` — AAPL in `waitingTickers()`, `cardReason('AAPL')` is `Price $178.40 above $170 target`; select AAPL; `bench-detail-held-back` reads the diagonal held-back copy with `$140.00 LEAPS · $190.00 short · Oct 23, 2026 · 5.64% on debit`
- `Extrinsic is display-only` — launch with `stockQuoteError: ['XLF']`; XLF still `#1` with `title '2.38'`; select XLF; Extrinsic in LEAPS and Recovered per cycle both read `—`
- `Edit PMCC criteria and re-screen` — open the sheet from `bench-criteria`; subtitle contains `PMCC · LEAPS + short call`; set `Max debit / width` to `85`; save; `Screening criteria saved` visible; chip `Debit ≤ 85% width`; `meetsTickers()` is `['KO']`; `cardReason('XLF')` is `debit 87.82% of width exceeds 85%`
- `The wheel criteria are untouched by a PMCC save` — after the save above, click `bench-strategy-wheel`; `criteriaChips()` equals `['Δ 0.20–0.30', 'DTE 30–45', 'OI ≥ 500', 'Spread ≤ 10%', 'Earnings Exclude']`; `meetsTickers()` equals the US-96 Background's wheel result
- `Saved PMCC criteria survive a restart, the lens does not` — save `85`; `relaunchScreener`; `bench-strategy-wheel` is pressed and the wheel chips show; select PMCC; chip `Debit ≤ 85% width` present
- `An IV-rank ceiling excludes a rich underlying` — from defaults, open the sheet, `iv-rank-ceiling-on`, `IV-rank ceiling` = `55`, save; `cardReason('KO')` is `IV rank 58.0 (Sep 17) above 55`; XLF still `#1`
- `Reject an overlapping or inverted PMCC window` — for each row of the outline (`LEAPS minimum DTE` `40` → overlap message; `LEAPS maximum DTE` `800` → `LEAPS DTE must be at most 730`; `Max debit / width` `0` → the ratio message; floor `60` + ceiling `40` both on → the IV-band message; `Short-call minimum delta` `0.35` with max `0.25` → `Minimum delta must be less than maximum delta`): the message is visible inline, `SAVE_CRITERIA_BUTTON` is disabled, `Fix the highlighted fields.` shows; dismiss; chips unchanged
- `A provider outage degrades the PMCC lens like the wheel` — launch with `marketDataError`; select PMCC; Meets section shows the waiting-for-market-data `AlertBox`; every card reason is `Data unavailable · not evaluated`; `meetsTickers()` is `[]`

**Green — implementation:**

- Fixtures calibrated so the real engine emits the exact strings above (the same "AC numbers through the real engine" technique as US-66); falsify each assertion once against a flipped expectation before trusting it
- Confirm `e2e/watchlist-bench.spec.ts`, `screening-criteria.spec.ts`, `screener-results.spec.ts`, `promote-to-trade.spec.ts`, `screener-earnings.spec.ts`, `ivr-staleness.spec.ts` pass unmodified — the wheel lens is the default, so their seams are untouched

**Refactor — cleanup to consider:**

- Share the OCC symbol builder between the put and call fixture helpers.

**Acceptance criteria covered:** every AC, one test each.

## AC Audit

| Draft acceptance criterion                                             | E2e test (area 10)                  | Unit/integration areas |
| ---------------------------------------------------------------------- | ----------------------------------- | ---------------------- |
| Switch the bench to the PMCC lens                                      | `Switch the bench to the PMCC lens` | 5, 7, 9                |
| A diagonal is ranked by annualized cycle yield per unit of short delta | same name                           | 2, 5, 9                |
| The detail panel shows both legs and the spread metrics                | same name                           | 2, 9                   |
| An excluded diagonal names the stage that refused it                   | same name                           | 2, 4, 5, 7             |
| Entry conditions gate a PMCC match exactly as they gate a put          | same name                           | 7, 9                   |
| Extrinsic is display-only                                              | same name                           | 2, 5, 9                |
| Edit PMCC criteria and re-screen                                       | same name                           | 3, 6, 7, 8, 9          |
| The wheel criteria are untouched by a PMCC save                        | same name                           | 3, 7, 9                |
| Saved PMCC criteria survive a restart, the lens does not               | same name                           | 3, 9                   |
| An IV-rank ceiling excludes a rich underlying                          | same name                           | 2, 8                   |
| Reject an overlapping or inverted PMCC window (outline, 5 rows)        | same name                           | 1, 3, 6, 8             |
| A provider outage degrades the PMCC lens like the wheel                | same name                           | 5, 7, 9                |

Every draft AC has exactly one named e2e case. No AC is uncovered.

## Out of scope for this plan (owned elsewhere)

- Promoting a PMCC match into the entry form — **US-122 (OPT-28)**; the matching-diagonal card ships without an action
- IV term-structure context — US-113
- The PMCC entry form itself — US-101
- Per-entry strategy tags on watchlist entries, ex-dividend early-assignment screening, LEAPS extrinsic as a hard filter, persisting the selected lens
- `docs/spec/` updates — run `/update-spec us-110` when the story completes
