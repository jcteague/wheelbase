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

- **User Story & Acceptance Criteria:** Linear [OPT-18](https://linear.app/optionswheel/issue/OPT-18/us-110-add-pmcc-screening-criteria-to-candidate-screener) — saved 2026-09-20, plan re-verified against `main` 2026-11-11 (see "Revision 2026-11-11" below); there is no archived markdown story for US-110
- **Mockups:** `mockups/us-110-pmcc-screening-bench.mdx`, `mockups/us-110-pmcc-criteria-sheet.mdx`
- **Research & Design Decisions:** `plans/us-110/research.md`
- **Data Model, Funnel Table & Fixture Numbers:** `plans/us-110/data-model.md`
- **API Contracts:** `plans/us-110/contracts/screener-pmcc.md`
- **Quickstart & Verification:** `plans/us-110/quickstart.md`

## Prerequisites

None — all required schema and infrastructure already exists. `app_settings` (migration 006) holds the new document; `getOptionChainSnapshot` already takes `type: 'call'`, and the fake provider already honours both `expirationFrom` and `expirationTo` (`integrations/fake-market-data.ts:271-272`); `fetchIsolatedStockQuotes`, `readEarningsOrEmpty`, `ensureTradingCalendar` and the US-121 IV-rank read path (`readIvRankLookup` / `lookupOf` in `services/iv-rank-lookup.ts`, which needs the process's `IvRunState`) are reused as-is; `SheetPanel width={460}` and the `Sheet*` primitives exist. Shared helpers the engine reuses: `fixed4` / `money4` (`src/shared/decimal-text.ts`), `toFiniteDecimal` (`core/finite-decimal.ts`), `shortStrikeAboveLeaps` (`core/pmcc-rules.ts`). US-101/US-103 (PMCC entry) have since shipped but are **not** prerequisites — promotion is US-122.

## Revision 2026-11-11

The plan was written 2026-09-20. Re-checked against `main` at `29d2754`; what changed underneath it and how the areas below now read:

| Change on `main`                                                                                                                                                                                                                                                                                                                                                                                     | Effect on this plan                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-121 replaced the Barchart scrape with an IV rank computed from the app's own IV30 history. `getAssessedIvrByUnderlying` / `ivr-snapshots.ts` are gone; the read is `readIvRankLookup(db, tickers, { now, calendar, lastEarnings, runState })`, and each row carries `IvRankPair` (`ivRank` **plus** `ivRankAbsence`). The research claim that the consumer interface "is not changing" was wrong. | Area 5 calls `readIvRankLookup` and spreads `lookupOf(...)` onto each ranked candidate; `screenWatchlistPmccCandidates` and `registerScreenerIpc`'s PMCC handler take `runState`. Area 6/7 types use `IpcIvRankPair` / `IvRankPair`.                                                            |
| IV rank is now an integer string (`'58'`, not `'58.0'`); the wheel reason reads `IV rank 22 (May 29) below 30`.                                                                                                                                                                                                                                                                                      | Every PMCC IV reason is `IV rank 58 (Sep 17) above 55`. The Linear AC still says `58.0` / `46.0` and needs the same one-character edit.                                                                                                                                                         |
| e2e fixtures are anchored to `BASE_DAY` = the most recent **real** weekday (`e2e/trading-day-fixtures.ts:43`), not a pinned date; IVR is seeded through `BENCH_IVR` → `WHEELBASE_FAKE_IV_SERIES`.                                                                                                                                                                                                    | Area 10 keeps every DTE fixed by day offset (35 / 364 / 490), so all money and yield literals are stable, but asserts **date labels** computed from `screenerDate(offset)` and the IVR anchor label from `BASE_DAY`. The AC's "Fri 2026-09-18" valuation date is a unit-test fixture date only. |
| `expirationTo` landed in the fake provider.                                                                                                                                                                                                                                                                                                                                                          | Area 4 shrinks to the `type` parameter.                                                                                                                                                                                                                                                         |
| `fixed4` / `money4`, `toFiniteDecimal`, `shortStrikeAboveLeaps`, `shortExtrinsic` were added.                                                                                                                                                                                                                                                                                                        | Area 2 reuses them rather than re-deriving.                                                                                                                                                                                                                                                     |
| CLAUDE.md now requires property tests for new pure engines.                                                                                                                                                                                                                                                                                                                                          | Areas 1 and 2 name their properties.                                                                                                                                                                                                                                                            |
| The stock-quote seam is `ScreenerLaunchOpts.stockQuotes`; an absent ticker yields no quote.                                                                                                                                                                                                                                                                                                          | Area 10 drops the proposed `stockQuoteError` option.                                                                                                                                                                                                                                            |

## Implementation Areas

### 1. Shared bounds and messages for the PMCC criteria

**Files to create or modify:**

- `src/main/core/screening-criteria.ts` — add `LONG_DTE_MAX`, `DEBIT_TO_WIDTH_MIN/MAX`, the five new messages, and `isLongDteInRange`, `isDebitToWidthInRange`, `isIvRankCeilingInRange` (see data-model "New constants and messages"). Zero imports stays zero imports.

**Red — tests to write:**

- `src/main/core/screening-criteria.test.ts`: `isLongDteInRange` accepts `180`, `'540'`, `730`; rejects `0`, `731`, `'180.5'`, `' 180'`
- same file: `isDebitToWidthInRange` accepts `'1'`, `'90'`, `'100'`; rejects `'0'`, `'100.01'`, `''`, `'9e1'`
- same file: `isIvRankCeilingInRange` matches `isIvRankFloorInRange` on `'0'`, `'100'`, `'100.1'`, `'-1'`
- same file: the five message constants equal the exact strings in `contracts/screener-pmcc.md` (`LEAPS DTE must be at most 730`, `Max debit / width must be between 1% and 100%`, `IV rank ceiling must be between 0 and 100`, `IV-rank floor must be less than IV-rank ceiling`, `LEAPS minimum DTE must exceed short-call maximum DTE`)
- `src/main/core/screening-criteria.property.test.ts` — **new** (bound/oracle): for every integer `n` in `-100..1000`, `isLongDteInRange(n) === (n >= 1 && n <= 730)` — compared against the literal bounds, not `LONG_DTE_MAX`; for every 2-dp string in `0.00..150.00`, `isDebitToWidthInRange(s) === (1 <= Number(s) && Number(s) <= 100)`; `isIvRankCeilingInRange` and `isIvRankFloorInRange` agree on every generated string (one domain, two names)

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
- `screenPmccTicker` with `maxIvRank '55'` and `ivRank { value: '58', observedAt: '2026-09-17T20:00:00Z' }` → single excluded row `{ stage: 'ticker', code: 'iv_rank_ceiling', reason: 'IV rank 58 (Sep 17) above 55' }`, nothing leg-level evaluated
- `screenPmccTicker` with `maxIvRank '55'` and `ivRank null` → not excluded on IV (the `applies` guard)
- `screenPmccTicker` with `minIvRank '50'`, `maxIvRank '55'`, value exactly `'55'` → passes (inclusive both ends)
- `screenPmccTicker` earnings `{ status: 'found', date }` inside the short window, `exclude` → `stage: 'short'`, code `earnings_in_window`; the same date beyond the short expiry but inside the LEAPS life → **not** excluded
- `screenPmccTicker` earnings inside the window, `flag` → `best.earnings.status === 'flagged'` with `daysBeforeExpiry`
- best-pair choice: two shorts survive (`$53C 0.64 Δ0.29` score 2.38 vs `$52C 0.90 Δ0.36` → delta band fails) and two LEAPS survive (`$42C` vs `$40C 12.10 Δ0.83`): the winner is the highest `returnPerDelta`; on an exact tie the lower `debitToWidthPercent`, then the lower LEAPS strike
- `rankPmccCandidates([KO, XLF, AAPL])` → `[XLF, AAPL, KO]` (2.38, 2.18, 2.06); a `flagged` candidate sorts after every `clear` one regardless of score
- module purity: `pmcc-screener.ts` has no import from `services/`, `integrations/`, `../logger`, or `better-sqlite3` (assert with a source read, as `screener.test.ts` does if it already does; otherwise a `grep`-style test)

Properties (`src/main/core/pmcc-screener.property.test.ts`, generators from `test-fixtures/arbitraries.ts` plus a local `callStrike` arbitrary built on `positiveMoney`):

- **oracle** — for any generated long/short pair with `short.strike > long.strike` and `long.mark > short.mark`, `scorePmccPair` gives `netDebit = long.mark − short.mark`, `strikeWidth = short.strike − long.strike` and `debitToWidthPercent = netDebit ÷ width × 100`, each computed independently with `Decimal` and rounded half-up to 2 dp
- **guard** — every `best` returned by `screenPmccTicker` satisfies `short.strike > long.strike`, both deltas inside their bands, both DTEs inside their windows, and `debitToWidthPercent ≤ maxDebitToWidthPercent` (an implication on a rounded output that rounding cannot break, since the filter runs on the unrounded value)
- **invariant (the "extrinsic is display-only" rule)** — for any input, `screenPmccTicker({ …input, underlyingPrice: null })` and `screenPmccTicker({ …input, underlyingPrice: p })` for any generated `p` return the same `best` contract pair and the same `excluded` codes; only `longExtrinsic` / `extrinsicCoverage` differ
- **order independence** — shuffling `longCalls` and `shortCalls` (`fc.shuffledSubarray` at full length) leaves `best` unchanged; shuffling the input to `rankPmccCandidates` leaves its output order unchanged
- **bound** — `longExtrinsic`, when non-null, is `≥ 0`; `extrinsicCoverage`, when non-null, is `> 0`

**Green — implementation:**

- `TICKER_FILTERS: PmccFilter<TickerContext>[]`, `LEG_FILTERS: PmccFilter<LegContext>[]` parameterised by `{ role: 'long' | 'short' }` so one registry serves both legs with `criteria.longDelta*`/`shortDelta*` chosen by role and the reason prefixed `LEAPS ` / `short call `; `PAIR_FILTERS: PmccFilter<PairContext>[]`. Each entry is `{ code, applies, test, reason }` exactly like `FilterDefinition`.
- `evaluateStage(filters, ctx, criteria): { code, reason, index } | null` — one generic `findIndex`, reused by all three stages
- `screenPmccTicker`: ticker stage → per-leg stage over `longCalls` and `shortCalls` (`computeDte` from `core/dte.ts` for each expiration) → pairs = surviving longs × surviving shorts → pair stage → `scorePmccPair` → sort `earningsTier`, `returnPerDelta` desc, `debitToWidthPercent` asc, `long.strike` asc → `best = survivors[0] ?? null`; `excluded` sorted by stage depth then index, deepest first
- `scorePmccPair`: one unrounded `Decimal` chain; round only on the way out — 4 dp fractions through `fixed4` from `src/shared/decimal-text.ts` (as `core/screener.ts` now does), 2 dp money/percent with `toDecimalPlaces(2, ROUND_HALF_UP)`; quote strings parsed with `toFiniteDecimal` (`core/finite-decimal.ts`); `extrinsicCoverage` only when `longExtrinsic.gt(0)`. LEAPS extrinsic is the same formula as `shortExtrinsic` in `core/pmcc-card.ts` (`mark − max(0, price − strike)`), clamped at 0 here
- the `short_strike_not_above_long` pair filter's `test` is `shortStrikeAboveLeaps(short.strike, long.strike)` from `core/pmcc-rules.ts` — the same rule the entry form enforces, so screener and entry cannot disagree
- `rankPmccCandidates`: `earningsTier`, then `returnPerDelta` desc, then `ticker.localeCompare`

**Refactor — cleanup to consider:**

- If `evaluateStage` is a clean generic, `core/screener.ts`'s `evaluateFilters` could delegate to it — only if the diff is a pure extraction with `screener.test.ts` unchanged.
- Keep `PmccFilter<C>` a local type; do not generalise `FilterDefinition` in `screener.ts`.
- `shortExtrinsic` in `core/pmcc-card.ts` is now a misnomer if the LEAPS uses the same formula. If the two call sites read the same, rename it `legExtrinsic` (one rename, `pmcc-card` tests the regression net) and apply the 0-clamp at the screener call site.

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

### 4. Chain pull takes a contract type

**Files to create or modify:**

- `src/main/services/candidate-chains.ts` — `PullOptions` gains `type?: 'put' | 'call'` (default `'put'`); `pullTickerChain` passes it to `getOptionChainSnapshot`; `no_options_listed` debug log includes the type
- ~~`src/main/integrations/fake-market-data.ts`~~ — no change: the `expirationTo` check this area used to add is already at line 272

**Red — tests to write:**

- `src/main/services/candidate-chains.integration.test.ts`: `pullWatchlistChains(provider, db, { type: 'call', window: { min: 180, max: 540 } })` calls the provider with `type: 'call'` and the range `today+180 .. today+540`; omitting `type` still sends `'put'` (US-64 callers unchanged)
- same file: against the fake provider holding a 35-DTE and a 490-DTE call for one ticker, the `180–540` call pull returns only the 490-DTE strike and the `20–45` pull only the 35-DTE one (pins the two windows apart through the real seam)

**Green — implementation:**

- Thread `type` through; nothing else changes

**Refactor — cleanup to consider:**

- Check for duplication and naming consistency.

**Acceptance criteria covered:** precondition for every ranked/excluded scenario; "An excluded diagonal names the stage that refused it" (XYZ's `no calls quoted in the 180–540 DTE window` needs an empty long window that does not swallow the short window).

---

### 5. The PMCC screener service

**Files to create or modify:**

- `src/main/services/pmcc-screener.ts` — **new**: `RankedPmccCandidate`, `PmccScreenerResults`, `PmccScreenOptions = { criteria?: PmccScreeningCriteria; currentDate?: Date; runState: IvRunState }` (`runState` required, as `screenWatchlistCandidates` now has it), `screenWatchlistPmccCandidates(getProvider, db, opts)`; reuse `dataUnavailable`, `representativeExclusion`-style helpers (export from `services/screener.ts` or lift into a small `services/screener-shared.ts`), `readIvRanks`, `usableIvRanks`, `readEarningsOrEmpty`, `ensureTradingCalendar`, `fetchIsolatedStockQuotes`, and `lookupOf` from `services/iv-rank-lookup.ts`
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
- a stale/expired/predates-earnings IVR reaches `ranked[i].ivRank` with its `state` but never reaches the engine (assert the ceiling is not applied to a stale `58`)
- a ticker with no IV history ranks with `ivRank: null` and `ivRankAbsence: { reason: 'not_collected' }`; one whose collection is in flight (`runState` reports `pending`) carries `ivRankAbsence: { reason: 'pending' }` — the pair is passed through, never rebuilt
- `runState` is forwarded to `readIvRankLookup` (the same object, not a copy)
- `quoteTimestamp` is the newest of the ranked legs' timestamps
- `opts.criteria` overrides the persisted document; absent, `getPmccScreeningCriteria(db)` is read (spy)

**Green — implementation:**

- `criteria = opts.criteria ?? getPmccScreeningCriteria(db)`; `provider = getProvider()` in try/catch; `Promise.all` of `[pullWatchlistChains(long window, 'call'), pullWatchlistChains(short window, 'call'), fetchIsolatedStockQuotes, readEarningsOrEmpty(shortDteMax horizon), ensureTradingCalendar]` — the two chain pulls run sequentially inside one promise to keep the burst at `CHAIN_FETCH_CONCURRENCY`
- `ivRankLookups = readIvRanks(db, tickers, currentDate, earnings, opts.runState)`; engine input takes `usableIvRanks(ivRankLookups)`
- zip per ticker → `PmccTickerScreeningInput` or a chain-level exclusion; `screenPmccTicker` per ticker in its own try/catch (`data_unavailable` on throw, as US-65) → `rankPmccCandidates` → `{ ...candidate, ...lookupOf(ivRankLookups, candidate.ticker) }` → `representativeExclusion` per non-ranking ticker → `quoteTimestamp`
- INFO log `PMCC screen completed` with counts; DEBUG for criteria in use, per-ticker chain sizes, and each ticker's verdict

**Refactor — cleanup to consider:**

- `services/screener.ts` and this file will share `readIvRanks`, `usableIvRanks`, `dataUnavailable`, `newestTimestamp` (already widened to `Pick<…, 'timestamp'>[]`), `representativeExclusion`. Move them to `services/screener-shared.ts` once both compile; the wheel service's tests are the regression net.

**Acceptance criteria covered:** all ranked/excluded/outage scenarios at the IPC boundary: "Switch the bench to the PMCC lens", "A diagonal is ranked…", "An excluded diagonal…", "Extrinsic is display-only", "An IV-rank ceiling…", "A provider outage degrades the PMCC lens like the wheel".

---

### 6. IPC handlers and preload

**Files to create or modify:**

- `src/main/ipc/screener.ts` — three new `ipcMain.handle` registrations inside `registerScreenerIpc`: `'screener:pmcc-results'` (passes `{ currentDate: getCurrentDate(), runState }`, exactly as `screener:results` now does), `'screener:get-pmcc-criteria'`, `'screener:save-pmcc-criteria'` (Zod parse + one service call, wrapped in `handleIpcCall`). `registerScreenerIpc` already receives `runState`; `src/main/index.ts` needs no change
- `src/preload/index.ts`, `src/preload/index.d.ts` — `pmccResults`, `getPmccCriteria`, `savePmccCriteria`; `IpcPmccLeg`, `IpcPmccScoredCandidate` (`{ … } & IpcIvRankPair`, the way `IpcScreenerCandidate` is built at `index.d.ts:344`), `IpcPmccScreenerResultsResult`, `IpcPmccScreeningCriteria`, `IpcPmccScreeningCriteriaResult`; `IpcScreenerExclusion.code` widened

**Red — tests to write** (`src/main/ipc/screener.test.ts`):

- `screener:pmcc-results` returns `{ ok: true, status, ranked, excluded, quoteTimestamp }` from a stubbed service, and `{ ok: false, errors: [{ field: '__root__', code: 'internal_error' }] }` when the service throws
- `screener:pmcc-results` hands the service the registered `runState` (`toBe(RUN_STATE)`, as the wheel channel's test at `ipc/screener.test.ts:142` does) and the injected `getCurrentDate()`
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

- `src/renderer/src/api/pmcc-screener.ts` — **new**: renderer aliases of the IPC types (`PmccScreenerCandidate = { … } & IvRankPair` from `api/ivr.ts`, so `IvrCell ivr={candidate}` takes it unchanged), `getPmccScreenerResults()` (throws `ApiError` only on `ok: false`)
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

- `e2e/pmcc-screener-helpers.ts` — **new**: `CallFixtureSpec` (`ticker, strike, expirationOffset, bid, ask, mid, delta (positive), openInterest`), `occCallSymbol`, `buildCallFixtures` (expirations via `screenerDate(offset)`), the nine-stock `BENCH_DIAGONALS` (long + short spec per ticker from the data-model table; short offset `35`, LEAPS offsets `364` / `490`; XYZ short-only; MSFT with earnings at `+3` days), label helpers `shortLabel(offset)` (`MMM d`), `longLabel(offset)` (`MMM d, yyyy`) and `ivrAnchorLabel()` (`format(parseISO(BASE_DAY), 'MMM d')`), `selectStrategy(page, 'PMCC' | 'WHEEL')`, `detailDiagonalMetrics(page)`, `legRow(page, 'long' | 'short')`, `setPmccCriteriaValues`, `pmccCriteriaChips`
- `e2e/screener-helpers.ts` — `ScreenerLaunchOpts` gains `callFixtures?: CallFixtureSpec[]`, merged into `WHEELBASE_MOCK_OPTION_SNAPSHOTS` alongside the puts. No quote-failure option: pass `stockQuotes` without the ticker (an absent key yields no quote)
- `e2e/pmcc-screener.spec.ts` — **new**, one `it()` per AC, named verbatim

**Dates in this suite.** `BASE_DAY` is the most recent real weekday, so the AC's calendar literals (`Oct 23`, `Jan 21, 2028`, `Sep 17`) cannot be asserted verbatim. Every DTE is fixed by offset, so every money, percent and score literal below **is** asserted verbatim; every date is the label helper's output for that offset. In the bullets below, `‹short›` is `shortLabel(35)`, `‹short, yyyy›` is `longLabel(35)`, `‹leaps›` is `longLabel(490)` and `‹anchor›` is `ivrAnchorLabel()`.

**Red — tests to write** (each maps to exactly one AC; Background = the US-96 nine-stock bench (`BENCH_CONDITIONS`, `BENCH_IVR`, `BENCH_QUOTES`, `BENCH_EARNINGS`) plus `BENCH_DIAGONALS`, fake clock `DEFAULT_FAKE_NOW`, LIVE):

- `Switch the bench to the PMCC lens` — click `bench-strategy-pmcc`; strip label `PMCC criteria` and chips equal the nine default PMCC chips; `meetsTickers()` is `['XLF', 'KO']`; no card text contains ` put ·`; `bench-strategy-pmcc` has `aria-pressed="true"`
- `A diagonal is ranked by annualized cycle yield per unit of short delta` — XLF card `watchlist-rank` text `#1` with `title '2.38'`, KO `#2` with `title '2.06'`; XLF `watchlist-contract` reads `` `$42.00 LEAPS · $53.00 short ${‹short›} · 6.63% on debit` ``
- `The detail panel shows both legs and the spread metrics` — select XLF; `bench-leg-long` contains `$42.00 CALL`, `` `${‹leaps›} · 490 DTE` ``, `Δ 0.81`; `bench-leg-short` contains `$53.00 CALL`, `` `${‹short, yyyy›} · 35 DTE` ``, `Δ 0.29`, `2,140`; metrics read `$9.66`, `$966.00`, `$11.00`, `87.82%`, `6.63%`, `69.09%/yr`, `$1.10`, `58.18%`, `0.29`; no `bench-review-XLF` button exists
- `An excluded diagonal names the stage that refused it` — `cardReason('AMD')` is `debit 93.84% of width exceeds 90%`; `cardReason('XYZ')` is `no calls quoted in the 180–540 DTE window`
- `Entry conditions gate a PMCC match exactly as they gate a put` — AAPL in `waitingTickers()`, `cardReason('AAPL')` is `Price $178.40 above $170 target`; select AAPL; `bench-detail-held-back` reads the diagonal held-back copy with `` `$140.00 LEAPS · $190.00 short · ${‹short, yyyy›} · 5.64% on debit` ``
- `Extrinsic is display-only` — launch with `stockQuotes` = `BENCH_QUOTES` minus `XLF` (XLF has no entry conditions, so its verdict does not depend on a price); XLF still `#1` with `title '2.38'`; select XLF; Extrinsic in LEAPS and Recovered per cycle both read `—`
- `Edit PMCC criteria and re-screen` — open the sheet from `bench-criteria`; subtitle contains `PMCC · LEAPS + short call`; set `Max debit / width` to `85`; save; `Screening criteria saved` visible; chip `Debit ≤ 85% width`; `meetsTickers()` is `['KO']`; `cardReason('XLF')` is `debit 87.82% of width exceeds 85%`
- `The wheel criteria are untouched by a PMCC save` — after the save above, click `bench-strategy-wheel`; `criteriaChips()` equals `['Δ 0.20–0.30', 'DTE 30–45', 'OI ≥ 500', 'Spread ≤ 10%', 'Earnings Exclude']`; `meetsTickers()` equals the US-96 Background's wheel result
- `Saved PMCC criteria survive a restart, the lens does not` — save `85`; `relaunchScreener`; `bench-strategy-wheel` is pressed and the wheel chips show; select PMCC; chip `Debit ≤ 85% width` present
- `An IV-rank ceiling excludes a rich underlying` — from defaults, open the sheet, `iv-rank-ceiling-on`, `IV-rank ceiling` = `55`, save; `cardReason('KO')` is `` `IV rank 58 (${‹anchor›}) above 55` `` (KO's `BENCH_IVR` reading is 58, fresh; XLF's is 46); XLF still `#1`
- `Reject an overlapping or inverted PMCC window` — for each row of the outline (`LEAPS minimum DTE` `40` → overlap message; `LEAPS maximum DTE` `800` → `LEAPS DTE must be at most 730`; `Max debit / width` `0` → the ratio message; floor `60` + ceiling `40` both on → the IV-band message; `Short-call minimum delta` `0.35` with max `0.25` → `Minimum delta must be less than maximum delta`): the message is visible inline, `SAVE_CRITERIA_BUTTON` is disabled, `Fix the highlighted fields.` shows; dismiss; chips unchanged
- `A provider outage degrades the PMCC lens like the wheel` — launch with `marketDataError`; select PMCC; Meets section shows the waiting-for-market-data `AlertBox`; every card reason is `Data unavailable · not evaluated`; `meetsTickers()` is `[]`

**Green — implementation:**

- Fixtures calibrated so the real engine emits the exact strings above (the same "AC numbers through the real engine" technique as US-66); falsify each assertion once against a flipped expectation before trusting it
- Confirm `e2e/watchlist-bench.spec.ts`, `screening-criteria.spec.ts`, `screener-results.spec.ts`, `promote-to-trade.spec.ts`, `screener-earnings.spec.ts`, `ivr-staleness.spec.ts`, `ivr-watchlist-collection.spec.ts`, `iv-history.spec.ts` pass unmodified — the wheel lens is the default, so their seams are untouched

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
