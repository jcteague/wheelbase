# Data Model — US-65: Score wheel candidates

US-65 persists nothing new. It **reads** the existing `ivr_snapshot` table and consumes
transient chain data from US-64. Everything below is an in-memory type flowing
engine → service → IPC → (US-66) renderer.

## Core types (`src/main/core/screener.ts`, pure — no DB / provider / logger imports)

### `ScreeningCriteria`

The trader's screen. Ships with built-in defaults here; US-67 persists overrides and
passes them in. All money/ratio fields are `decimal.js`-parseable strings.

```typescript
export type EarningsHandling = 'exclude' | 'flag'

export type ScreeningCriteria = {
  deltaMin: string // absolute delta, e.g. '0.20'
  deltaMax: string // absolute delta, e.g. '0.30'
  dteMin: number // calendar days, inclusive
  dteMax: number // calendar days, inclusive
  minOpenInterest: number // inclusive floor
  maxSpreadPercent: string // percent of mark, e.g. '10'
  maxSpreadAbsolute: string // dollars, e.g. '0.10'
  maxUnderlyingPrice: string | null // null = ceiling disabled (default)
  earningsHandling: EarningsHandling
}

export const DEFAULT_SCREENING_CRITERIA: ScreeningCriteria = {
  deltaMin: '0.20',
  deltaMax: '0.30',
  dteMin: 30,
  dteMax: 45,
  minOpenInterest: 500,
  maxSpreadPercent: '10',
  maxSpreadAbsolute: '0.10',
  maxUnderlyingPrice: null,
  earningsHandling: 'exclude'
}
```

Defaults are the US-65 / US-67 Background block: delta 0.20–0.30, DTE 30–45, OI 500,
spread 10% of mark (or $0.10 absolute), price ceiling off, earnings `exclude`.

### `IvRank`

An IV-rank reading always travels with the time it was taken — IV can re-rate hard
overnight (an earnings print alone moves rank by tens of points), so a bare number
gives no caller a way to judge whether it is still worth acting on. The engine only
carries these; the staleness policy is a display-surface concern (see US-98).

```typescript
export type IvRank = {
  value: string // as stored, 1dp
  observedAt: string // ISO scrape time from ivr_snapshot.observed_at
}
```

### `TickerScreeningInput`

Everything the engine needs for one ticker, as plain values. `null` means "unknown",
never "zero".

```typescript
export type TickerScreeningInput = {
  ticker: string
  strikes: CandidateStrike[] // from core/candidate-chain.ts (US-64)
  ivRank: IvRank | null // latest ivr_snapshot reading + its observedAt; null → renders "n/a"
  underlyingPrice: string | null // StockQuote.price (2dp); null → ceiling can't fire
  earningsDate: string | null // 'YYYY-MM-DD'; null → earnings gate can't fire (US-70 wires)
}
```

### `ScoredCandidate`

One surviving strike, fully scored. Delta is **absolute**.

```typescript
export type ScoredCandidate = {
  ticker: string
  contractId: string
  strike: string // 4dp, as pulled
  expiration: string // 'YYYY-MM-DD'
  dte: number // calendar days from currentDate to expiration
  bid: string // 2dp
  ask: string // 2dp
  mark: string // 2dp, (bid+ask)/2 from the chain — never recomputed
  spreadAbsolute: string // 2dp, ask - bid
  spreadPercent: string // 2dp, (ask - bid) / mark × 100
  delta: string // 4dp, |delta|
  openInterest: number | null
  volume: number | null // soft/display only — never a hard filter in v1
  ivRank: IvRank | null // soft/display only — never a hard filter in v1
  capitalSecured: string // 2dp, strike × 100
  periodYield: string // 4dp fraction, mark / strike
  annualizedYield: string // 4dp fraction, periodYield × 365 / dte
  yieldPerDelta: string // 4dp, annualizedYield / |delta| — the rank score
  timestamp: string // ISO quote time, carried from the strike
}
```

### `ExcludedCandidate`

```typescript
export type ExclusionCode =
  | 'price_ceiling'
  | 'earnings_in_window'
  | 'dte_window'
  | 'delta_unavailable'
  | 'delta_band'
  | 'open_interest'
  | 'spread'

export type ExcludedCandidate = {
  ticker: string
  contractId: string
  strike: string
  expiration: string
  code: ExclusionCode
  reason: string // trader-readable, exact strings below
}
```

