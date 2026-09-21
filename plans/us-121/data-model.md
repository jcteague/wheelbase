# Data Model: US-121 — IV30 history and derived IV metrics

Decisions behind every shape here are in `research.md`. Numbers stored as `TEXT` follow the repo
convention (`decimal.js`, `ROUND_HALF_UP`, 4 dp) unless a column says otherwise.

## 1. Tables (migration `016_create_iv30_history.sql`)

### `iv30_reading`

One row per `(underlying, session, method)`: the session's IV30 **and the inputs that produced
it**. Rows are never deleted when they age out of the window.

| Column             | Type                                             | Notes                                                                                                  |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `underlying`       | TEXT NOT NULL                                    | Upper-cased ticker                                                                                     |
| `session`          | TEXT NOT NULL                                    | `YYYY-MM-DD`, the Eastern session day (from `etDateOf(bar.t)`)                                         |
| `method`           | TEXT NOT NULL DEFAULT `'daily_vwap'`             | Input method; a later minute-bar method is a new value, not a schema change                            |
| `engine_version`   | INTEGER NOT NULL                                 | `IV30_ENGINE_VERSION` that produced `iv30`; rows behind the current version are recomputed from inputs |
| `observed_at`      | TEXT NOT NULL                                    | ISO instant of the session's close (`trading_session.close_at`), per US-100                            |
| `iv30`             | TEXT NOT NULL                                    | 4 dp, e.g. `0.2475`                                                                                    |
| `underlying_vwap`  | TEXT NOT NULL                                    | 4 dp, SIP daily VWAP                                                                                   |
| `expiration_tier`  | TEXT NOT NULL CHECK IN (`'weekly'`, `'monthly'`) | Which tier produced the pair                                                                           |
| `near_expiration`  | TEXT NOT NULL                                    | `YYYY-MM-DD`                                                                                           |
| `near_strike`      | TEXT NOT NULL                                    | 4 dp                                                                                                   |
| `near_call_vwap`   | TEXT NOT NULL                                    | 4 dp                                                                                                   |
| `near_call_trades` | INTEGER NOT NULL                                 | daily bar `n`                                                                                          |
| `near_put_vwap`    | TEXT NOT NULL                                    | 4 dp                                                                                                   |
| `near_put_trades`  | INTEGER NOT NULL                                 |                                                                                                        |
| `far_expiration`   | TEXT                                             | NULL when a single expiration was used (exactly 30 DTE, or one-sided bracket)                          |
| `far_strike`       | TEXT                                             | NULL with `far_expiration`                                                                             |
| `far_call_vwap`    | TEXT                                             |                                                                                                        |
| `far_call_trades`  | INTEGER                                          |                                                                                                        |
| `far_put_vwap`     | TEXT                                             |                                                                                                        |
| `far_put_trades`   | INTEGER                                          |                                                                                                        |
| `rate`             | TEXT NOT NULL                                    | 4 dp, `0.0450`                                                                                         |
| `dividend_yield`   | TEXT NOT NULL                                    | 4 dp, `0.0000`                                                                                         |

Primary key `(underlying, session, method)`. Index `idx_iv30_reading_underlying_session_desc ON
(underlying, session DESC)` for "latest reading" and window reads. All six `far_*` columns are
NULL together or set together (enforced by the writer, not a CHECK).

### `iv30_gap`

One row per `(underlying, session, method)` the engine attempted and could not read.

| Column         | Type                                                                  | Notes                  |
| -------------- | --------------------------------------------------------------------- | ---------------------- |
| `underlying`   | TEXT NOT NULL                                                         |                        |
| `session`      | TEXT NOT NULL                                                         |                        |
| `method`       | TEXT NOT NULL DEFAULT `'daily_vwap'`                                  |                        |
| `reason`       | TEXT NOT NULL CHECK IN (`'no_underlying_bar'`, `'no_tradeable_pair'`) |                        |
| `attempted_at` | TEXT NOT NULL                                                         | ISO instant of the run |

Primary key `(underlying, session, method)`. A gap is never written for the most recent completed
session (it is retried by the next run). A gap row is deleted if a later run — e.g. a forced
re-probe after a selection fix — produces a reading for that session (delete-then-insert inside
the same transaction).

### `ivr_snapshot` (migration 007) — dropped

