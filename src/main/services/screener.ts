// [US-65] screener service — joins US-64's put chains with the latest IVR reading and
// (only when the trader has a price ceiling set) the underlying quote, runs the pure
// screening engine per ticker, and returns a ranked candidate list plus one explained
// exclusion for every ticker that did not make it.
import type Database from 'better-sqlite3'
import { compareAsc, parseISO } from 'date-fns'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { isWellFormedStrike } from '../core/candidate-chain'
import {
  rankCandidates,
  screenTicker,
  type EarningsLookup,
  type ExclusionCode,
  type IvRank,
  type ScoredCandidate,
  type ScreeningCriteria,
  type TickerScreeningResult
} from '../core/screener'
import { isUsableState, type AssessedIvRank } from '../core/ivr-freshness'
import { logger } from '../logger'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'
import type { EarningsCalendarKnowledge } from './earnings-dates'
import { readEarningsOrEmpty } from './earnings-horizon'
import { getScreeningCriteria } from './screening-criteria'
import { fetchIsolatedStockQuotes } from './underlying-quotes'
import { getAssessedIvrByUnderlying } from './ivr-snapshots'
import { readTradingCalendar } from './trading-calendar-store'

export type ScreenerExclusionCode = ExclusionCode | 'no_options_listed' | 'data_unavailable'

export type ScreenerExclusion = {
  ticker: string
  code: ScreenerExclusionCode
  reason: string
}

export type RankedCandidate = Omit<ScoredCandidate, 'ivRank'> & {
  ivRank: AssessedIvRank | null
}

export type ScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: RankedCandidate[] // rank order; empty = nothing survived
  excluded: ScreenerExclusion[] // one row per non-ranking ticker, watchlist order
  quoteTimestamp: string | null // newest ranked strike timestamp, for the stale badge
}

type ScreenOptions = { criteria?: ScreeningCriteria; currentDate?: Date }

// A ticker either got screened or never made it far enough to be — the second case
// carries the reason straight into the excluded list.
type TickerOutcome = { screened: TickerScreeningResult } | { exclusion: ScreenerExclusion }

// Everything the screener needs to judge one chain, past the boundary reads.
type ScreenContext = {
  ivRanks: Map<string, IvRank>
  prices: Map<string, string>
  earnings: Map<string, EarningsLookup>
  criteria: ScreeningCriteria
  currentDate: Date
}

/** The verdict for a ticker we could not get usable data for — whether its chain never
 *  arrived or the engine choked on a quote. Both paths must read identically to the
 *  trader, so the code and its wording stay together here. */
function dataUnavailable(ticker: string): ScreenerExclusion {
  return { ticker, code: 'data_unavailable', reason: 'market data unavailable' }
}

/**
 * Underlying prices, fetched only when a price ceiling is actually set — with the
 * ceiling off nothing reads them. The fetch isolates each ticker, so a quote failure
 * leaves only that ticker's ceiling unevaluated rather than silently disarming the
 * ceiling for the whole watchlist.
 */
async function readUnderlyingPrices(
  provider: MarketDataProvider,
  tickers: string[],
  criteria: ScreeningCriteria
): Promise<Map<string, string>> {
  if (criteria.maxUnderlyingPrice === null) return new Map()

  const quotes = await fetchIsolatedStockQuotes(provider, tickers)
  return new Map([...quotes].map(([ticker, quote]) => [ticker, quote.price]))
}

/**
 * Freshness-assessed IV rank per ticker, judged against the cached exchange calendar
 * and what the earnings store knows about each ticker's last print.
 *
 * Both reads degrade internally to "unknown for everyone" rather than sinking the run:
 * IVR is display-only and never a hard filter, so losing it must not cost the trader
 * the whole screen. That is why there is no catch here — a second one could only ever
 * be reached by a test mock, and would hide a genuine defect if one appeared.
 */
function readAssessedIvr(
  db: Database.Database,
  tickers: string[],
  currentDate: Date,
  earnings: Map<string, EarningsCalendarKnowledge>
): Map<string, AssessedIvRank | null> {
  return getAssessedIvrByUnderlying(db, tickers, {
    now: currentDate,
    calendar: readTradingCalendar(db, currentDate),
    lastEarnings: new Map([...earnings].map(([ticker, known]) => [ticker, known.last]))
  })
}

/** Only a reading the freshness engine judged usable is scored. The rest still reach
 *  the trader through `RankedCandidate.ivRank`, marked rather than silently priced in. */
function usableIvRanks(assessed: Map<string, AssessedIvRank | null>): Map<string, IvRank> {
  return new Map(
    [...assessed].flatMap(
      ([ticker, reading]): Array<[string, IvRank]> =>
        reading !== null && isUsableState(reading.state)
          ? [[ticker, { value: reading.value, observedAt: reading.observedAt }]]
          : []
    )
  )
}

// A chain that never made it far enough to screen. Excluding the `ok` case here is what
// lets `chainStatusExclusion` promise a real exclusion rather than a maybe-undefined one.
type FailedChain = Exclude<TickerChainResult, { status: 'ok' }>

/** The exclusion a ticker-level chain failure reports to the trader. The chain query
 *  is bounded to the criteria DTE window, so an empty result means nothing is quoted
 *  *in that window* — the ticker may well list options at other expirations. */
function chainStatusExclusion(chain: FailedChain, criteria: ScreeningCriteria): ScreenerExclusion {
  switch (chain.status) {
    case 'no_options_listed':
      return {
        ticker: chain.ticker,
        code: 'no_options_listed',
        reason: `no puts quoted in the ${criteria.dteMin}–${criteria.dteMax} DTE window`
      }
    case 'data_unavailable':
      return dataUnavailable(chain.ticker)
  }
}