### `TickerScreeningResult`

```typescript
export type TickerScreeningResult = {
  ticker: string
  best: ScoredCandidate | null // highest yieldPerDelta survivor, or null
  excluded: ExcludedCandidate[] // sorted closest-to-qualifying first
}
```

### Pure functions

```typescript
export function screenTicker(
  input: TickerScreeningInput,
  criteria: ScreeningCriteria,
  currentDate: Date
): TickerScreeningResult

// Best-per-ticker survivors sorted by yieldPerDelta desc, ticker asc as tie-break.
export function rankCandidates(results: TickerScreeningResult[]): ScoredCandidate[]
```

## Selection logic

### 1. Hard-filter registry (ordered; first failure wins)

Each entry is `{ code, applies, test, reason }`. `applies` returning `false` means the
filter cannot be evaluated (input unknown or criterion disabled) and the candidate
passes it — see the "never exclude on a missing input" ADR.

| #   | `code`               | `applies` when                                               | Excluded when                                                                   | `reason` template                         |
| --- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `price_ceiling`      | `maxUnderlyingPrice !== null` and `underlyingPrice !== null` | `underlyingPrice > maxUnderlyingPrice`                                          | `underlying $412.00 above $75.00 ceiling` |
| 2   | `earnings_in_window` | `earningsHandling === 'exclude'` and `earningsDate !== null` | `earningsDate <= expiration`                                                    | `earnings 2026-07-31 falls before expiry` |
| 3   | `dte_window`         | always                                                       | `dte < 1 \|\| dte < dteMin \|\| dte > dteMax`                                   | `DTE 52 outside 30–45`                    |
| 4   | `delta_unavailable`  | always                                                       | `delta === null`                                                                | `delta unavailable`                       |
| 5   | `delta_band`         | `delta !== null`                                             | `\|delta\| < deltaMin \|\| \|delta\| > deltaMax`                                | `delta 0.42 outside 0.20–0.30`            |
| 6   | `open_interest`      | `openInterest !== null`                                      | `openInterest < minOpenInterest`                                                | `open interest 120 below 500`             |
| 7   | `spread`             | always                                                       | `spreadAbsolute > maxSpreadAbsolute` **and** `spreadPercent > maxSpreadPercent` | `spread 22% exceeds 10%`                  |

Reason formatting (exact — US-66 renders these verbatim):

- delta values 2dp; band bounds 2dp joined by an **en dash** `–` (U+2013), matching the
  AC string `delta 0.42 outside 0.20–0.30`.
- DTE bounds joined by the same en dash.
- spread percentages 0dp with a `%` suffix (`22.22 → 22%`, `10 → 10%`).
- money 2dp with a `$` prefix.
- open interest and DTE as plain integers.

`dte` is `computeDte(expiration, currentDate)` from `src/main/core/dte.ts` (calendar
days, `date-fns`, never string slicing). `dte === null` (unparseable expiration) is
treated as failing `dte_window`.

### 2. Exclusion ordering within a ticker

Sort by filter index **descending** (a candidate that reached filter 7 is closer to
qualifying than one that died at filter 5), tie-broken by original chain order. This
makes `excluded[0]` the ticker's representative reason for US-66's one-row-per-ticker
Excluded section.

### 3. Score math (`decimal.js`, `ROUND_HALF_UP`, rounded once at output)

```
spreadAbsolute  = ask − bid                                    → 2dp
spreadPercent   = (ask − bid) / mark × 100                     → 2dp
capitalSecured  = strike × 100                                 → 2dp
periodYield     = mark / strike                                → 4dp
annualizedYield = periodYield × 365 / dte                      → 4dp
yieldPerDelta   = annualizedYield / |delta|                    → 4dp
```

Calendar 365 (not 252 — that convention belongs to Epic 12). Worked AC examples:

| input                           | periodYield | annualizedYield | delta | yieldPerDelta |
| ------------------------------- | ----------- | --------------- | ----- | ------------- |
| AAPL 180 put, mark 2.70, 37 DTE | `0.0150`    | `0.1480`        | 0.28  | `0.5285`      |
| candidate A, annualized 30%     | —           | `0.3000`        | 0.30  | `1.0000`      |
| candidate B, annualized 24%     | —           | `0.2400`        | 0.20  | `1.2000`      |

