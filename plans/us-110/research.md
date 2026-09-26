# Research: US-110 — Add PMCC screening criteria to the candidate screener

**Linear:** [OPT-18](https://linear.app/optionswheel/issue/OPT-18/us-110-add-pmcc-screening-criteria-to-candidate-screener) · Epic 09 — PMCC Strategy End-to-End
**Story state:** refined and saved to OPT-18 on 2026-09-20 (estimate 8) together with this plan. There is no archived markdown story for US-110 — Linear is the only source.

**Mockups:** `mockups/us-110-pmcc-screening-bench.mdx` (the bench in PMCC mode) and `mockups/us-110-pmcc-criteria-sheet.mdx` (the criteria sheet in PMCC mode). Both use the shipped primitives (`SectionCard`, `Badge`, `AlertBox`, `IvrCell`, `FreshnessRing`, `MarketStatusPill`, `PageHeader`, `ScreenerStateCard`, `Sheet*`, `FormButton`) so what they show is what `BenchCard`, `BenchDetail` and `ScreeningCriteriaForm` already render, extended.

## What the code actually does today

Verified against `src/` on 2026-09-20, not taken from the spec.

| Fact                                                                                                                                                                                                               | Where                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| The screener is **puts only, end to end**. `type: 'put'` is hard-coded in the one provider call; nothing carries a strategy.                                                                                       | `services/candidate-chains.ts:45-50`; `core/screener.ts` has no `contractType`/strategy field |
| One DTE window per run, all expirations inside it, from `criteria.dteMin/dteMax`.                                                                                                                                  | `services/screener.ts:253`, `core/candidate-chain.ts:31` (`dteWindowToExpirationRange`)       |
| Criteria are **one JSON document in `app_settings`** (`screening_criteria`). Every field has `.default()`; no migration needed to add a document or a field.                                                       | `services/screening-criteria.ts:30,42-70`                                                     |
| Bounds, messages and predicates live once in a zero-import module shared by IPC schema, service and renderer form.                                                                                                 | `core/screening-criteria.ts` (DTE_MAX = 365 — too small for a LEAPS window)                   |
| The engine is an **ordered filter registry**, first failure wins, `index` = funnel depth, `excluded[0]` = closest miss.                                                                                            | `core/screener.ts:273-346` (`FILTERS`), `:353` (`evaluateFilters`), `:495` (`screenTicker`)   |
| Rank = `annualizedYield /                                                                                                                                                                                          | delta                                                                                         | ` (`yieldPerDelta`); earnings tier sorts ahead of it; array order is the rank.     | `core/screener.ts:372-406, 532` |
| Underlying prices are fetched **only when a price ceiling is set**.                                                                                                                                                | `services/screener.ts:76-85` (`readUnderlyingPrices`)                                         |
| IVR reaches the engine only when `fresh`/`aging`; unusable readings still travel to the renderer for display.                                                                                                      | `services/screener.ts:97-120`, `core/ivr-freshness.ts`                                        |
| `MarketDataProvider.getOptionChainSnapshot(filter)` accepts `type: 'put'                                                                                                                                           | 'call'`and an expiration range. The fake provider filters on`type`and`expirationFrom`.        | `integrations/market-data-provider.ts`; `integrations/fake-market-data.ts:113-114` |
| The bench (`WatchlistPage`) merges `watchlist:snapshot` rows with `screener:results` in `lib/bench.ts`; `BenchStock.candidate` is a single `ScreenerCandidate`.                                                    | `renderer/lib/bench.ts:11-24, 87`                                                             |
| `BenchCard` second line, `MatchingPutCard`, `ScreenerCriteriaStrip`, `fmtCriteriaSummary` are all put-shaped.                                                                                                      | `components/BenchCard.tsx:98-103`, `MatchingPutCard.tsx`, `lib/screener-format.ts:43`         |
| `ScreeningCriteriaForm` holds `SheetGroup`, `SheetField`, `Segment`, `NumericInput`, `RangeField`, `OptionalNumericField` as **unexported** locals.                                                                | `components/ScreeningCriteriaForm.tsx:36-241`                                                 |
| `'PMCC'` exists only as an unused `StrategyType` enum value and a defaulted DB column. No PMCC phase, role, or create path.                                                                                        | `core/types.ts:5`; `services/positions.ts:133` hard-codes `'WHEEL'`                           |
| Per-contract `impliedVolatility` is on `OptionChainQuote` but dropped by `toCandidateStrikes`. No term-structure API exists.                                                                                       | `integrations/alpaca-market-data-mappers.ts:163`; `core/candidate-chain.ts:73-88`             |
| US-121 (In Progress) is replacing the Barchart scrape with a locally computed IV rank. The **consumer** interface (`AssessedIvRank`, `getAssessedIvrByUnderlying`) is what the screener reads and is not changing. | Linear OPT-27                                                                                 |

Sibling PMCC stories read for shared rules (Epic 09 authoring note): US-101 (entry form; owns the entry-shape rules and explicitly lists "PMCC screener ranking, screener promotion, IVR analytics, and IV term-structure comparisons" as out of scope), US-102 (owns the long-expires-after-short comparator), US-103 (owns the cost-basis formula), US-113 (owns IV term-structure context; unrefined), US-112/US-114 (IVR display on card / roll dialog; unrefined).

## Architecture decisions

### ADR: PMCC is a second lens on the same bench, chosen by a strategy control

- **Decision:** The Watchlist page gains a `Wheel | PMCC` segmented control in the header, beside the count badge. It is page state (default `Wheel`), not persisted. The criteria strip, the criteria sheet, both bench sections, every card's second line, the detail panel's matching-contract card, and the Meets-criteria empty state all follow the selected strategy. The watchlist entries, their theses, conditions and the three gates (price, IV, earnings) are unchanged and apply to both lenses.
- **Why:** The epic says "extends the Epic 08 screener rather than defining a separate surface" and Epic 08's success criterion is "distinguishes wheel candidates from PMCC candidates (different criteria sets)". A trader benches a name and then asks which structure fits it today; the same conditions gate both answers. A second page would duplicate the bench (US-96 just spent a story removing that split).
- **Alternatives considered:** a per-entry strategy tag on the watchlist entry (requires a schema change and an edit-form change owned by US-63/US-69, and forces the trader to decide the structure before seeing either screen); running both screens and badging cards with the strategies they qualify for (doubles provider calls on every refresh for a question most traders ask one way at a time); a separate `/pmcc-screener` route (re-creates the US-96 split).

### ADR: PMCC criteria are their own JSON document, not fields on the wheel document

- **Decision:** A second `app_settings` key, `pmcc_screening_criteria`, holds a `PmccScreeningCriteria` document read/written by `services/pmcc-screening-criteria.ts` with the same shape of code as US-67: every field `.default()`ed from `DEFAULT_PMCC_SCREENING_CRITERIA`, wholesale fallback on any parse/bounds/ordering failure, validate-then-single-write on save.
- **Why:** The two sets share only three concepts (liquidity gates, earnings handling, an IV-rank filter) and differ on everything else (two legs, two DTE windows, a pair ratio, no price ceiling). Folding twelve PMCC fields into the wheel document would make one save from either sheet rewrite the other's values, and the US-67 "one document travels together" argument applies per strategy, not across strategies. No migration either way.
- **Alternatives considered:** one document with a `pmcc: {...}` sub-object (one `appSettings.set` still rewrites both; the US-67 write path would need to merge, which is exactly the partial-apply hazard US-67 avoided); a dedicated table (a migration for an always-one-row record — rejected by US-67 for the same reason).

### ADR: The PMCC engine is a sibling module with its own ordered registries, not a strategy flag on `FILTERS`

- **Decision:** `src/main/core/pmcc-screener.ts` is a new pure module. It reuses `CandidateStrike`, `IvRank`, `EarningsLookup`, `CandidateEarnings` and the reason formatters (`formatBand`, `formatPercent`, `formatMoney`, `formatObservedOn`, `EN_DASH`, exported from `core/screener.ts` for the purpose), and defines three ordered registries — **ticker filters** (`iv_rank_floor`, `iv_rank_ceiling`), **leg filters** applied to each call in each window (`dte_window`, `delta_unavailable`, `delta_band`, `open_interest`, `spread`, plus `earnings_in_window` on the short leg only), and **pair filters** applied to every surviving LEAPS × short combination (`short_strike_not_above_long` structural, then `debit_to_width`). First failure wins at each stage; `index` keeps meaning "how far it got".
- **Why:** The wheel registry's `applies`/`test`/`reason` shape is exactly right, but its context is one strike and one criteria object. A PMCC verdict needs two legs and a pair, and the funnel order that gives `excluded[0]` its meaning is different (ticker → leg → pair). Threading a `leg` discriminator through `FILTERS` would make every existing filter branch on a field the wheel never sets — the "no business logic in a place that doesn't need it" smell — and would couple US-110's ordering to US-65's. A sibling module keeps `core/screener.ts` byte-for-byte and lets each registry be tested alone.
- **Alternatives considered:** generic `FILTERS<C>` parameterised over criteria/context (one abstraction for two concrete uses — speculative); reusing `screenTicker` per leg and pairing afterwards (works for leg filters, but `screenTicker` picks one best strike per ticker, and the best pair is not the best LEAPS with the best short).

### ADR: The pair is scored on return on net debit, ranked per unit of short delta

- **Decision:** For a LEAPS `L` (mark `Lm`, strike `Lk`) and short call `S` (mark `Sm`, strike `Sk`, `dte`):
  - `netDebit = Lm − Sm` (per share, marks, before fees); `capitalAtRisk = netDebit × 100`
  - `strikeWidth = Sk − Lk`; `debitToWidthPercent = netDebit / strikeWidth × 100`
  - `cycleYield = Sm / netDebit`; `annualizedYield = cycleYield × 365 / dte`
  - `returnPerDelta = annualizedYield / |Sδ|` — **the rank score**
  - `longExtrinsic = Lm − max(0, price − Lk)` when the underlying price is known, else `null`; `extrinsicCoverage = Sm / longExtrinsic` when `longExtrinsic > 0`, else `null`
    Best pair per ticker: earnings tier, then `returnPerDelta` desc, then lower `debitToWidthPercent`, then lower LEAPS strike. Cross-ticker rank mirrors `rankCandidates`: tier, score, ticker.
- **Why:** The wheel's one explainable number is "premium per unit of assignment probability". The PMCC question is the same with the capital changed: the short call is the income, the net debit is the capital, and the short delta is the probability the LEAPS is forced to cover. `returnPerDelta` keeps the bench's ranking vocabulary ("higher is better, penalised by assignment risk") identical across lenses. Cycle yield is annualised only so two shorts with different DTE compare; the caption says "cycle yield", never "return", and the epic's own guidance (US-101) forbids presenting max profit or breakeven. `debitToWidth` is a filter and a tie-break, not the score, because it measures safety, not income. Extrinsic is display-only: it needs a price the wheel path does not always fetch, and a missing price must not change a verdict (the same rule as "Missing IV rank does not exclude").
- **Alternatives considered:** rank by `debitToWidthPercent` ascending (rewards deep LEAPS but is blind to how much the short pays); rank by `extrinsicCoverage` (the practitioner's "how many cycles to pay off the extrinsic" — strong, but undefined without a price, and would make an outage of one quote silently reorder the list); rank by raw `annualizedYield` (favours near-the-money shorts and ignores the assignment risk US-106 exists to alert on).

### ADR: `debit_to_width` is a configurable pair filter defaulting to 90%, not the "75% rule" and not a hard 100%

- **Decision:** `maxDebitToWidthPercent` defaults to `'90'`, bounded 1–100, and excludes a pair whose `debitToWidthPercent` exceeds it (`.gt`, so exactly-at passes). Reason string: `debit 93.84% of width exceeds 90%` — percent formatted by the engine's existing `formatPercent` (2dp, ROUND_UP, trailing zeros trimmed).
- **Why:** Below 100% the strike width covers the net debit if the short is assigned and the LEAPS exercised — that is the structural line. The widely quoted 75% is a comfort guideline, and `docs/options-expert/strategy-mechanics.md:226` itself calls a 90% ratio "slightly above the 75% target but acceptable". With a 20–45 DTE short at delta 0.25–0.35 against a 0.70–0.85 LEAPS, realistic ratios sit in the 80–95% band (the short credit rarely exceeds the LEAPS extrinsic in one cycle), so a 75% default would empty the list on most names while a 100% default would let a pair through that loses on assignment before fees. 90% cuts the reckless tail and is one field away from either preference. US-101 deliberately declined a 75% _entry_ gate ("a trader preference, not a contract-validity rule"); a screening criterion is exactly where a preference belongs.
- **Alternatives considered:** 75% default (empties results on high-IV names — the very names PMCC is used on); no ratio filter, display only (the epic names "spread efficiency" as a screening criterion, not a column).

### ADR: "IV environment" is an optional IV-rank band on the underlying; term structure stays with US-113

- **Decision:** Two optional fields, `minIvRank` and `maxIvRank` (both `string | null`, off by default), reusing the wheel's `iv_rank_floor` semantics (applies only when the criterion is on **and** a usable reading exists; inclusive) and adding `iv_rank_ceiling` with the mirror reason `IV rank 58.0 (Sep 17) above 55`. Cross-field rule when both are on: floor < ceiling, message `IV-rank floor must be less than IV-rank ceiling`.
- **Why:** For a diagonal opened as one trade, a high IV rank inflates the LEAPS extrinsic the trader is buying and a low one starves the short credit they are selling; traders bound it from both sides. IV rank is the only IV fact the app has for an underlying, and US-113 owns the front-month-vs-back-month comparison on the entry form. Nothing here computes or displays term structure.
- **Alternatives considered:** a single "IV-rank band" control with two inputs (one more component variant for no new behaviour); an implied-volatility-per-leg filter from `OptionChainQuote.impliedVolatility` (the field exists but is dropped today and is exactly the term-structure signal US-113 owns).

### ADR: Earnings are judged against the short call's expiration

- **Decision:** `earnings_in_window` is a **short-leg** filter using the same `earningsHandling` enum and the same `readEarningsOrEmpty` horizon (`shortDteMax + 45`). The LEAPS window is never checked for earnings.
- **Why:** A LEAPS will live through several prints by construction; only the current short cycle is the exposed window, and it is the cycle US-106's assignment-risk alert and the wheel's rule both reason about. Flag mode demotes the pair exactly as US-70 demotes a put (rank cell `—`, badge under the ticker).

### ADR: LEAPS and short-call chains are two pulls through the existing chain service

- **Decision:** `pullWatchlistChains` gains `type: 'put' | 'call'` in its options (default `'put'`, so US-64/65 callers are untouched). `screenWatchlistPmccCandidates` calls it twice — long window then short window, both `type: 'call'` — and zips per ticker. Per-ticker: either window `data_unavailable` → `data_unavailable`; either window `no_options_listed` → `no_options_listed` with a window-specific reason (`no calls quoted in the 180–540 DTE window` / `no calls quoted in the 20–45 DTE window`, long window first). Outage: either pull reports `provider_unavailable` → `provider_unavailable`. Underlying quotes are **always** fetched for the PMCC screen (extrinsic needs them) via the existing isolated `fetchIsolatedStockQuotes`; a missing quote nulls that ticker's extrinsic and nothing else.
- **Why:** The fetch site is the one place `'put'` is hard-coded; a parameter is the smallest change. Two sequential pulls at `CHAIN_FETCH_CONCURRENCY = 4` keep the burst profile US-64 tuned against 429s. Zipping keeps the "every ticker lands in exactly one of ranked/excluded" invariant.
- **Alternatives considered:** one pull spanning `shortDteMin..longDteMax` then splitting by DTE (fetches every monthly and weekly between 45 and 180 DTE that neither leg wants — several times the payload); a new `pullWatchlistCallChains` (duplicates the outage classification).

### ADR: Three new channels, mirroring the three wheel channels

- **Decision:** `screener:pmcc-results`, `screener:get-pmcc-criteria`, `screener:save-pmcc-criteria` on the existing `registerScreenerIpc`, each a thin `handleIpcCall` around one service call; preload `screener.pmccResults()`, `getPmccCriteria()`, `savePmccCriteria(payload)`.
- **Why:** The result types differ (a two-leg candidate is not a `ScoredCandidate`), so one channel would return a union the renderer must narrow on every access. The wheel channels stay payload-free and unchanged, which keeps every US-65–US-98 e2e seam intact.
- **Alternatives considered:** `screener:results` with an optional `{ strategy }` payload returning `ranked: ScoredCandidate[] | PmccScoredCandidate[]` (narrowing everywhere; also changes a payload-free channel's contract).

### ADR: `buildBench` becomes generic over the candidate; the page picks the lens

- **Decision:** `lib/bench.ts` types become `BenchStock<C extends BenchCandidate>` where `BenchCandidate = { ticker: string; earnings: ScreenerCandidateEarnings }`, and `buildBench<C>(snapshot, results: BenchResults<C> | undefined)`. `WatchlistPage` holds `strategy: 'WHEEL' | 'PMCC'`, calls the matching results/criteria hooks (both hooks mount; the inactive one has `enabled: false` so no second fan-out runs), and passes `strategy` down. `BenchCard` and `BenchDetail` switch on it for the second line and the matching card; everything else (rank pill, gates, IVR, thesis, remove, edit) is untouched.
- **Why:** Gate precedence, meets/waiting partitioning and the waiting-reason rules are strategy-independent and must not fork. The only per-strategy knowledge in the bench is how to describe the match.
- **Alternatives considered:** a `BenchMatch` discriminated union inside a non-generic `BenchStock` (every consumer narrows, including the US-68 promote path that only ever sees puts); a second `buildPmccBench` (duplicates the three gate rules the file already warns are duplicated from `watchlist-signal.ts`).

### ADR: The criteria form's field primitives are extracted before the PMCC form is written

- **Decision:** `SheetGroup`, `SheetField`, `Segment`, `NumericInput`, `RangeField`, `OptionalNumericField` and `Divider` move verbatim from `ScreeningCriteriaForm.tsx` into `components/criteria-fields.tsx`. `PmccScreeningCriteriaForm.tsx` composes them; `ScreeningCriteriaSheet` takes a `strategy` prop and renders the matching form at the same 460px width.
- **Why:** The 200-line budget already rules out a second copy inside `ScreeningCriteriaForm.tsx`, and the PMCC form needs every one of them. This is the Simplicity-First kind of extraction — the concepts already have names; nothing new is invented.

### ADR: Promotion of a PMCC match into the entry form is a separate story

- **Decision:** The matching-diagonal card carries **no** `Review trade` action in US-110. The handoff into US-101's PMCC entry form is reserved as **US-122 (OPT-28)** — created 2026-09-20 alongside the story save, per the epic's "point at the story that picks it up" rule (US-121 is taken by the IV-rank rewrite).
- **Why:** US-101 is unbuilt and lists screener promotion as out of scope; US-68 was its own story on the wheel side for the same reason (quote re-fetch, drift banner, one-shot query-string codec). Shipping the seam without the destination is how US-66 handled the same situation.

### ADR: Money and percent formatting reuse the engine's rounding, once

- **Decision:** All ratio and yield strings the renderer shows come from `decimal.js` values the engine emitted at 4dp fractions / 2dp money, formatted by the existing `fmtYieldPercent`, `fmtScore`, `fmtDelta`, `fmtSpread`, `fmtMoney`, plus one new `fmtRatioPercent` (2dp, trailing zeros trimmed, matching `formatPercent`) so the detail panel's `Debit / width 87.82%` and the exclusion reason `debit 87.82% of width exceeds 85%` can never disagree.

## Domain review (options-expert pass, applied)

Reviewed the draft criteria set and the mockup numbers as the options-trading SME persona. Findings and how each was applied:

1. **Ranking vocabulary.** A practitioner's first PMCC check is whether one short cycle recovers a meaningful slice of the LEAPS extrinsic; the second is debit vs width. Neither is a good _sort key_ on its own (see ADR). Applied: rank on `returnPerDelta`; **display** `Extrinsic in LEAPS` and `Recovered per cycle` prominently in the detail card so the practitioner's check is one glance away; caption says "cycle yield", not "return".
2. **The 75% guideline vs reality.** Confirmed by arithmetic: with `Lk ≈ 0.8P`, `Sk ≈ 1.05P`, ratio ≈ `0.8 + (E − S) / 0.25P`, so it dips under 75% only when one short credit exceeds the LEAPS extrinsic. Applied: 90% default, 1–100 bounds, caption explains the 100% structural line and the 75% comfort line.
3. **Extrinsic needs a live underlying price.** Applied: display-only, `—` when the quote is missing, never a filter; the service always fetches quotes for the PMCC lens.
4. **Liquidity is per leg and LEAPS books are thin.** OI on a 490-DTE call is routinely a few hundred. Applied: `minOpenInterest` default **200** for PMCC (wheel keeps 500), applied to each leg with the leg named in the reason; the spread rule (percent-of-mark **or** absolute ≤ $0.10) applies per leg unchanged — a $0.30 spread on a $10.30 LEAPS is 2.9% and passes.
5. **Ex-dividend early assignment on the short call** is a real PMCC failure mode not covered by any criterion here. Applied: named in Out of Scope as a future criterion; nothing in this story claims to catch it.
6. **Earnings only matter for the short cycle** in a screening context. Applied (ADR above).
7. **Mockup arithmetic.** Every displayed number in both mockups was recomputed from the fixture marks: e.g. XLF `$42 LEAPS 10.30 / $53 short 0.64` → debit 9.66, width 11.00, ratio 87.82%, cycle 6.63%, annualised 69.09%, score 2.38, extrinsic 1.10 (price 51.20), recovered 58%. Deltas are plausible for the moneyness and DTE but are fixtures, not model output; DTE derives from the mockup's valuation date (Fri 2026-09-18): Oct 23 2026 = 35, Sep 17 2027 = 364, Jan 21 2028 = 490.
8. **The 0.25–0.35 short delta band and the 20–45 DTE window are the epic's numbers**, also US-101's picker defaults. Kept; they are editable criteria.

## Resolved questions

- **Does the story include the strategy toggle UI or only criteria?** Both — the epic's vertical slice lists "PMCC screener criteria" under Frontend, and criteria without a screen to run them against would be unobservable. Size is 8 points; the plan orders backend areas 1–6 before renderer areas 7–10 so the story can be split at area 7 if the owner prefers two 5-point stories.
- **Where is the strategy control?** Bench header, left of the actions, after the count badge (mockup). Not on the sheet — the sheet edits the strategy the bench is showing.
- **Does US-102's comparator apply here?** In spirit: the LEAPS window must sit strictly beyond the short window (`longDteMin > shortDteMax`), enforced on save with `LEAPS minimum DTE must exceed short-call maximum DTE`. The screener never calls US-102's roll-time comparator; it works on DTE windows, not on two specific expirations.
- **Is US-121 a blocker?** No. It changes how IVR rows are produced, not how `getAssessedIvrByUnderlying` is read.

No `NEEDS CLARIFICATION` items remain. Two decisions are flagged for the story owner but do not block planning: the 90% default ratio, and shipping the toggle inside US-110 rather than splitting.
