// [US-65] screener — pure engine that disqualifies put strikes against the trader's
// hard criteria, scores the survivors on premium yield, and ranks them by
// yield-per-delta. No DB, provider, or logger imports: plain values in, plain
// results out.
import Decimal from 'decimal.js'
import { compareAsc, format, parseISO, startOfDay } from 'date-fns'
import type { CandidateStrike } from './candidate-chain'
import { computeDte } from './dte'

/** Calendar-day annualization basis — the wheel is a calendar-time trade, so 365,
 *  never the 252 trading days used by the volatility work in Epic 12. */
const DAYS_PER_YEAR = 365

const SHARES_PER_CONTRACT = 100

export type EarningsHandling = 'exclude' | 'flag'

export type ScreeningCriteria = {
  deltaMin: string // absolute delta, e.g. '0.20'
  deltaMax: string // absolute delta, e.g. '0.30'
  dteMin: number // calendar days, inclusive
  dteMax: number // calendar days, inclusive
  minOpenInterest: number // inclusive floor
  maxSpreadPercent: string // percent of mark, e.g. '10'
  maxSpreadAbsolute: string // dollars, e.g. '0.10'
  maxUnderlyingPrice: string | null // null = ceiling disabled
  minIvRank: string | null // null = floor disabled
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
  minIvRank: null,
  earningsHandling: 'exclude'
}

/**
 * An IV-rank reading and when it was taken. The two always travel together: IV can
 * re-rate hard overnight — an earnings print alone can move rank by tens of points —
 * so a bare number gives a caller no way to judge whether it is still worth acting
 * on. The engine only carries these values; deciding what counts as too stale is a
 * display-surface concern.
 */
export type IvRank = {
  value: string // as stored, 1dp
  observedAt: string // ISO timestamp of the scrape that produced it
}

/** Everything the engine needs for one ticker. `null` means unknown, never zero. */
export type TickerScreeningInput = {
  ticker: string
  strikes: CandidateStrike[]
  ivRank: IvRank | null
  underlyingPrice: string | null
  earningsDate: string | null
}

/** One surviving strike, fully scored. Delta is absolute. */
export type ScoredCandidate = {
  ticker: string
  contractId: string
  strike: string
  expiration: string
  dte: number
  bid: string
  ask: string
  mark: string
  spreadAbsolute: string
  spreadPercent: string
  delta: string
  openInterest: number | null
  volume: number | null
  ivRank: IvRank | null
  capitalSecured: string
  periodYield: string
  annualizedYield: string
  yieldPerDelta: string
  // True only in 'flag' mode, when an earnings print lands inside the holding
  // window — the candidate still ranks, carrying the warning for US-66 to render.
  earningsFlagged: boolean
  timestamp: string
}

export type ExclusionCode =
  | 'price_ceiling'
  | 'iv_rank_floor'
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
  reason: string
}

/** Absolute and percent-of-mark spread, unrounded so each consumer rounds once. */
type Spread = { absolute: Decimal; percent: Decimal }

/** The two derived values both the filters and the scorer read. Each stage derives
 *  them straight from the quote strings, so neither ever reads a value the other
 *  already rounded. */
type StrikeMetrics = { absDelta: Decimal | null; spread: Spread }

function computeStrikeMetrics(strike: CandidateStrike): StrikeMetrics {
  const absolute = new Decimal(strike.ask).minus(strike.bid)
  return {
    absDelta: strike.delta === null ? null : new Decimal(strike.delta).abs(),
    spread: { absolute, percent: absolute.dividedBy(strike.mark).times(100) }
  }
}

// ---------------------------------------------------------------------------
// Reason formatting — US-66 renders these strings verbatim, so the shapes below
// (2dp deltas, en-dash bands, trimmed round-up percents, $-prefixed money) are
// load-bearing.
// ---------------------------------------------------------------------------

const EN_DASH = '–'

function formatBand(min: string, max: string): string {
  return `${new Decimal(min).toFixed(2)}${EN_DASH}${new Decimal(max).toFixed(2)}`
}