Migration 016 ends with `DROP TABLE ivr_snapshot` (its index goes with it). The rows were Barchart's
rank — a different quantity from ours, never comparable, and stale past the ten-session boundary
within two weeks of the scrape dying. Nothing writes or reads it after this story, so a retained
table would only be spec drift.

### `trading_session` (existing, migration 015)

Unchanged shape. The store now reads 400 days back / 50 ahead and refreshes 420 back / 400 ahead.

## 2. Core types (`src/main/core/`)

### `black-scholes.ts`

```ts
export type OptionType = 'call' | 'put'
export function normalCdf(x: number): number
export function blackScholesPrice(input: {
  type: OptionType
  spot: number
  strike: number
  yearsToExpiry: number
  rate: number
  dividendYield: number
  volatility: number
}): number
/** null when price ≤ discounted intrinsic or the bisection does not bracket. */
export function impliedVolatility(input: {
  type: OptionType
  price: number
  spot: number
  strike: number
  yearsToExpiry: number
  rate: number
  dividendYield: number
}): number | null
```

### `iv30-selection.ts`

```ts
export const TARGET_DTE = 30
export const MIN_DTE = 7
export const STRIKE_INCREMENTS = [0.5, 1, 2.5, 5] as const

export type ExpirationPair = { near: string; far: string | null } // YYYY-MM-DD
export type ExpirationTier = 'weekly' | 'monthly'

/** Fridays in [session+MIN_DTE, session+45], each shifted to the prior session when it is a closure. */
export function weeklyCandidates(session: string, sessions: readonly string[]): string[]
/** Third Fridays in [session+MIN_DTE, session+70], shifted the same way. */
export function monthlyCandidates(session: string, sessions: readonly string[]): string[]
/** Largest ≤ TARGET_DTE and smallest > TARGET_DTE among candidates with DTE ≥ MIN_DTE; exactly 30 → alone; one-sided → nearest alone; none → null. */
export function selectExpirationPair(
  session: string,
  candidates: readonly string[]
): ExpirationPair | null
/** floor/ceil of `price` at each increment, deduplicated, nearest to `price` first. */
export function strikeCandidates(price: number): number[]
export function daysToExpiry(session: string, expiration: string): number

export type SessionProbePlan = {
  session: string
  weekly: { pair: ExpirationPair; symbols: string[] } | null
  monthly: { pair: ExpirationPair; symbols: string[] } | null
}
/** Every OCC symbol (C and P × strike × expiration) to request for one session. */
export function planSessionProbe(input: {
  underlying: string
  session: string
  underlyingPrice: number
  sessions: readonly string[]
}): SessionProbePlan
```

`daysToExpiry` uses `date-fns` `differenceInCalendarDays` on the ISO days. OCC symbols come
from `buildOccSymbol` (`core/option-symbol.ts`).

### `iv30.ts`

```ts
export const IV30_METHOD = 'daily_vwap'
export const IV30_ENGINE_VERSION = 1
export const DEFAULT_RISK_FREE_RATE = '0.0450'
export const DEFAULT_DIVIDEND_YIELD = '0.0000'
export const MIN_TRADES_PER_LEG = 1

export type DailyBar = {
  date: string
  vwap: string
  close: string
  volume: number
  tradeCount: number
}

export type LegSelection = {
  expiration: string
  strike: string // 4 dp
  callVwap: string
  callTrades: number // 4 dp
  putVwap: string
  putTrades: number
}

export type Iv30Inputs = {
  session: string
  underlyingVwap: string
  tier: ExpirationTier
  near: LegSelection
  far: LegSelection | null
  rate: string
  dividendYield: string
}

export type Iv30Reading = Iv30Inputs & { iv30: string; engineVersion: number }

export type Iv30GapReason = 'no_underlying_bar' | 'no_tradeable_pair'

export type Iv30Outcome =
  | { status: 'reading'; reading: Iv30Reading }
  | { status: 'gap'; reason: Iv30GapReason }

/** Pure: pick the strike per expiration (nearest first, both legs traded and both invert), average call/put IV, interpolate in total variance. */
export function computeIv30(input: {
  plan: SessionProbePlan
  underlyingBar: DailyBar | undefined
  optionBars: ReadonlyMap<string, DailyBar> // symbol → that session's bar
  rate?: string
  dividendYield?: string
}): Iv30Outcome

/** Pure: the same arithmetic over stored inputs. null when an inversion fails on the stored inputs (logged by the caller, row left as is). */
export function iv30FromInputs(inputs: Iv30Inputs): string | null
```