/** The strikes the engine can safely do Decimal math on. A malformed quote drops
 *  only itself (logged), never the ticker's other strikes — the engine throws on
 *  bad input, so the validation happens here rather than in a catch downstream. */
function wellFormedStrikes(chain: TickerChainResult & { status: 'ok' }): typeof chain.strikes {
  return chain.strikes.filter((strike) => {
    if (isWellFormedStrike(strike)) return true
    logger.warn(
      { ticker: chain.ticker, contractId: strike.contractId },
      'screener_malformed_strike_dropped'
    )
    return false
  })
}

function screenChain(chain: TickerChainResult, ctx: ScreenContext): TickerOutcome {
  if (chain.status !== 'ok') {
    return { exclusion: chainStatusExclusion(chain, ctx.criteria) }
  }

  // A ticker the store said nothing about is `unavailable`, never "no earnings" —
  // absence of an answer must not read as absence of risk.
  const earnings = ctx.earnings.get(chain.ticker) ?? { status: 'unavailable' }

  try {
    const screened = screenTicker(
      {
        ticker: chain.ticker,
        strikes: wellFormedStrikes(chain),
        ivRank: ctx.ivRanks.get(chain.ticker) ?? null,
        underlyingPrice: ctx.prices.get(chain.ticker) ?? null,
        earnings
      },
      ctx.criteria,
      ctx.currentDate
    )
    logger.debug(
      {
        ticker: chain.ticker,
        scored: screened.best !== null,
        excludedCount: screened.excluded.length,
        earnings: earnings.status
      },
      'screen_ticker_outcome'
    )
    return { screened }
  } catch (err) {
    // One malformed quote must not cost the trader every other ticker's results.
    logger.error({ ticker: chain.ticker, err }, 'screen_ticker_failed')
    return { exclusion: dataUnavailable(chain.ticker) }
  }
}

/** A screened ticker with no survivor reports its closest miss — `excluded[0]`, the
 *  strike that got furthest through the filter funnel. A ticker whose strikes were
 *  all dropped before screening (every quote malformed) still gets a row: every
 *  non-ranking ticker must appear in the excluded list, never vanish. */
function representativeExclusion(screened: TickerScreeningResult): ScreenerExclusion[] {
  if (screened.best !== null) return []
  if (screened.excluded.length === 0) return [dataUnavailable(screened.ticker)]
  const closest = screened.excluded[0]
  return [{ ticker: screened.ticker, code: closest.code, reason: closest.reason }]
}

function newestTimestamp(candidates: ScoredCandidate[]): string | null {
  return candidates.reduce<string | null>(
    (newest, candidate) =>
      newest === null || compareAsc(parseISO(candidate.timestamp), parseISO(newest)) > 0
        ? candidate.timestamp
        : newest,
    null
  )
}

function complete(results: ScreenerResults): ScreenerResults {
  logger.info(
    {
      status: results.status,
      rankedCount: results.ranked.length,
      excludedCount: results.excluded.length
    },
    'Watchlist candidate screen completed'
  )
  return results
}

const PROVIDER_UNAVAILABLE: ScreenerResults = {
  status: 'provider_unavailable',
  ranked: [],
  excluded: [],
  quoteTimestamp: null
}

export async function screenWatchlistCandidates(
  getProvider: () => MarketDataProvider,
  db: Database.Database,
  opts: ScreenOptions = {}
): Promise<ScreenerResults> {
  const criteria = opts.criteria ?? getScreeningCriteria(db)
  const currentDate = opts.currentDate ?? new Date()

  // An unconfigured provider (no API key yet) is the same trader-facing state as an
  // outage: the provider cannot serve data. Modelled, not an unexpected error.
  let provider: MarketDataProvider
  try {
    provider = getProvider()
  } catch (err) {
    logger.warn({ err }, 'screener_provider_unavailable')
    return complete(PROVIDER_UNAVAILABLE)
  }

  const chains = await pullWatchlistChains(provider, db, {
    window: { min: criteria.dteMin, max: criteria.dteMax },
    currentDate
  })

  // A provider outage says nothing about any individual ticker, so reporting
  // per-ticker exclusions would be inventing verdicts we do not have.
  if (chains.status === 'provider_unavailable') {
    return complete(PROVIDER_UNAVAILABLE)
  }

  const screenable = chains.tickers.flatMap((chain) =>
    chain.status === 'ok' ? [chain.ticker] : []
  )
  logger.debug({ tickers: screenable, criteria }, 'screen_watchlist_candidates_request')

  const [prices, earnings] = await Promise.all([
    readUnderlyingPrices(provider, screenable, criteria),
    readEarningsOrEmpty(db, screenable, criteria, currentDate, 'screener_earnings_read_failed')
  ])
  const assessedIvRanks = readAssessedIvr(db, screenable, currentDate, earnings)
  const ctx: ScreenContext = {
    ivRanks: usableIvRanks(assessedIvRanks),
    prices,
    earnings: new Map([...earnings].map(([ticker, known]) => [ticker, known.next])),
    criteria,
    currentDate
  }

  const outcomes = chains.tickers.map((chain) => screenChain(chain, ctx))

  const ranked = rankCandidates(
    outcomes.flatMap((outcome) => ('screened' in outcome ? [outcome.screened] : []))
  ).map(
    (candidate): RankedCandidate => ({
      ...candidate,
      ivRank: assessedIvRanks.get(candidate.ticker) ?? null
    })
  )
  const excluded = outcomes.flatMap((outcome) =>
    'screened' in outcome ? representativeExclusion(outcome.screened) : [outcome.exclusion]
  )

  return complete({ status: 'ok', ranked, excluded, quoteTimestamp: newestTimestamp(ranked) })
}