// Rounds UP at 2dp, then trims trailing zeros. Rounding half-up could render an
// observed value equal to the limit it exceeds ("spread 10% exceeds 10%"); rounding
// up keeps the observed side strictly above the limit's rendering.
function formatPercent(percent: Decimal | string): string {
  return `${new Decimal(percent).toDecimalPlaces(2, Decimal.ROUND_UP).toString()}%`
}

function formatMoney(amount: string): string {
  return `$${new Decimal(amount).toFixed(2)}`
}

// [US-67] The day an IV rank was observed. IV rank became a hard filter with the
// iv_rank_floor entry below, and the collector writes at most one reading a day, so
// the calendar day is the resolution that matters — a trader needs to see that a
// candidate was dropped on a months-old reading. The renderer's `fmtIvr` stamps the
// same 'MMM d' shape on the IVR column; keep the two in step.
function formatObservedOn(observedAt: string): string {
  return format(parseISO(observedAt), 'MMM d')
}

/** Whether an earnings print lands inside the holding window — on or after the
 *  trader's current calendar day, and on or before the strike's expiry. A print
 *  already in the past is history, not gap risk, even if the feed still reports it. */
function earningsWithinHolding(
  earningsDate: string,
  expiration: string,
  currentDate: Date
): boolean {
  const earnings = parseISO(earningsDate)
  return (
    compareAsc(earnings, startOfDay(currentDate)) >= 0 &&
    compareAsc(earnings, parseISO(expiration)) <= 0
  )
}

/** Everything one strike is judged against: the quote itself plus the ticker-level
 *  context (price, earnings, today's date) the per-strike chain doesn't carry. */
export type FilterInput = {
  strike: CandidateStrike
  dte: number | null
  underlyingPrice: string | null
  ivRank: IvRank | null
  earningsDate: string | null
  currentDate: Date
}

type FilterContext = FilterInput & StrikeMetrics

type FilterDefinition = {
  code: ExclusionCode
  // False means the filter cannot be evaluated — the criterion is off or its input
  // is unknown — and the candidate passes it untouched.
  applies: (ctx: FilterContext, criteria: ScreeningCriteria) => boolean
  // True means the candidate breaches this filter and is excluded.
  test: (ctx: FilterContext, criteria: ScreeningCriteria) => boolean
  reason: (ctx: FilterContext, criteria: ScreeningCriteria) => string
}

// ---------------------------------------------------------------------------
// Hard-filter registry — ordered, first failure wins. The order is the funnel a
// trader would describe: whole-ticker disqualifiers (too expensive, IV too low
// in its own range, earnings in the window) before per-strike ones (wrong
// expiry, wrong delta, too illiquid, too wide). It is also load-bearing
// downstream: US-66 shows one representative reason per ticker, and that reason
// is chosen by how far a strike got through this list.
// ---------------------------------------------------------------------------

