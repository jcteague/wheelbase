// [US-110] PMCC screener service — pulls every watchlist ticker's calls over two windows
// (the LEAPS window and the short-call window), joins the underlying quote, earnings and
// IV rank, runs the pure PMCC engine per ticker, and returns one ranked diagonal per
// surviving ticker plus one explained exclusion for every ticker that did not make it.
import type Database from 'better-sqlite3'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import type { DteWindow } from '../core/candidate-chain'
import {
  rankPmccCandidates,
  screenPmccTicker,
  type PmccScoredCandidate,
  type PmccScreeningCriteria,
  type PmccTickerScreeningResult
} from '../core/pmcc-screener'
import { logger } from '../logger'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'
import { readEarningsOrEmpty } from './earnings-horizon'
import { lookupOf, type IvRankPair } from './iv-rank-lookup'
import type { IvRunState } from './iv-run-state'
import { getPmccScreeningCriteria } from './pmcc-screening-criteria'
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
import { fetchIsolatedStockQuotes } from './underlying-quotes'
import { listWatchlist } from './watchlist'

export type PmccScreenOptions = {
  criteria?: PmccScreeningCriteria
  currentDate: Date
  runState: IvRunState
}

/** A ranked diagonal carries the IV-rank lookup pair — exactly one of `ivRank` /
 *  `ivRankAbsence` is non-null — exactly as the wheel's `RankedCandidate` does. */
export type RankedPmccCandidate = Omit<PmccScoredCandidate, 'ivRank'> & IvRankPair

export type PmccScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: RankedPmccCandidate[] // rank order; one diagonal per ticker
  excluded: ScreenerExclusion[] // one row per non-ranking ticker, watchlist order
  quoteTimestamp: string | null // newest ranked leg timestamp
}

type CallChains = {
  status: 'ok' | 'provider_unavailable'
  long: TickerChainResult[]
  short: TickerChainResult[]
}

const PROVIDER_UNAVAILABLE: PmccScreenerResults = {
  status: 'provider_unavailable',
  ranked: [],
  excluded: [],
  quoteTimestamp: null
}

function longWindow(criteria: PmccScreeningCriteria): DteWindow {
  return { min: criteria.longDteMin, max: criteria.longDteMax }
}

function shortWindow(criteria: PmccScreeningCriteria): DteWindow {
  return { min: criteria.shortDteMin, max: criteria.shortDteMax }
}

/**
 * Both call windows, one after the other so the burst stays at the chain pull's own
 * concurrency cap — which holds only while the caller starts no other provider reads until
 * this settles. An outage on the LEAPS pull already decides the screen, so the short pull
 * is not attempted.
 */
async function pullCallWindows(
  provider: MarketDataProvider,
  db: Database.Database,
  criteria: PmccScreeningCriteria,
  currentDate: Date
): Promise<CallChains> {
  const long = await pullWatchlistChains(provider, db, {
    type: 'call',
    window: longWindow(criteria),
    currentDate
  })
  if (long.status === 'provider_unavailable') {
    return { status: 'provider_unavailable', long: [], short: [] }
  }
  const short = await pullWatchlistChains(provider, db, {
    type: 'call',
    window: shortWindow(criteria),
    currentDate
  })
  return { status: short.status, long: long.tickers, short: short.tickers }
}

