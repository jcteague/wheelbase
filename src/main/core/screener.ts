// [US-65] screener — pure engine that disqualifies put strikes against the trader's
// hard criteria, scores the survivors on premium yield, and ranks them by
// yield-per-delta. No DB, provider, or logger imports: plain values in, plain
// results out.
import Decimal from 'decimal.js'
import { compareAsc, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'
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

/**
 * [US-70] What an earnings calendar knows about one ticker over the window the
 * caller asked about. `none` is positive knowledge — the calendar was read and
 * holds no event — while `unavailable` means it could not be read at all.
 * Collapsing the two would let one free-tier gap or an expired API key read as
 * "no earnings risk", which is the silent pass US-70 exists to prevent.
 *
 * The engine declares this so it stays free of `integrations/` imports; the
 * Finnhub feed conforms to it, the same way `ivr-snapshots` conforms to `IvRank`.
 */
export type EarningsLookup =
  | { status: 'found'; date: string }
  | { status: 'none' }
  | { status: 'unavailable' }

/**
 * [US-70] What the engine decided about one candidate's earnings exposure.
 * `daysBeforeExpiry` travels with a `flagged` verdict so the badge copy
 * ("21d before expiry") never redoes date math in the renderer.
 *
 * `flagged` can only exist under `earningsHandling: 'flag'` — in `exclude` mode
 * the same input becomes an `ExcludedCandidate` and never reaches a score.
 */
export type CandidateEarnings =
  | { status: 'clear' } // known date, falls after expiry (or already past)
  | { status: 'flagged'; date: string; daysBeforeExpiry: number }
  | { status: 'unknown' } // calendar read, no event
  | { status: 'unavailable' } // calendar could not be read

/** Everything the engine needs for one ticker. `null` means unknown, never zero. */
export type TickerScreeningInput = {
  ticker: string
  strikes: CandidateStrike[]
  ivRank: IvRank | null
  underlyingPrice: string | null
  earnings: EarningsLookup
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
  // The earnings verdict US-66 renders as a badge, and the outer key `rankCandidates`
  // sorts on. Anything but `clear` still ranks — it is demoted, never dropped.
  earnings: CandidateEarnings
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

/**
 * [US-70] The verdict a surviving strike carries. Only a `found` date can flag, and
 * only in `flag` mode — under `exclude` an in-window date was already caught by the
 * `earnings_in_window` filter, so a survivor there is `clear` by construction.
 * `none` and `unavailable` demote but never exclude: a gap in the feed is not
 * evidence of safety, and it is not evidence of risk either.
 */
function candidateEarnings(
  earnings: EarningsLookup,
  handling: EarningsHandling,
  expiration: string,
  currentDate: Date
): CandidateEarnings {
  switch (earnings.status) {
    case 'none':
      return { status: 'unknown' }
    case 'unavailable':
      return { status: 'unavailable' }
    case 'found': {
      if (handling !== 'flag' || !earningsWithinHolding(earnings.date, expiration, currentDate)) {
        return { status: 'clear' }
      }
      return {
        status: 'flagged',
        date: earnings.date,
        daysBeforeExpiry: differenceInCalendarDays(parseISO(expiration), parseISO(earnings.date))
      }
    }
  }
}

/** Everything one strike is judged against: the quote itself plus the ticker-level
 *  context (price, earnings, today's date) the per-strike chain doesn't carry. */
export type FilterInput = {
  strike: CandidateStrike
  dte: number | null
  underlyingPrice: string | null
  ivRank: IvRank | null
  earnings: EarningsLookup
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

/** The date the `earnings_in_window` filter judges. Its `applies` guard has already
 *  established the lookup is `found`, so this asserts that once rather than in both
 *  `test` and `reason` — the same shape as the other filters' `ctx.underlyingPrice!`. */
function earningsDateOf(ctx: FilterContext): string {
  return (ctx.earnings as Extract<EarningsLookup, { status: 'found' }>).date
}

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
    // Only a date we actually read can exclude. An unknown or unreadable calendar is
    // a gap in the data, not evidence of safety — hard-excluding on it would let one
    // free-tier gap or an expired API key silently empty the results table.
    applies: (ctx, criteria) =>
      criteria.earningsHandling === 'exclude' && ctx.earnings.status === 'found',
    // An earnings print between now and expiry is a gap risk the trader would hold.
    test: (ctx) =>
      earningsWithinHolding(earningsDateOf(ctx), ctx.strike.expiration, ctx.currentDate),
    reason: (ctx) => `earnings ${earningsDateOf(ctx)} falls on or before expiry`
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
  earnings: CandidateEarnings = { status: 'clear' }
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
    earnings,
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

/** [US-70] 0 = clear, 1 = unknown/unavailable, 2 = earnings in window. Sorts ahead of
 *  yield-per-delta: pre-earnings IV inflation is precisely what lifts these candidates
 *  up the score, so a high score must never rescue a tier. `unknown` and `unavailable`
 *  share a tier — the trader's next move is the same for both, go look it up. */
function earningsTier(candidate: ScoredCandidate): 0 | 1 | 2 {
  switch (candidate.earnings.status) {
    case 'clear':
      return 0
    case 'unknown':
    case 'unavailable':
      return 1
    case 'flagged':
      return 2
  }
}

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
      earnings: input.earnings,
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

  // A survivor cleared `dte_window`, so its DTE is a usable positive number.
  return {
    survived: true,
    candidate: scoreCandidate(
      strike,
      input.ticker,
      dte!,
      input.ivRank,
      candidateEarnings(input.earnings, criteria.earningsHandling, strike.expiration, currentDate)
    )
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

  // Best first: earnings certainty, then highest yield-per-delta, ties going to the
  // lower strike — the more conservative entry.
  //
  // [US-70] The tier leads here for the same reason it leads `rankCandidates`, and it is
  // not redundant with it: a ticker's chain spans the whole DTE window, so earnings
  // status varies *between its own expiries*. A print falling between two of them leaves
  // the earlier strike clear and the later one flagged, and the flagged one carries the
  // richer premium precisely because pre-earnings IV inflates it. Sorting on score alone
  // would hand the ticker its riskiest expiry and hide the clean one entirely.
  const survivors = verdicts
    .flatMap((verdict) => (verdict.survived ? [verdict.candidate] : []))
    .sort(
      (a, b) =>
        earningsTier(a) - earningsTier(b) ||
        compareYieldPerDelta(a, b) ||
        new Decimal(a.strike).cmp(b.strike)
    )
  const best = survivors[0] ?? null

  const excluded = verdicts
    .flatMap((verdict) => (verdict.survived ? [] : [verdict]))
    .sort((a, b) => b.index - a.index)
    .map((verdict) => verdict.excluded)

  return { ticker: input.ticker, best, excluded }
}

/** Every ticker's best strike in rank order — earnings certainty first, then highest
 *  yield-per-delta, ties broken by ticker. The array order is the rank; no rank field
 *  is emitted. */
export function rankCandidates(results: TickerScreeningResult[]): ScoredCandidate[] {
  return results
    .flatMap((result) => (result.best === null ? [] : [result.best]))
    .sort(
      (a, b) =>
        earningsTier(a) - earningsTier(b) ||
        compareYieldPerDelta(a, b) ||
        a.ticker.localeCompare(b.ticker)
    )
}