const FILTERS: FilterDefinition[] = [
  {
    code: 'price_ceiling',
    applies: (ctx, criteria) =>
      criteria.maxUnderlyingPrice !== null && ctx.underlyingPrice !== null,
    test: (ctx, criteria) => new Decimal(ctx.underlyingPrice!).gt(criteria.maxUnderlyingPrice!),
    reason: (ctx, criteria) =>
      `underlying ${formatMoney(ctx.underlyingPrice!)} above ${formatMoney(criteria.maxUnderlyingPrice!)} ceiling`
  },
  {
    code: 'iv_rank_floor',
    // An unknown IV rank is a gap in the data, not a low reading, so it passes.
    applies: (ctx, criteria) => criteria.minIvRank !== null && ctx.ivRank !== null,
    test: (ctx, criteria) => new Decimal(ctx.ivRank!.value).lt(criteria.minIvRank!),
    reason: (ctx, criteria) =>
      `IV rank ${ctx.ivRank!.value} (${formatObservedOn(ctx.ivRank!.observedAt)}) below ${criteria.minIvRank}`
  },
  {
    code: 'earnings_in_window',
    applies: (ctx, criteria) =>
      criteria.earningsHandling === 'exclude' && ctx.earningsDate !== null,
    // An earnings print between now and expiry is a gap risk the trader would hold.
    test: (ctx) => earningsWithinHolding(ctx.earningsDate!, ctx.strike.expiration, ctx.currentDate),
    reason: (ctx) => `earnings ${ctx.earningsDate} falls on or before expiry`
  },
  {
    code: 'dte_window',
    applies: () => true,
    // A dte of 0 (or an unparseable expiration) would divide the annualized yield
    // by zero, so it fails here rather than reaching the scorer.
    test: (ctx, criteria) =>
      ctx.dte === null || ctx.dte < 1 || ctx.dte < criteria.dteMin || ctx.dte > criteria.dteMax,
    reason: (ctx, criteria) =>
      ctx.dte === null
        ? 'DTE unavailable'
        : `DTE ${ctx.dte} outside ${criteria.dteMin}${EN_DASH}${criteria.dteMax}`
  },
  {
    code: 'delta_unavailable',
    applies: () => true,
    test: (ctx) => ctx.absDelta === null,
    reason: () => 'delta unavailable'
  },
  {
    code: 'delta_band',
    applies: (ctx) => ctx.absDelta !== null,
    test: (ctx, criteria) =>
      ctx.absDelta!.lt(criteria.deltaMin) || ctx.absDelta!.gt(criteria.deltaMax),
    reason: (ctx, criteria) =>
      `delta ${ctx.absDelta!.toFixed(2)} outside ${formatBand(criteria.deltaMin, criteria.deltaMax)}`
  },
  {
    code: 'open_interest',
    applies: (ctx) => ctx.strike.openInterest !== null,
    test: (ctx, criteria) => ctx.strike.openInterest! < criteria.minOpenInterest,
    reason: (ctx, criteria) =>
      `open interest ${ctx.strike.openInterest} below ${criteria.minOpenInterest}`
  },
  {
    code: 'spread',
    applies: () => true,
    // Both ceilings must be breached: a penny-wide spread on a cheap option is
    // a large percentage but a trivial cost to cross.
    test: (ctx, criteria) =>
      ctx.spread.absolute.gt(criteria.maxSpreadAbsolute) &&
      ctx.spread.percent.gt(criteria.maxSpreadPercent),
    reason: (ctx, criteria) =>
      `spread ${formatPercent(ctx.spread.percent)} exceeds ${formatPercent(criteria.maxSpreadPercent)}`
  }
]

export type FilterFailure = { code: ExclusionCode; reason: string; index: number }

/** The first filter the strike breaches, or null when it survives all of them.
 *  `index` is the strike's depth through the funnel — how close it came to
 *  qualifying — which orders the excluded list. */
export function evaluateFilters(
  input: FilterInput,
  criteria: ScreeningCriteria
): FilterFailure | null {
  const ctx: FilterContext = { ...input, ...computeStrikeMetrics(input.strike) }
  const index = FILTERS.findIndex(
    (filter) => filter.applies(ctx, criteria) && filter.test(ctx, criteria)
  )

  if (index === -1) return null
  const filter = FILTERS[index]
  return { code: filter.code, reason: filter.reason(ctx, criteria), index }
}

/**
 * Scores one surviving strike. Every derived field comes off a single unrounded
 * Decimal chain and is rounded only on the way out, so `yieldPerDelta` divides the
 * exact annualized yield rather than its 4dp rendering.
 */
export function scoreCandidate(
  strike: CandidateStrike,
  ticker: string,
  dte: number,
  ivRank: IvRank | null,
  earningsFlagged = false
): ScoredCandidate {
  const { absDelta, spread } = computeStrikeMetrics(strike)
  const delta = absDelta ?? new Decimal(0)
  const periodYield = new Decimal(strike.mark).dividedBy(strike.strike)
  const annualizedYield = periodYield.times(DAYS_PER_YEAR).dividedBy(dte)

  return {
    ticker,
    contractId: strike.contractId,
    strike: strike.strike,
    expiration: strike.expiration,
    dte,
    bid: strike.bid,
    ask: strike.ask,
    mark: strike.mark,
    spreadAbsolute: spread.absolute.toFixed(2),
    spreadPercent: spread.percent.toFixed(2),
    delta: delta.toFixed(4),
    openInterest: strike.openInterest,
    volume: strike.volume,
    ivRank,
    capitalSecured: new Decimal(strike.strike).times(SHARES_PER_CONTRACT).toFixed(2),
    periodYield: periodYield.toFixed(4),
    annualizedYield: annualizedYield.toFixed(4),
    yieldPerDelta: annualizedYield.dividedBy(delta).toFixed(4),
    earningsFlagged,
    timestamp: strike.timestamp
  }
}