function screenTickerChains(
  long: TickerChainResult,
  short: TickerChainResult,
  ctx: ScreenContext<PmccScreeningCriteria>
): TickerOutcome<PmccTickerScreeningResult> {
  // The LEAPS window is checked first: without a LEAPS there is no diagonal to price.
  if (long.status !== 'ok') {
    return { exclusion: chainFailureExclusion(long, 'calls', longWindow(ctx.criteria)) }
  }
  if (short.status !== 'ok') {
    return { exclusion: chainFailureExclusion(short, 'calls', shortWindow(ctx.criteria)) }
  }

  const ticker = long.ticker
  logger.debug(
    { ticker, longCount: long.strikes.length, shortCount: short.strikes.length },
    'pmcc_screen_ticker_chains'
  )

  try {
    const screened = screenPmccTicker(
      {
        ticker,
        longCalls: wellFormedStrikes(long),
        shortCalls: wellFormedStrikes(short),
        ivRank: ctx.ivRanks.get(ticker) ?? null,
        underlyingPrice: ctx.prices.get(ticker) ?? null,
        // A ticker the store said nothing about is `unavailable`, never "no earnings".
        earnings: ctx.earnings.get(ticker) ?? { status: 'unavailable' }
      },
      ctx.criteria,
      ctx.currentDate
    )
    logger.debug(
      {
        ticker,
        scored: screened.best !== null,
        returnPerDelta: screened.best?.returnPerDelta ?? null,
        closestMiss: screened.excluded[0]?.reason ?? null
      },
      'pmcc_screen_ticker_outcome'
    )
    return { screened }
  } catch (err) {
    // One malformed input must not cost the trader every other ticker's results.
    logger.error({ ticker, err }, 'pmcc_screen_ticker_failed')
    return { exclusion: dataUnavailable(ticker) }
  }
}

function complete(results: PmccScreenerResults): PmccScreenerResults {
  logger.info(
    {
      status: results.status,
      rankedCount: results.ranked.length,
      excludedCount: results.excluded.length
    },
    'PMCC screen completed'
  )
  return results
}

export async function screenWatchlistPmccCandidates(
  getProvider: () => MarketDataProvider,
  db: Database.Database,
  opts: PmccScreenOptions
): Promise<PmccScreenerResults> {
  const criteria = opts.criteria ?? getPmccScreeningCriteria(db)
  const currentDate = opts.currentDate

  // An unconfigured provider is the same trader-facing state as an outage.
  let provider: MarketDataProvider
  try {
    provider = getProvider()
  } catch (err) {
    logger.warn({ err }, 'pmcc_screener_provider_unavailable')
    return complete(PROVIDER_UNAVAILABLE)
  }

  const tickers = listWatchlist(db).map((entry) => entry.ticker)
  logger.debug({ tickers, criteria }, 'pmcc_screen_request')

  const chains = await pullCallWindows(provider, db, criteria, currentDate)

  // An outage on either pull says nothing about any individual ticker.
  if (chains.status === 'provider_unavailable') return complete(PROVIDER_UNAVAILABLE)

  // Only once the chain pulls have settled: overlapping the quote burst with theirs would
  // double the request rate, and a 429 on a chain request reads as a provider outage.
  // Quotes are always read: the LEAPS extrinsic needs them, and each ticker's fetch is
  // isolated, so a failure leaves only that ticker's extrinsic unknown.
  const [quotes, earnings] = await Promise.all([
    fetchIsolatedStockQuotes(provider, tickers),
    readEarningsOrEmpty(
      db,
      tickers,
      { dteMax: criteria.shortDteMax },
      currentDate,
      'pmcc_screener_earnings_read_failed'
    ),
    // Awaited: the IV-rank read below ages its readings against this calendar.
    ensureTradingCalendar(db, () => provider, currentDate)
  ])

  const ivRankLookups = readIvRanks(db, tickers, currentDate, earnings, opts.runState)
  const ctx: ScreenContext<PmccScreeningCriteria> = {
    ivRanks: usableIvRanks(ivRankLookups),
    prices: new Map([...quotes].map(([ticker, quote]) => [ticker, quote.price])),
    earnings: new Map([...earnings].map(([ticker, known]) => [ticker, known.next])),
    criteria,
    currentDate
  }

  const shortByTicker = new Map(chains.short.map((chain) => [chain.ticker, chain]))
  const outcomes = chains.long.map((long) =>
    screenTickerChains(
      long,
      shortByTicker.get(long.ticker) ?? { ticker: long.ticker, status: 'data_unavailable' },
      ctx
    )
  )

  const { screened, excluded } = partitionOutcomes(outcomes)
  const ranked = rankPmccCandidates(screened).map(
    (candidate): RankedPmccCandidate => ({
      ...candidate,
      ...lookupOf(ivRankLookups, candidate.ticker)
    })
  )

  return complete({ status: 'ok', ranked, excluded, quoteTimestamp: newestTimestamp(ranked) })
}