Rules encoded in `computeIv30`:

1. No underlying bar for the session → `gap: no_underlying_bar`.
2. For each tier in order (`weekly`, then `monthly`), for each expiration in the pair, walk the
   strikes nearest-first; the first strike whose call **and** put both have a bar with
   `tradeCount ≥ MIN_TRADES_PER_LEG` **and** both invert wins. If either expiration in the tier
   finds no strike, the tier fails. First tier that succeeds is used and recorded.
3. Both tiers fail → `gap: no_tradeable_pair`.
4. Per expiration IV = mean(callIV, putIV). `far === null` → `iv30 = nearIV`. Otherwise
   `T = DTE / 365`, `w30 = nearIV²·T_near·(1−λ) + farIV²·T_far·λ`, `λ = (T30 − T_near)/(T_far −
T_near)`, `iv30 = sqrt(w30 / T30)`.
5. Output strings are `Decimal(...).toFixed(4)`.

### `iv-metrics.ts`

```ts
export const RANK_WINDOW_SESSIONS = 252
export const MIN_WINDOW_COVERAGE = 200

export type IvMetrics = {
  rank: number | null // integer 0..100, null when high === low
  percentile: number // integer 0..100
  low: string // 4 dp, window min
  high: string // 4 dp, window max
  coverage: number // readings in window
}

/**
 * Pure. `windowSessions` = the 252 sessions strictly before the anchor, ascending (caller derives
 * them from the calendar). `readings` maps session → iv30 for any session (anchor included).
 * Returns null when fewer than MIN_WINDOW_COVERAGE window sessions have a reading.
 */
export function computeIvMetrics(input: {
  anchorIv30: string
  windowSessions: readonly string[]
  readings: ReadonlyMap<string, string>
}): IvMetrics | null
```

Rounding: `new Decimal(x).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()`. Clamp rank to
`[0, 100]` before rounding. Percentile counts readings **strictly below** `anchorIv30`.

### `ivr-freshness.ts` (amended)

```ts
export type IvRankReading = {
  value: string | null // integer rank as string, null for a flat window
  percentile: string // integer as string
  low: string // 4 dp
  high: string // 4 dp
  observedAt: string // anchor session close
}
export type AssessedIvRank = IvRankReading & { ageTradingDays: number; state: IvRankState }
export function assessIvRank(reading: IvRankReading, ctx: AssessContext): IvRankAssessment
```

`validReading` accepts `value === null`; a non-null `value` must still be a finite number string.
`percentile`, `low`, `high` must be finite number strings. Everything else is unchanged.

`core/screener.ts` `IvRank = { value: string; observedAt }` is unchanged; only usable readings
with a non-null value reach it (`usableIvRanks` in `services/screener.ts`).

## 3. Service types (`src/main/services/iv-history.ts`)

```ts
export type IvHistoryTickerOutcome =
  | { status: 'collected'; readings: number; gaps: number }
  | { status: 'up_to_date' }
  | { status: 'failed' }

export type CollectIvHistoryInput = {
  db: Database.Database
  provider: IvHistoryBarSource
  calendar: TradingCalendar
  now: Date
  ticker: string
  logger: CollectorLogger
}

/** Required sessions = the RANK_WINDOW_SESSIONS + 1 most recent completed sessions at `now`. Missing = required − readings − gaps. */
export function listMissingSessions(db, ticker, requiredSessions: readonly string[]): string[]
export async function collectIvHistory(
  input: CollectIvHistoryInput
): Promise<IvHistoryTickerOutcome>
export function recomputeIvHistory(
  db,
  opts?: { ticker?: string; force?: boolean }
): { recomputed: number; unrecomputable: number }
export function readIvMetricsByUnderlying(
  db,
  tickers: string[],
  calendar: TradingCalendar
): Map<string, IvRankReading | null>
```

`collectIvHistory`, in order: `recomputeIvHistory(db, { ticker })` → required sessions → missing
sessions (return `up_to_date` if none) → `end` rule (omit when the newest completed session is
today's Eastern day, else that session's date) → `getStockDailyBars` → per missing session with a
stock bar: `planSessionProbe` → union of symbols → `getOptionDailyBars` → per session
`computeIv30` → one transaction writing readings (delete any matching gap first) and gaps (never
for the newest completed session) → `collected`. A `MarketDataError('auth_failed')` is rethrown
for the batch to classify; anything else → `failed` after a WARN.

