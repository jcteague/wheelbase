# Data Model: US-110

**No migration.** One new key in the existing `app_settings` table, `pmcc_screening_criteria`, holding a JSON document exactly as `screening_criteria` does (US-67). `positions`, `legs`, `ivr_snapshot`, `trading_session`, `watchlist` are untouched. Nothing about a screen is persisted.

## `PmccScreeningCriteria` — `src/main/core/pmcc-screener.ts`

```typescript
export type PmccScreeningCriteria = {
  // LEAPS (long call) leg
  longDeltaMin: string // absolute delta, e.g. '0.70'
  longDeltaMax: string // '0.85'
  longDteMin: number // calendar days, inclusive
  longDteMax: number
  // Short call leg
  shortDeltaMin: string // '0.25'
  shortDeltaMax: string // '0.35'
  shortDteMin: number
  shortDteMax: number
  // Pair
  maxDebitToWidthPercent: string // percent of strike width, e.g. '90'
  // Liquidity — applied to each leg independently
  minOpenInterest: number
  maxSpreadPercent: string // percent of the leg's mark
  maxSpreadAbsolute: string // dollars; persisted, not editable (same as wheel)
  // IV environment — both optional, null = off
  minIvRank: string | null
  maxIvRank: string | null
  // Policy — judged against the short call's expiration
  earningsHandling: EarningsHandling // reused from core/screener.ts
}

export const DEFAULT_PMCC_SCREENING_CRITERIA: PmccScreeningCriteria = {
  longDeltaMin: '0.70',
  longDeltaMax: '0.85',
  longDteMin: 180,
  longDteMax: 540,
  shortDeltaMin: '0.25',
  shortDeltaMax: '0.35',
  shortDteMin: 20,
  shortDteMax: 45,
  maxDebitToWidthPercent: '90',
  minOpenInterest: 200,
  maxSpreadPercent: '10',
  maxSpreadAbsolute: '0.10',
  minIvRank: null,
  maxIvRank: null,
  earningsHandling: 'exclude'
}
```

| Field                    | Type             | Default     | Editable in the sheet | Bound                              |
| ------------------------ | ---------------- | ----------- | --------------------- | ---------------------------------- |
| `longDeltaMin/Max`       | `string`         | `0.70/0.85` | yes                   | `DELTA_MIN..DELTA_MAX` (0.01–0.99) |
| `longDteMin/Max`         | `number`         | `180/540`   | yes                   | `1..LONG_DTE_MAX` (730)            |
| `shortDeltaMin/Max`      | `string`         | `0.25/0.35` | yes                   | 0.01–0.99                          |
| `shortDteMin/Max`        | `number`         | `20/45`     | yes                   | `DTE_MIN..DTE_MAX` (1–365)         |
| `maxDebitToWidthPercent` | `string`         | `'90'`      | yes                   | `DEBIT_TO_WIDTH_MIN..MAX` (1–100)  |
| `minOpenInterest`        | `number`         | `200`       | yes                   | ≥ 0                                |
| `maxSpreadPercent`       | `string`         | `'10'`      | yes                   | 1–50                               |
| `maxSpreadAbsolute`      | `string`         | `'0.10'`    | **no**                | ≥ 0                                |
| `minIvRank`              | `string \| null` | `null`      | yes (Off/On)          | 0–100                              |
| `maxIvRank`              | `string \| null` | `null`      | yes (Off/On)          | 0–100                              |
| `earningsHandling`       | enum             | `'exclude'` | yes                   | —                                  |

### Cross-field rules (service `assertValid` + renderer `RULES`, same order)

| Rule                                       | Field it binds to | Code                  | Message                                                |
| ------------------------------------------ | ----------------- | --------------------- | ------------------------------------------------------ |
| `longDeltaMin < longDeltaMax`              | `longDeltaMax`    | `inverted_band`       | `Minimum delta must be less than maximum delta`        |
| `shortDeltaMin < shortDeltaMax`            | `shortDeltaMax`   | `inverted_band`       | `Minimum delta must be less than maximum delta`        |
| `longDteMin < longDteMax`                  | `longDteMax`      | `inverted_band`       | `Minimum DTE must be less than maximum DTE`            |
| `shortDteMin < shortDteMax`                | `shortDteMax`     | `inverted_band`       | `Minimum DTE must be less than maximum DTE`            |
| `longDteMin > shortDteMax`                 | `longDteMin`      | `overlapping_windows` | `LEAPS minimum DTE must exceed short-call maximum DTE` |
| `minIvRank < maxIvRank` when both non-null | `maxIvRank`       | `inverted_band`       | `IV-rank floor must be less than IV-rank ceiling`      |

