// [US-65] screener service — joins US-64's put chains with the latest IVR reading and
// (only when the trader has a price ceiling set) the underlying quote, runs the pure
// screening engine per ticker, and returns a ranked candidate list plus one explained
// exclusion for every ticker that did not make it.
import type Database from 'better-sqlite3'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import type { DteWindow } from '../core/candidate-chain'
import {
  rankCandidates,
  screenTicker,
  type ScoredCandidate,
  type ScreeningCriteria,
  type TickerScreeningResult
} from '../core/screener'
import { logger } from '../logger'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'
import { readEarningsOrEmpty } from './earnings-horizon'
import { getScreeningCriteria } from './screening-criteria'
import { fetchIsolatedStockQuotes } from './underlying-quotes'
import type { IvRunState } from './iv-run-state'
import { lookupOf, type IvRankPair } from './iv-rank-lookup'
import {
  chainFailureExclusion,
  dataUnavailable,
  newestTimestamp,
  partitionOutcomes,
  readIvRanks,
  usableIvRanks,
  wellFormedStrikes,
  type ScreenContext,
  type ScreenerExclusion,
  type TickerOutcome
} from './screener-shared'
import { ensureTradingCalendar } from './trading-calendar-store'

// The exclusion row is part of this service's result, so its type is re-exported here.
export type { ScreenerExclusion, ScreenerExclusionCode } from './screener-shared'

export type RankedCandidate = Omit<ScoredCandidate, 'ivRank'> & IvRankPair

export type ScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: RankedCandidate[] // rank order; empty = nothing survived
  excluded: ScreenerExclusion[] // one row per non-ranking ticker, watchlist order
  quoteTimestamp: string | null // newest ranked strike timestamp, for the stale badge
}

type ScreenOptions = { criteria?: ScreeningCriteria; currentDate?: Date; runState: IvRunState }

function putWindow(criteria: ScreeningCriteria): DteWindow {
  return { min: criteria.dteMin, max: criteria.dteMax }
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

function screenChain(
  chain: TickerChainResult,
  ctx: ScreenContext<ScreeningCriteria>
): TickerOutcome<TickerScreeningResult> {
  if (chain.status !== 'ok') {
    return { exclusion: chainFailureExclusion(chain, 'puts', putWindow(ctx.criteria)) }
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
  opts: ScreenOptions
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
    window: putWindow(criteria),
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
    readEarningsOrEmpty(db, screenable, criteria, currentDate, 'screener_earnings_read_failed'),
    // Awaited, not fired and forgotten: the IVR read below ages its readings against
    // this calendar and must see refreshed rows. Self-throttling and self-logging, and it
    // never rejects — a calendar failure costs freshness only, never `provider_unavailable`.
    ensureTradingCalendar(db, () => provider, currentDate)
  ])
  const ivRankLookups = readIvRanks(db, screenable, currentDate, earnings, opts.runState)
  const ctx: ScreenContext<ScreeningCriteria> = {
    ivRanks: usableIvRanks(ivRankLookups),
    prices,
    earnings: new Map([...earnings].map(([ticker, known]) => [ticker, known.next])),
    criteria,
    currentDate
  }

  const outcomes = chains.tickers.map((chain) => screenChain(chain, ctx))

  const { screened, excluded } = partitionOutcomes(outcomes)
  const ranked = rankCandidates(screened).map(
    (candidate): RankedCandidate => ({
      ...candidate,
      ...lookupOf(ivRankLookups, candidate.ticker)
    })
  )

  return complete({ status: 'ok', ranked, excluded, quoteTimestamp: newestTimestamp(ranked) })
}