export type TickerScreeningResult = {
  ticker: string
  best: ScoredCandidate | null
  excluded: ExcludedCandidate[]
}

// One strike's verdict: either it survived and scored, or it named the filter it
// died at and how far through the funnel that was.
type StrikeVerdict =
  | { survived: true; candidate: ScoredCandidate }
  | { survived: false; excluded: ExcludedCandidate; index: number }

/** Higher yield-per-delta first. The single comparison both the best-of-ticker
 *  pick and the cross-ticker rank sort on. */
function compareYieldPerDelta(a: ScoredCandidate, b: ScoredCandidate): number {
  return new Decimal(b.yieldPerDelta).cmp(a.yieldPerDelta)
}

function judgeStrike(
  strike: CandidateStrike,
  input: TickerScreeningInput,
  criteria: ScreeningCriteria,
  currentDate: Date
): StrikeVerdict {
  const dte = computeDte(strike.expiration, currentDate)
  const failure = evaluateFilters(
    {
      strike,
      dte,
      underlyingPrice: input.underlyingPrice,
      ivRank: input.ivRank,
      earningsDate: input.earningsDate,
      currentDate
    },
    criteria
  )

  if (failure !== null) {
    return {
      survived: false,
      index: failure.index,
      excluded: {
        ticker: input.ticker,
        contractId: strike.contractId,
        strike: strike.strike,
        expiration: strike.expiration,
        code: failure.code,
        reason: failure.reason
      }
    }
  }

  // In 'flag' mode an in-window earnings print never excludes, but the survivor
  // must carry the warning the trader asked for.
  const earningsFlagged =
    criteria.earningsHandling === 'flag' &&
    input.earningsDate !== null &&
    earningsWithinHolding(input.earningsDate, strike.expiration, currentDate)

  // A survivor cleared `dte_window`, so its DTE is a usable positive number.
  return {
    survived: true,
    candidate: scoreCandidate(strike, input.ticker, dte!, input.ivRank, earningsFlagged)
  }
}

/**
 * Screens one ticker's chain down to the single strike that represents it, plus
 * every strike that failed and why. Exclusions are ordered by how far each strike
 * got through the filter funnel — `excluded[0]` is the ticker's closest miss and
 * becomes its representative reason downstream.
 */
export function screenTicker(
  input: TickerScreeningInput,
  criteria: ScreeningCriteria,
  currentDate: Date
): TickerScreeningResult {
  const verdicts = input.strikes.map((strike) => judgeStrike(strike, input, criteria, currentDate))

  // Best first: highest yield-per-delta, ties going to the lower strike — the more
  // conservative entry.
  const survivors = verdicts
    .flatMap((verdict) => (verdict.survived ? [verdict.candidate] : []))
    .sort((a, b) => compareYieldPerDelta(a, b) || new Decimal(a.strike).cmp(b.strike))
  const best = survivors[0] ?? null

  const excluded = verdicts
    .flatMap((verdict) => (verdict.survived ? [] : [verdict]))
    .sort((a, b) => b.index - a.index)
    .map((verdict) => verdict.excluded)

  return { ticker: input.ticker, best, excluded }
}

/** Every ticker's best strike in rank order — highest yield-per-delta first,
 *  ties broken by ticker. The array order is the rank; no rank field is emitted. */
export function rankCandidates(results: TickerScreeningResult[]): ScoredCandidate[] {
  return results
    .flatMap((result) => (result.best === null ? [] : [result.best]))
    .sort((a, b) => compareYieldPerDelta(a, b) || a.ticker.localeCompare(b.ticker))
}