### 4. Best strike per ticker

`best` = the survivor with the highest `yieldPerDelta`; ties broken by the lower
`strike` (the more conservative entry). Non-survivors never rank — a high yield does
not rescue an excluded candidate.

### 5. Cross-ticker rank

`rankCandidates` sorts every non-null `best` by `yieldPerDelta` descending, tie-broken
by `ticker` ascending. No `rank` field is emitted; the array order **is** the rank.

## Service types (`src/main/services/screener.ts`)

```typescript
export type ScreenerExclusionCode = ExclusionCode | 'no_options_listed' | 'data_unavailable'

export type ScreenerExclusion = {
  ticker: string
  code: ScreenerExclusionCode
  reason: string
}

export type ScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: ScoredCandidate[] // rank order; empty = nothing survived
  excluded: ScreenerExclusion[] // one row per non-ranking ticker, watchlist order
  quoteTimestamp: string | null // newest ranked strike timestamp, for the stale badge
}

export async function screenWatchlistCandidates(
  provider: MarketDataProvider,
  db: Database.Database,
  opts?: { criteria?: ScreeningCriteria; currentDate?: Date }
): Promise<ScreenerResults>
```

Ticker-level statuses from US-64 map into the same `excluded` list:

| `TickerChainResult.status` | `ScreenerExclusion.code`       | `reason`                  |
| -------------------------- | ------------------------------ | ------------------------- |
| `no_options_listed`        | `no_options_listed`            | `no options listed`       |
| `data_unavailable`         | `data_unavailable`             | `market data unavailable` |
| `ok`, zero survivors       | `excluded[0].code`             | `excluded[0].reason`      |
| `ok`, ≥1 survivor          | — (ticker appears in `ranked`) |                           |

### Orchestration (each boundary isolated)

1. `pullWatchlistChains(provider, db, { window: { min: criteria.dteMin, max: criteria.dteMax }, currentDate })`.
2. If its `status === 'provider_unavailable'` → return the short-circuit result
   (`ranked: []`, `excluded: []`, `quoteTimestamp: null`) without further I/O.
3. IVR join: `getLatestIvrByUnderlying(db, tickers)` inside `try/catch` → degrade to an
   empty `Map` + `logger.warn`. A missing entry is `ivRank: null`, never an exclusion.
4. Underlying prices: only when `criteria.maxUnderlyingPrice !== null`, call
   `provider.getStockQuotes(tickers)` inside `try/catch` → degrade to an empty `Map` +
   `logger.warn`.
5. Earnings: `earningsDate: null` for every ticker until US-70 supplies a calendar.
6. Per `ok` ticker, call `screenTicker` in its **own** `try/catch`; a throw logs at
   error and drops that ticker to `data_unavailable` — it never aborts the batch.
7. `ranked = rankCandidates(results)`; `quoteTimestamp` = max `timestamp` across
   `ranked` (`null` when empty).

## Read path (`src/main/services/ivr-snapshots.ts`)

```typescript
export type IvrSnapshot = { ivr: string; observedAt: string }

export function getLatestIvrByUnderlying(
  db: Database.Database,
  underlyings: string[]
): Map<string, IvrSnapshot> // ticker → latest reading + its scrape time
```

```sql
SELECT ivr, observed_at FROM ivr_snapshot WHERE underlying = ? ORDER BY observed_at DESC LIMIT 1
```

Prepared once, executed per underlying (index `idx_ivr_snapshot_underlying_observed_at_desc`).
Underlyings are upper-cased before lookup, matching how the collector stores them.
Tickers with no row are simply absent from the map.

## Validation rules from the ACs

- A candidate outside the delta band is excluded **even with a high yield** — the score
  is computed only for survivors, so a high score can never rescue an exclusion.
- A missing IVR never excludes; it flows through as `ivRank: null` for US-66's `n/a`.
- A missing OI never excludes (the gate can't be evaluated); OI `0` is a real value and
  is excluded when below the floor.
- The mark used for yield is the chain's 2dp `mark`; the engine never re-derives it from
  bid/ask floats.
  </content>