Per-field bounds run first, so an ordering rule fires only once both of its ends are legal (US-67's precedence rule).

### New constants and messages — `src/main/core/screening-criteria.ts`

```typescript
export const LONG_DTE_MAX = 730
export const DEBIT_TO_WIDTH_MIN = 1
export const DEBIT_TO_WIDTH_MAX = 100

export const LONG_DTE_MAX_MESSAGE = `LEAPS DTE must be at most ${LONG_DTE_MAX}`
export const DEBIT_TO_WIDTH_MESSAGE = `Max debit / width must be between ${DEBIT_TO_WIDTH_MIN}% and ${DEBIT_TO_WIDTH_MAX}%`
export const IV_RANK_CEILING_MESSAGE = `IV rank ceiling must be between ${IV_RANK_MIN} and ${IV_RANK_MAX}`
export const IV_RANK_INVERTED_MESSAGE = 'IV-rank floor must be less than IV-rank ceiling'
export const DTE_WINDOWS_OVERLAP_MESSAGE = 'LEAPS minimum DTE must exceed short-call maximum DTE'

export function isLongDteInRange(value: number | string): boolean // whole number, 1..730
export function isDebitToWidthInRange(value: number | string): boolean
export function isIvRankCeilingInRange(value: number | string): boolean // same bound as the floor
```

`isDeltaInRange`, `isDteInRange`, `isOpenInterestInRange`, `isSpreadPercentInRange`, `isSpreadAbsoluteInRange`, `isIvRankFloorInRange`, `isAscending` are reused unchanged.

## Engine input and output — `src/main/core/pmcc-screener.ts`

```typescript
/** Everything the engine needs for one ticker. `null` means unknown, never zero. */
export type PmccTickerScreeningInput = {
  ticker: string
  longCalls: CandidateStrike[] // every call quoted in the LEAPS window
  shortCalls: CandidateStrike[] // every call quoted in the short window
  ivRank: IvRank | null // usable readings only (service filters, as US-98)
  underlyingPrice: string | null // for extrinsic; null never excludes
  earnings: EarningsLookup
}

export type PmccLeg = {
  contractId: string
  strike: string
  expiration: string
  dte: number
  bid: string
  ask: string
  mark: string
  spreadAbsolute: string // 2dp
  spreadPercent: string // 2dp
  delta: string // 4dp, absolute
  openInterest: number | null
  volume: number | null
  timestamp: string
}

export type PmccScoredCandidate = {
  ticker: string
  long: PmccLeg
  short: PmccLeg
  ivRank: IvRank | null
  netDebit: string // 2dp per share: long.mark − short.mark
  capitalAtRisk: string // 2dp: netDebit × 100
  strikeWidth: string // 2dp: short.strike − long.strike
  debitToWidthPercent: string // 2dp
  cycleYield: string // 4dp fraction: short.mark / netDebit
  annualizedYield: string // 4dp fraction: cycleYield × 365 / short.dte
  returnPerDelta: string // 4dp: annualizedYield / short.delta — the rank score
  longExtrinsic: string | null // 2dp: long.mark − max(0, price − long.strike); null without a price
  extrinsicCoverage: string | null // 4dp fraction: short.mark / longExtrinsic; null if no/zero extrinsic
  earnings: CandidateEarnings // judged on the short leg
  timestamp: string // newer of the two leg timestamps
}

export type PmccExclusionCode =
  | 'iv_rank_floor'
  | 'iv_rank_ceiling'
  | 'earnings_in_window'
  | 'dte_window'
  | 'delta_unavailable'
  | 'delta_band'
  | 'open_interest'
  | 'spread'
  | 'short_strike_not_above_long'
  | 'debit_to_width'

export type PmccLegRole = 'long' | 'short'

export type PmccExcludedCandidate = {
  ticker: string
  /** Which stage refused it — a ticker-level, one leg, or the pair. */
  stage: 'ticker' | PmccLegRole | 'pair'
  contractId: string | null // the offending leg's contract; null for ticker-level
  code: PmccExclusionCode
  reason: string
}

export type PmccTickerScreeningResult = {
  ticker: string
  best: PmccScoredCandidate | null
  excluded: PmccExcludedCandidate[] // closest miss first (deepest stage, then deepest index)
}

export function screenPmccTicker(
  input: PmccTickerScreeningInput,
  criteria: PmccScreeningCriteria,
  currentDate: Date
): PmccTickerScreeningResult

export function rankPmccCandidates(results: PmccTickerScreeningResult[]): PmccScoredCandidate[]
```

### Filter funnel (ordered; first failure wins at each stage)

| Stage  | #   | Code                          | Applies when                              | Excludes when                                              | Reason (verbatim shape)                                   |
| ------ | --- | ----------------------------- | ----------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| ticker | 0   | `iv_rank_floor`               | `minIvRank !== null && ivRank !== null`   | `ivRank.value < minIvRank`                                 | `IV rank 22.0 (Sep 17) below 30`                          |
| ticker | 1   | `iv_rank_ceiling`             | `maxIvRank !== null && ivRank !== null`   | `ivRank.value > maxIvRank`                                 | `IV rank 58.0 (Sep 17) above 55`                          |
| long   | 0   | `dte_window`                  | always                                    | dte null or outside `longDteMin–longDteMax`                | `LEAPS DTE 120 outside 180–540` / `LEAPS DTE unavailable` |
| long   | 1   | `delta_unavailable`           | always                                    | delta null                                                 | `LEAPS delta unavailable`                                 |
| long   | 2   | `delta_band`                  | delta known                               | outside `longDeltaMin–longDeltaMax`                        | `LEAPS delta 0.62 outside 0.70–0.85`                      |
| long   | 3   | `open_interest`               | OI known                                  | `< minOpenInterest`                                        | `LEAPS open interest 80 below 200`                        |
| long   | 4   | `spread`                      | always                                    | abs > `maxSpreadAbsolute` **and** pct > `maxSpreadPercent` | `LEAPS spread 12.5% exceeds 10%`                          |
| short  | 0   | `earnings_in_window`          | `earningsHandling === 'exclude' && found` | print on/after today and on/before short expiry            | `earnings 2026-09-21 falls on or before expiry`           |
| short  | 1   | `dte_window`                  | always                                    | outside `shortDteMin–shortDteMax`                          | `short call DTE 60 outside 20–45`                         |
| short  | 2   | `delta_unavailable`           | always                                    | delta null                                                 | `short call delta unavailable`                            |
| short  | 3   | `delta_band`                  | delta known                               | outside `shortDeltaMin–shortDeltaMax`                      | `short call delta 0.41 outside 0.25–0.35`                 |
| short  | 4   | `open_interest`               | OI known                                  | `< minOpenInterest`                                        | `short call open interest 120 below 200`                  |
| short  | 5   | `spread`                      | always                                    | as above                                                   | `short call spread 14% exceeds 10%`                       |
| pair   | 0   | `short_strike_not_above_long` | always (structural, no criterion)         | `short.strike <= long.strike`                              | `short strike $40.00 not above LEAPS strike $42.00`       |
| pair   | 1   | `debit_to_width`              | always                                    | `debitToWidthPercent > maxDebitToWidthPercent`             | `debit 93.84% of width exceeds 90%`                       |

A ticker-level failure short-circuits everything (one excluded row). A leg with no survivors leaves the ticker with `best: null` and the closest-miss leg reason. Pairs are every surviving long × every surviving short; the ticker's `excluded` lists leg and pair failures with the deepest stage first (`pair` > `short` > `long` > `ticker`), then deepest index, so `excluded[0]` is the nearest miss the trader can act on.

### Representative-exclusion precedence for the service (`representativeExclusion`)

Mirrors `services/screener.ts:199`: `excluded[0]` of the ticker result, else `data_unavailable`. Chain-level codes added: `no_options_listed` with two reasons — `no calls quoted in the 180–540 DTE window` (long window checked first) or `no calls quoted in the 20–45 DTE window`.

## Service result — `src/main/services/pmcc-screener.ts`

```typescript
export type RankedPmccCandidate = Omit<PmccScoredCandidate, 'ivRank'> & {
  ivRank: AssessedIvRank | null // the full assessed reading, as RankedCandidate does
}

export type PmccScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: RankedPmccCandidate[] // rank order; one pair per ticker
  excluded: ScreenerExclusion[] // reused type: { ticker, code, reason }; code widened to include the PMCC codes
  quoteTimestamp: string | null
}
```

`ScreenerExclusion.code` becomes `ScreenerExclusionCode | PmccExclusionCode` at the service layer. The renderer's `ScreenerExclusion` type mirrors it.

## Renderer types

- `src/renderer/src/api/pmcc-screener.ts` — `PmccScreenerCandidate` (field-for-field alias of `IpcPmccScoredCandidate`), `PmccScreenerResults`, `getPmccScreenerResults()`.
- `src/renderer/src/api/pmcc-screening-criteria.ts` — `PmccScreeningCriteria`, `SavePmccScreeningCriteriaPayload = Omit<PmccScreeningCriteria, 'maxSpreadAbsolute'>`, adapters.
- `src/renderer/src/lib/bench.ts` — `BenchCandidate = { ticker: string; earnings: ScreenerCandidateEarnings }`, `BenchStock<C extends BenchCandidate>`, `Bench<C>`, `BenchResults<C> = { status; ranked: C[]; excluded: ScreenerExclusion[] }`, `buildBench<C>`. `ScreenerCandidate` and `PmccScreenerCandidate` both satisfy `BenchCandidate`.
- `src/renderer/src/lib/bench-strategy.ts` — `BenchStrategy = 'WHEEL' | 'PMCC'`, `BENCH_STRATEGY_LABEL`.

## Form model — `src/renderer/src/schemas/pmcc-screening-criteria.ts`

All numerics `z.string()` (typeable `'0.'`), two booleans for the optional IV band:

```typescript
const fields = z.object({
  longDeltaMin: z.string(),
  longDeltaMax: z.string(),
  longDteMin: z.string(),
  longDteMax: z.string(),
  shortDeltaMin: z.string(),
  shortDeltaMax: z.string(),
  shortDteMin: z.string(),
  shortDteMax: z.string(),
  maxDebitToWidthPercent: z.string(),
  minOpenInterest: z.string(),
  maxSpreadPercent: z.string(),
  ivRankFloorEnabled: z.boolean(),
  minIvRank: z.string(),
  ivRankCeilingEnabled: z.boolean(),
  maxIvRank: z.string(),
  earningsHandling: z.enum(['exclude', 'flag'])
})
```

`RULES` registry order: each field's bound, then that band's inversion, then `overlapping_windows` on `longDteMin`, then the IV band inversion on `maxIvRank` (only when both toggles are on). `toFormValues` / `toPayload` mirror US-67 (`null` ⇄ toggle off).

## Mockup values the e2e fixtures must reproduce (valuation Fri 2026-09-18; short expiry 2026-10-23 = 35 DTE)

| Ticker | Price  | LEAPS (exp · DTE)            | L mark | L Δ  | Short     | S mark | S Δ  | Debit | Width | Ratio  | Cycle | Ann.   | Score | Extr. | Recovered |
| ------ | ------ | ---------------------------- | ------ | ---- | --------- | ------ | ---- | ----- | ----- | ------ | ----- | ------ | ----- | ----- | --------- |
| XLF    | 51.20  | $42.00 C · 2028-01-21 · 490  | 10.30  | 0.81 | $53.00 C  | 0.64   | 0.29 | 9.66  | 11.00 | 87.82% | 6.63% | 69.09% | 2.38  | 1.10  | 58.18%    |
| KO     | 68.90  | $57.50 C · 2028-01-21 · 490  | 13.20  | 0.82 | $72.50 C  | 0.62   | 0.25 | 12.58 | 15.00 | 83.87% | 4.93% | 51.4%  | 2.06  | 1.80  | 34.44%    |
| AAPL   | 178.40 | $140.00 C · 2027-09-17 · 364 | 45.90  | 0.81 | $190.00 C | 2.45   | 0.27 | 43.45 | 50.00 | 86.9%  | 5.64% | 58.8%  | 2.18  | 7.50  | 32.67%    |
| PEP    | 171.30 | $140.00 C · 2027-09-17 · 364 | 36.40  | 0.80 | $180.00 C | 1.85   | 0.27 | 34.55 | 40.00 | 86.38% | 5.35% | 55.84% | 2.07  | 5.10  | 36.27%    |
| DIS    | 112.40 | $90.00 C · 2027-09-17 · 364  | 27.60  | 0.79 | $120.00 C | 1.35   | 0.26 | 26.25 | 30.00 | 87.5%  | 5.14% | 53.63% | 2.06  | 5.20  | 25.96%    |
| AMD    | 156.20 | $110.00 C · 2027-09-17 · 364 | 60.20  | 0.80 | $170.00 C | 3.90   | 0.29 | 56.30 | 60.00 | 93.84% | —     | —      | —     | —     | excluded  |

Meets criteria at defaults: XLF #1, KO #2. AAPL held back by its price condition; PEP (stale IVR), DIS (expired IVR) held back by their IV conditions; MSFT held back by earnings in 3 days; ORCL held back by a reading that predates earnings; AMD excluded `debit 93.84% of width exceeds 90%`; XYZ excluded `no calls quoted in the 180–540 DTE window`. Tightening the ratio to 85% drops XLF (`debit 87.82% of width exceeds 85%`) and leaves KO #1.
