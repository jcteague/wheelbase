// [US-110] pmcc-screener — pure engine that screens one ticker's call chains for its best
// poor man's covered call: a deep in-the-money LEAPS bought, a short-dated call sold against
// it. The wheel screener's shape (core/screener.ts) applied in three stages — the ticker, each
// leg, then every LEAPS × short pair — each an ordered registry where the first failure wins.
// No DB, provider, or logger imports: plain values in, plain results out.
import Decimal from 'decimal.js'
import { compareAsc, parseISO } from 'date-fns'
import type { CandidateStrike } from './candidate-chain'
import { computeDte } from './dte'
import { toFiniteDecimal } from './finite-decimal'
import { shortStrikeAboveLeaps } from './pmcc-rules'
import {
  DAYS_PER_YEAR,
  EN_DASH,
  SHARES_PER_CONTRACT,
  candidateEarnings,
  computeStrikeMetrics,
  earningsTier,
  earningsWithinHolding,
  formatBand,
  formatMoney,
  formatObservedOn,
  formatPercent,
  type CandidateEarnings,
  type EarningsHandling,
  type EarningsLookup,
  type IvRank,
  type StrikeMetrics
} from './screener'
import { fixed4 } from '../../shared/decimal-text'

export type PmccScreeningCriteria = {
  // LEAPS (long call) leg
  longDeltaMin: string // absolute delta, e.g. '0.70'
  longDeltaMax: string
  longDteMin: number // calendar days, inclusive
  longDteMax: number
  // Short call leg
  shortDeltaMin: string
  shortDeltaMax: string
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
  earningsHandling: EarningsHandling
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

/** Everything the engine needs for one ticker. `null` means unknown, never zero. */
export type PmccTickerScreeningInput = {
  ticker: string
  longCalls: CandidateStrike[] // every call quoted in the LEAPS window
  shortCalls: CandidateStrike[] // every call quoted in the short window
  ivRank: IvRank | null // usable readings only; an integer string since US-121
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
  longExtrinsic: string | null // 2dp: long.mark − max(0, price − long.strike), floored at 0
  extrinsicCoverage: string | null // 4dp fraction: short.mark / longExtrinsic
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
  contractId: string | null // the offending leg's contract (a pair's short); null for ticker-level
  code: PmccExclusionCode
  reason: string
}

export type PmccTickerScreeningResult = {
  ticker: string
  best: PmccScoredCandidate | null
  excluded: PmccExcludedCandidate[] // closest miss first (deepest stage, deepest filter, nearest miss, contract ids)
}

/** A call whose delta is quoted — the only kind a leg can be scored from. */
export type KnownDeltaStrike = CandidateStrike & { delta: string }

/** One leg's quote and its calendar days to expiration on the valuation date. */
export type PmccLegQuote = { quote: KnownDeltaStrike; dte: number }

/** Everything `scorePmccPair` needs to score one diagonal. */
export type PmccPairInput = {
  ticker: string
  long: PmccLegQuote
  short: PmccLegQuote
  underlyingPrice: string | null
  ivRank: IvRank | null
  earnings: CandidateEarnings
}

function fixed2(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}

/** The net debit as a percent of the strike width, unrounded — the filter and the score
 *  both read it, and the filter must never judge a value rounding has pulled under the cap. */
function debitToWidth(long: CandidateStrike, short: CandidateStrike): Decimal {
  const debit = new Decimal(long.mark).minus(short.mark)
  return debit.dividedBy(new Decimal(short.strike).minus(long.strike)).times(100)
}

/** Time value left in the LEAPS: mark less intrinsic, floored at 0 so a stale mark below
 *  intrinsic never reads as negative. Null without a usable price — extrinsic is display-only. */
function leapsExtrinsic(long: CandidateStrike, underlyingPrice: string | null): Decimal | null {
  const price = toFiniteDecimal(underlyingPrice)
  if (price === null) return null
  const intrinsic = Decimal.max(0, price.minus(long.strike))
  return Decimal.max(0, new Decimal(long.mark).minus(intrinsic))
}

function newerTimestamp(a: string, b: string): string {
  // Stryker disable next-line EqualityOperator: equivalent — `>` differs only on a tie, where both name one instant (and the provider's toISOString() makes them the same string)
  return compareAsc(parseISO(a), parseISO(b)) >= 0 ? a : b
}

function absoluteDelta(quote: KnownDeltaStrike): Decimal {
  return new Decimal(quote.delta).abs()
}

export function toPmccLeg({ quote, dte }: PmccLegQuote): PmccLeg {
  const { spread } = computeStrikeMetrics(quote)
  return {
    ...quote,
    dte,
    spreadAbsolute: fixed2(spread.absolute),
    spreadPercent: fixed2(spread.percent),
    delta: fixed4(absoluteDelta(quote))
  }
}

/**
 * Scores one diagonal. Every derived field comes off a single unrounded Decimal chain and is
 * rounded only on the way out, so `returnPerDelta` divides the exact annualized yield.
 */
export function scorePmccPair(pair: PmccPairInput): PmccScoredCandidate {
  const { long, short } = pair
  const shortMark = new Decimal(short.quote.mark)
  const netDebit = new Decimal(long.quote.mark).minus(shortMark)
  const cycleYield = shortMark.dividedBy(netDebit)
  const annualizedYield = cycleYield.times(DAYS_PER_YEAR).dividedBy(short.dte)
  const shortDelta = absoluteDelta(short.quote)
  const extrinsic = leapsExtrinsic(long.quote, pair.underlyingPrice)

  return {
    ticker: pair.ticker,
    long: toPmccLeg(long),
    short: toPmccLeg(short),
    ivRank: pair.ivRank,
    netDebit: fixed2(netDebit),
    capitalAtRisk: fixed2(netDebit.times(SHARES_PER_CONTRACT)),
    strikeWidth: fixed2(new Decimal(short.quote.strike).minus(long.quote.strike)),
    debitToWidthPercent: fixed2(debitToWidth(long.quote, short.quote)),
    cycleYield: fixed4(cycleYield),
    annualizedYield: fixed4(annualizedYield),
    returnPerDelta: fixed4(annualizedYield.dividedBy(shortDelta)),
    longExtrinsic: extrinsic === null ? null : fixed2(extrinsic),
    extrinsicCoverage:
      extrinsic !== null && extrinsic.gt(0) ? fixed4(shortMark.dividedBy(extrinsic)) : null,
    earnings: pair.earnings,
    timestamp: newerTimestamp(long.quote.timestamp, short.quote.timestamp)
  }
}

// ---------------------------------------------------------------------------
// Filter registries — ordered, first miss wins within a stage. A filter's `check`
// returns its miss, or null when the candidate passes. Two leg filters are gates:
// passing one establishes a fact (a known DTE, a known delta), so it hands the
// filters after it a context whose type carries that fact.
// ---------------------------------------------------------------------------

/** Why a candidate breaches a filter, and `by` how much: one filter's misses are listed
 *  nearest first. A filter with no measure of nearness leaves all its misses level. */
type Miss = { reason: string; by: Decimal }

const LEVEL = new Decimal(0)

function miss(reason: string, by: Decimal = LEVEL): Miss {
  return { reason, by }
}

type PmccFilter<C> = {
  code: PmccExclusionCode
  // Null as well when the criterion is off or its input unknown: the filter does not judge
  // what it cannot evaluate.
  check: (ctx: C, criteria: PmccScreeningCriteria) => Miss | null
}

/** A filter whose pass establishes a fact the filters after it read. */
type PmccGate<C, N> = {
  code: PmccExclusionCode
  narrow: (ctx: C) => { miss: Miss } | { known: N }
}

/** The reading and the day it was taken, e.g. `IV rank 58 (Sep 17)`. */
function describeIvRank(ivRank: IvRank): string {
  return `IV rank ${ivRank.value} (${formatObservedOn(ivRank.observedAt)})`
}

// A ticker-level miss short-circuits the funnel, so these never need a measure.
const TICKER_FILTERS: PmccFilter<PmccTickerScreeningInput>[] = [
  {
    code: 'iv_rank_floor',
    // An unknown IV rank is a gap in the data, not a reading, so it passes either end.
    check: ({ ivRank }, { minIvRank }) =>
      minIvRank !== null && ivRank !== null && new Decimal(ivRank.value).lt(minIvRank)
        ? miss(`${describeIvRank(ivRank)} below ${minIvRank}`)
        : null
  },
  {
    code: 'iv_rank_ceiling',
    check: ({ ivRank }, { maxIvRank }) =>
      maxIvRank !== null && ivRank !== null && new Decimal(ivRank.value).gt(maxIvRank)
        ? miss(`${describeIvRank(ivRank)} above ${maxIvRank}`)
        : null
  }
]

const LEG_LABEL: Record<PmccLegRole, string> = { long: 'LEAPS', short: 'short call' }

/** The delta band and DTE window one leg is judged against. */
type LegBand = { deltaMin: string; deltaMax: string; dteMin: number; dteMax: number }

function legBand(role: PmccLegRole, criteria: PmccScreeningCriteria): LegBand {
  return role === 'long'
    ? {
        deltaMin: criteria.longDeltaMin,
        deltaMax: criteria.longDeltaMax,
        dteMin: criteria.longDteMin,
        dteMax: criteria.longDteMax
      }
    : {
        deltaMin: criteria.shortDeltaMin,
        deltaMax: criteria.shortDeltaMax,
        dteMin: criteria.shortDteMin,
        dteMax: criteria.shortDteMax
      }
}

type LegContext = {
  role: PmccLegRole
  label: string
  band: LegBand
  quote: CandidateStrike
  dte: number | null
  spread: StrikeMetrics['spread']
  earningsDate: string | null // the calendar's date when it found one
  currentDate: Date
}

/** A leg past `dte_window`: its DTE is a number. */
type DatedLeg = Omit<LegContext, 'dte'> & { dte: number }

/** A leg past `delta_unavailable` too: its delta is quoted. */
type KnownLeg = Omit<DatedLeg, 'quote'> & { quote: KnownDeltaStrike; absDelta: Decimal }

const EARNINGS_IN_WINDOW: PmccFilter<LegContext> = {
  code: 'earnings_in_window',
  // Judged on the short call alone: a print the short expires before is the next
  // cycle's decision, even though the LEAPS is held through it.
  check: ({ role, earningsDate, quote, currentDate }, criteria) =>
    role === 'short' &&
    criteria.earningsHandling === 'exclude' &&
    earningsDate !== null &&
    earningsWithinHolding(earningsDate, quote.expiration, currentDate)
      ? miss(`earnings ${earningsDate} falls on or before expiry`)
      : null
}

/** Sorts an unknown DTE after every DTE a window could be widened to take. */
const UNMEASURED = new Decimal(Infinity)

const DTE_WINDOW: PmccGate<LegContext, DatedLeg> = {
  code: 'dte_window',
  narrow: (ctx) => {
    const { label, band, dte } = ctx
    if (dte === null) return { miss: miss(`${label} DTE unavailable`, UNMEASURED) }
    if (dte < band.dteMin || dte > band.dteMax) {
      return {
        miss: miss(
          `${label} DTE ${dte} outside ${band.dteMin}${EN_DASH}${band.dteMax}`,
          new Decimal(Math.max(band.dteMin - dte, dte - band.dteMax))
        )
      }
    }
    return { known: { ...ctx, dte } }
  }
}

const DELTA_KNOWN: PmccGate<DatedLeg, KnownLeg> = {
  code: 'delta_unavailable',
  narrow: (ctx) => {
    const { delta } = ctx.quote
    if (delta === null) return { miss: miss(`${ctx.label} delta unavailable`) }
    const quote = { ...ctx.quote, delta }
    return { known: { ...ctx, quote, absDelta: absoluteDelta(quote) } }
  }
}

const KNOWN_LEG_FILTERS: PmccFilter<KnownLeg>[] = [
  {
    code: 'delta_band',
    check: ({ label, band, absDelta }) =>
      absDelta.lt(band.deltaMin) || absDelta.gt(band.deltaMax)
        ? miss(
            `${label} delta ${absDelta.toFixed(2)} outside ${formatBand(band.deltaMin, band.deltaMax)}`,
            Decimal.max(new Decimal(band.deltaMin).minus(absDelta), absDelta.minus(band.deltaMax))
          )
        : null
  },
  {
    code: 'open_interest',
    check: ({ label, quote: { openInterest } }, { minOpenInterest }) =>
      openInterest !== null && openInterest < minOpenInterest
        ? miss(
            `${label} open interest ${openInterest} below ${minOpenInterest}`,
            new Decimal(minOpenInterest - openInterest)
          )
        : null
  },
  {
    code: 'spread',
    // Both ceilings must be breached: a penny-wide spread on a cheap option is a large
    // percentage but a trivial cost to cross. Nearness is the percent the reason reports.
    check: ({ label, spread }, criteria) =>
      spread.absolute.gt(criteria.maxSpreadAbsolute) && spread.percent.gt(criteria.maxSpreadPercent)
        ? miss(
            `${label} spread ${formatPercent(spread.percent)} exceeds ${formatPercent(criteria.maxSpreadPercent)}`,
            spread.percent
          )
        : null
  }
]

type PairContext = { long: PmccLegQuote; short: PmccLegQuote }

const PAIR_FILTERS: PmccFilter<PairContext>[] = [
  {
    code: 'short_strike_not_above_long',
    // The entry form's own rule, so the screener can never propose a pair entry refuses.
    check: ({ long, short }) =>
      shortStrikeAboveLeaps(short.quote.strike, long.quote.strike)
        ? null
        : miss(
            `short strike ${formatMoney(short.quote.strike)} not above LEAPS strike ${formatMoney(long.quote.strike)}`
          )
  },
  {
    code: 'debit_to_width',
    check: ({ long, short }, criteria) => {
      const ratio = debitToWidth(long.quote, short.quote)
      return ratio.gt(criteria.maxDebitToWidthPercent)
        ? miss(
            `debit ${formatPercent(ratio)} of width exceeds ${formatPercent(criteria.maxDebitToWidthPercent)}`,
            ratio
          )
        : null
    }
  }
]

// ---------------------------------------------------------------------------
// Stages — each registry run in order, gates handing on the context they narrow.
// ---------------------------------------------------------------------------

/** A miss, the filter that found it, and how deep into its stage that filter sits. */
type StageFailure = Miss & { code: PmccExclusionCode; depth: number }

/** Where a candidate ends up in a stage: past every filter, carrying what they
 *  established, or stopped at the first one it missed. */
type Screened<C> = { passed: C } | { failed: StageFailure }

/** The rest of a stage, from filter number `depth` on. */
type StageRun<C, Out> = (ctx: C, criteria: PmccScreeningCriteria, depth: number) => Screened<Out>

function accept<C>(): StageRun<C, C> {
  return (ctx) => ({ passed: ctx })
}

/** Runs `filters` in order — the first miss wins — then hands the context on to `next`. */
function registry<C, Out>(filters: PmccFilter<C>[], next: StageRun<C, Out>): StageRun<C, Out> {
  return (ctx, criteria, depth) => {
    const failed = filters.reduce<StageFailure | null>((found, { code, check }, index) => {
      if (found !== null) return found
      const missed = check(ctx, criteria)
      return missed === null ? null : { ...missed, code, depth: depth + index }
    }, null)
    return failed === null ? next(ctx, criteria, depth + filters.length) : { failed }
  }
}

/** Runs one gate, then hands `next` the context it narrowed. */
function gate<C, N, Out>(
  { code, narrow }: PmccGate<C, N>,
  next: StageRun<N, Out>
): StageRun<C, Out> {
  return (ctx, criteria, depth) => {
    const result = narrow(ctx)
    return 'miss' in result
      ? { failed: { ...result.miss, code, depth } }
      : next(result.known, criteria, depth + 1)
  }
}

const TICKER_STAGE: StageRun<PmccTickerScreeningInput, PmccTickerScreeningInput> = registry(
  TICKER_FILTERS,
  accept()
)

const LEG_STAGE: StageRun<LegContext, KnownLeg> = registry(
  [EARNINGS_IN_WINDOW],
  gate(DTE_WINDOW, gate(DELTA_KNOWN, registry(KNOWN_LEG_FILTERS, accept())))
)

const PAIR_STAGE: StageRun<PairContext, PairContext> = registry(PAIR_FILTERS, accept())

// ---------------------------------------------------------------------------
// The funnel: ticker → each leg → every surviving LEAPS × short.
// ---------------------------------------------------------------------------

type Stage = PmccExcludedCandidate['stage']

const STAGE_DEPTH: Record<Stage, number> = { ticker: 0, long: 1, short: 2, pair: 3 }

type Rejection = {
  survived: false
  excluded: PmccExcludedCandidate
  depth: number
  by: Decimal
  id: string // the leg's contract, or the pair's two: the last tie-break
}

type Verdict<T> = { survived: true; value: T } | Rejection

function exclusion(
  ticker: string,
  stage: Stage,
  contractId: string | null,
  failure: StageFailure
): PmccExcludedCandidate {
  return { ticker, stage, contractId, code: failure.code, reason: failure.reason }
}

function rejected(
  ticker: string,
  stage: PmccLegRole | 'pair',
  contractId: string,
  id: string,
  failure: StageFailure
): Rejection {
  return {
    survived: false,
    depth: failure.depth,
    by: failure.by,
    id,
    excluded: exclusion(ticker, stage, contractId, failure)
  }
}

function survivorsOf<T>(verdicts: Verdict<T>[]): T[] {
  return verdicts.flatMap((verdict) => (verdict.survived ? [verdict.value] : []))
}

function rejectionsOf(verdicts: Verdict<unknown>[]): Rejection[] {
  return verdicts.flatMap((verdict) => (verdict.survived ? [] : [verdict]))
}

/** The deepest stage first, then the deepest filter within it, then that filter's nearest
 *  miss — and last the contract ids, so the chains' order never decides. */
function closestMissFirst(a: Rejection, b: Rejection): number {
  return (
    STAGE_DEPTH[b.excluded.stage] - STAGE_DEPTH[a.excluded.stage] ||
    b.depth - a.depth ||
    a.by.cmp(b.by) ||
    a.id.localeCompare(b.id)
  )
}

/** What every leg and pair of one ticker is judged against. */
type Screening = {
  input: PmccTickerScreeningInput
  criteria: PmccScreeningCriteria
  currentDate: Date
}

function legContext(
  role: PmccLegRole,
  quote: CandidateStrike,
  { input, criteria, currentDate }: Screening
): LegContext {
  return {
    role,
    label: LEG_LABEL[role],
    band: legBand(role, criteria),
    quote,
    dte: computeDte(quote.expiration, currentDate),
    spread: computeStrikeMetrics(quote).spread,
    earningsDate: input.earnings.status === 'found' ? input.earnings.date : null,
    currentDate
  }
}

function judgeLeg(
  role: PmccLegRole,
  quote: CandidateStrike,
  screening: Screening
): Verdict<PmccLegQuote> {
  const screened = LEG_STAGE(legContext(role, quote, screening), screening.criteria, 0)
  if ('failed' in screened) {
    const { contractId } = quote
    return rejected(screening.input.ticker, role, contractId, contractId, screened.failed)
  }
  return { survived: true, value: { quote: screened.passed.quote, dte: screened.passed.dte } }
}

function pairId(long: { contractId: string }, short: { contractId: string }): string {
  return `${long.contractId} ${short.contractId}`
}

function judgePair(
  pair: PairContext,
  { input, criteria, currentDate }: Screening
): Verdict<PmccScoredCandidate> {
  const { long, short } = pair
  const screened = PAIR_STAGE(pair, criteria, 0)
  if ('failed' in screened) {
    const id = pairId(long.quote, short.quote)
    return rejected(input.ticker, 'pair', short.quote.contractId, id, screened.failed)
  }
  return {
    survived: true,
    value: scorePmccPair({
      ticker: input.ticker,
      long,
      short,
      underlyingPrice: input.underlyingPrice,
      ivRank: input.ivRank,
      earnings: candidateEarnings(
        input.earnings,
        criteria.earningsHandling,
        short.quote.expiration,
        currentDate
      )
    })
  }
}

/** Higher return per delta first — the comparison both the per-ticker pick and the
 *  cross-ticker rank sort on. */
function compareReturnPerDelta(a: PmccScoredCandidate, b: PmccScoredCandidate): number {
  return new Decimal(b.returnPerDelta).cmp(a.returnPerDelta)
}

/** Best pair first: earnings certainty, highest score, the cheaper debit for the width, the
 *  deeper LEAPS — then contract ids, so the chain's order never decides an exact tie. */
function compareBestPair(a: PmccScoredCandidate, b: PmccScoredCandidate): number {
  return (
    earningsTier(a) - earningsTier(b) ||
    compareReturnPerDelta(a, b) ||
    new Decimal(a.debitToWidthPercent).cmp(b.debitToWidthPercent) ||
    new Decimal(a.long.strike).cmp(b.long.strike) ||
    pairId(a.long, a.short).localeCompare(pairId(b.long, b.short))
  )
}

/**
 * Screens one ticker's two call chains down to the single diagonal that represents it, plus
 * every leg and pair that failed and why. A ticker-level failure short-circuits everything.
 * Exclusions are ordered closest miss first — the deepest stage, the deepest filter, then the
 * nearest miss of that filter — so `excluded[0]` is the reason the trader can act on, and
 * the order of the quotes in either chain never changes it.
 */
export function screenPmccTicker(
  input: PmccTickerScreeningInput,
  criteria: PmccScreeningCriteria,
  currentDate: Date
): PmccTickerScreeningResult {
  const ticker = TICKER_STAGE(input, criteria, 0)
  if ('failed' in ticker) {
    return {
      ticker: input.ticker,
      best: null,
      excluded: [exclusion(input.ticker, 'ticker', null, ticker.failed)]
    }
  }

  const screening: Screening = { input, criteria, currentDate }
  const longs = input.longCalls.map((quote) => judgeLeg('long', quote, screening))
  const shorts = input.shortCalls.map((quote) => judgeLeg('short', quote, screening))
  const pairs = survivorsOf(longs).flatMap((long) =>
    survivorsOf(shorts).map((short) => judgePair({ long, short }, screening))
  )

  const best = survivorsOf(pairs).sort(compareBestPair)[0] ?? null
  const excluded = rejectionsOf([...longs, ...shorts, ...pairs])
    .sort(closestMissFirst)
    .map((rejection) => rejection.excluded)

  return { ticker: input.ticker, best, excluded }
}

/** Every ticker's best diagonal in rank order — earnings certainty first, then highest
 *  return per delta, ties broken by ticker. The array order is the rank. */
export function rankPmccCandidates(results: PmccTickerScreeningResult[]): PmccScoredCandidate[] {
  return results
    .flatMap((result) => (result.best === null ? [] : [result.best]))
    .sort(
      (a, b) =>
        earningsTier(a) - earningsTier(b) ||
        compareReturnPerDelta(a, b) ||
        a.ticker.localeCompare(b.ticker)
    )
}
