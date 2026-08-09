// [US-65] screener service — joins US-64's put chains with the latest IVR reading and
// (only when the trader has a price ceiling set) the underlying quote, runs the pure
// screening engine per ticker, and returns a ranked candidate list plus one explained
// exclusion for every ticker that did not make it.
import type Database from 'better-sqlite3'
import { compareAsc, parseISO } from 'date-fns'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { isWellFormedStrike } from '../core/candidate-chain'
import {
  DEFAULT_SCREENING_CRITERIA,
  rankCandidates,
  screenTicker,
  type ExclusionCode,
  type IvRank,
  type ScoredCandidate,
  type ScreeningCriteria,
  type TickerScreeningResult
} from '../core/screener'
import { mapWithConcurrency } from '../concurrency'
import { logger } from '../logger'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'
import { getLatestIvrByUnderlying } from './ivr-snapshots'

// One stock-snapshot request per ticker — bounded for the same 429 hazard the
// chain pull caps against.
const QUOTE_FETCH_CONCURRENCY = 4

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

type ScreenOptions = { criteria?: ScreeningCriteria; currentDate?: Date }

// A ticker either got screened or never made it far enough to be — the second case
// carries the reason straight into the excluded list.
type TickerOutcome = { screened: TickerScreeningResult } | { exclusion: ScreenerExclusion }

// Everything the screener needs to judge one chain, past the boundary reads.
type ScreenContext = {
  ivRanks: Map<string, IvRank>
  prices: Map<string, string>
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
 * Latest IV rank per ticker. A read failure degrades to "unknown for everyone"
 * rather than sinking the run: IVR is display-only and never a hard filter, so
 * losing it must not cost the trader the whole screen.
 */
function readIvRanks(db: Database.Database, tickers: string[]): Map<string, IvRank> {
  try {
    return getLatestIvrByUnderlying(db, tickers)
  } catch (err) {
    logger.warn({ err, tickers }, 'screener_ivr_read_failed')
    return new Map()
  }
}

/**
 * Underlying prices, fetched only when a price ceiling is actually set — with the
 * ceiling off nothing reads them. Each ticker is fetched and isolated on its own:
 * one failure degrades to that ticker being absent — leaving only its ceiling
 * unevaluated — rather than silently disarming the ceiling for the whole watchlist.
 */
async function readUnderlyingPrices(
  provider: MarketDataProvider,
  tickers: string[],
  criteria: ScreeningCriteria
): Promise<Map<string, string>> {
  if (criteria.maxUnderlyingPrice === null) return new Map()

  const entries = await mapWithConcurrency(tickers, QUOTE_FETCH_CONCURRENCY, async (ticker) => {
    try {
      const price = (await provider.getStockQuotes([ticker])).get(ticker)?.price
      return price === undefined ? null : ([ticker, price] as [string, string])
    } catch (err) {
      logger.warn({ err, ticker }, 'screener_quote_fetch_failed')
      return null
    }
  })
  return new Map(entries.filter((entry) => entry !== null))
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

  try {
    const screened = screenTicker(
      {
        ticker: chain.ticker,
        strikes: wellFormedStrikes(chain),
        ivRank: ctx.ivRanks.get(chain.ticker) ?? null,
        underlyingPrice: ctx.prices.get(chain.ticker) ?? null,
        // US-70 supplies the earnings calendar; until then the gate cannot fire.
        earningsDate: null
      },
      ctx.criteria,
      ctx.currentDate
    )
    logger.debug(
      {
        ticker: chain.ticker,
        scored: screened.best !== null,
        excludedCount: screened.excluded.length
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
  const criteria = opts.criteria ?? DEFAULT_SCREENING_CRITERIA
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

  const ctx: ScreenContext = {
    ivRanks: readIvRanks(db, screenable),
    prices: await readUnderlyingPrices(provider, screenable, criteria),
    criteria,
    currentDate
  }

  const outcomes = chains.tickers.map((chain) => screenChain(chain, ctx))

  const ranked = rankCandidates(
    outcomes.flatMap((outcome) => ('screened' in outcome ? [outcome.screened] : []))
  )
  const excluded = outcomes.flatMap((outcome) =>
    'screened' in outcome ? representativeExclusion(outcome.screened) : [outcome.exclusion]
  )

  return complete({ status: 'ok', ranked, excluded, quoteTimestamp: newestTimestamp(ranked) })
}