`readIvMetricsByUnderlying`: anchor = latest reading; window = the 252 sessions strictly before
`anchor.session` on `calendar` (if the calendar cannot supply 252 sessions before the anchor,
the window is what it holds and coverage is judged against 252 all the same — an unknown session
counts as missing); readings in `[first window session, anchor]`; `computeIvMetrics`; map to
`IvRankReading` with `observedAt = anchor.observed_at`. A ticker with no reading, or metrics
`null`, maps to `null`.

## 4. Batch result (`collectIVRSnapshots`, amended)

```ts
type CollectIVRSnapshotsResult = {
  successCount: number // tickers with status 'collected'
  errorCount: number // 'failed'
  skippedCount: number // 'up_to_date'
  skippedReason: 'market_data_unavailable' | null // 'market_closed' removed: a closed-day run is simply up_to_date
}
```

## 5. Validation rules from the acceptance criteria

| Rule                                                            | Where enforced                                                            | Scenario                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Rank = `(today − low)/(high − low) × 100`, half-up integer      | `computeIvMetrics`                                                        | IV rank is computed from the app's own IV history                 |
| Percentile = strictly-below count / window count × 100, half-up | `computeIvMetrics`                                                        | IV percentile is computed alongside IV rank                       |
| Low/high = window min/max, today excluded                       | `computeIvMetrics`                                                        | The IV range behind the rank is reported with it                  |
| Rank clamped to 0..100; high still reports window max           | `computeIvMetrics`                                                        | A reading outside the window's range is clamped                   |
| `high === low` → rank null, percentile still published          | `computeIvMetrics` → `value: null`                                        | A flat window withholds rank but not percentile                   |
| Coverage < 200 of 252 → all metrics null                        | `computeIvMetrics`                                                        | Too sparse / young history                                        |
| Engine version behind → recompute from inputs, no fetch         | `recomputeIvHistory`                                                      | A corrected engine recomputes…                                    |
| Read path makes no provider call                                | `readIvMetricsByUnderlying` is sync, DB-only                              | Reading IV metrics makes no market-data request                   |
| Add returns before backfill                                     | `addWatchlistEntry` → `void ivrOnDemand.collect` (unchanged)              | Adding a ticker does not wait on its backfill                     |
| One ticker's failure isolated                                   | per-ticker `try/catch` in `collectIVRSnapshots`                           | One ticker's backfill failure leaves the others intact            |
| Backfill and catch-up are one path                              | `listMissingSessions`                                                     | Missed sessions are caught up by the next daily run               |
| Untraded leg → next strike; strike + trades stored              | `computeIv30` rule 2; `near_*` columns                                    | An untraded strike is skipped for its neighbour                   |
| Weekly fails → monthly; tier stored                             | `computeIv30` rule 2; `expiration_tier`                                   | Thin weeklies fall back to the monthly expirations                |
| No pair anywhere → gap row, no reading                          | `computeIv30` rule 3; `iv30_gap`                                          | A day with no tradeable ATM pair is left as a gap                 |
| Today from the same engine, no vendor IV                        | `collectIvHistory` → `computeIv30`                                        | Today's reading is computed the same way as the history           |
| `end` omitted or a completed session; never today               | `collectIvHistory` end rule                                               | Bar requests never name the current calendar day as their end     |
| `observed_at` = session close                                   | `trading_session.close_at` on write                                       | Today's reading is available the same evening                     |
| `ivr_snapshot` dropped; only `iv30_reading` is read             | migration 016; `getAssessedIvrByUnderlying` → `readIvMetricsByUnderlying` | Barchart readings are removed on upgrade                          |
| No credentials → skip + log, add succeeds                       | auth abort in `collectIVRSnapshots`; `IvrOnDemand.collect` never rejects  | No market-data credentials leaves IV rank unavailable, not broken |
| Floor: `< floor` excluded, `= floor` included, null → unchanged | `iv_rank_floor` on `IvRank.value` via `usableIvRanks`                     | The computed rank drives the screener floor                       |
| DTE < 7 excluded, 7 used                                        | `selectExpirationPair`                                                    | Expirations too near expiry are excluded from IV30                |
