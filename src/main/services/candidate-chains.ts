// [US-64] candidate-chains — pull each watchlist ticker's put chain through the
// MarketDataProvider adapter, isolating per-ticker failures and distinguishing a
// whole-provider outage from a legitimately empty result.
import type Database from 'better-sqlite3'
import { MarketDataError, type MarketDataProvider } from '../integrations/market-data-provider'
import {
  DEFAULT_DTE_WINDOW,
  classifyChainFailure,
  dteWindowToExpirationRange,
  toCandidateStrikes,
  type CandidateStrike,
  type DteWindow
} from '../core/candidate-chain'
import { logger } from '../logger'
import { listWatchlist } from './watchlist'

export type TickerChainResult =
  | { ticker: string; status: 'ok'; strikes: CandidateStrike[] }
  | { ticker: string; status: 'no_options_listed' }
  | { ticker: string; status: 'data_unavailable' }

export type WatchlistChainsResult = {
  status: 'ok' | 'provider_unavailable'
  tickers: TickerChainResult[]
}

// Per-ticker outcome plus the failure level used to compute the overall status.
// `failure` is 'provider' only when the fetch threw a provider-level MarketDataError.
type TickerOutcome = { result: TickerChainResult; failure: 'ticker' | 'provider' | null }

type PullOptions = { window?: DteWindow; currentDate?: Date }

async function pullTickerChain(
  provider: MarketDataProvider,
  ticker: string,
  range: { from: string; to: string }
): Promise<TickerOutcome> {
  try {
    const quotes = await provider.getOptionChainSnapshot({
      underlying: ticker,
      expirationFrom: range.from,
      expirationTo: range.to,
      type: 'put'
    })

    if (quotes.length === 0) {
      logger.debug({ ticker }, 'chain_pull_no_options_listed')
      return { result: { ticker, status: 'no_options_listed' }, failure: null }
    }

    const strikes = toCandidateStrikes(quotes)
    logger.debug({ ticker, strikeCount: strikes.length }, 'chain_pull_ok')
    return { result: { ticker, status: 'ok', strikes }, failure: null }
  } catch (err) {
    if (err instanceof MarketDataError) {
      const failure = classifyChainFailure(err.code)
      if (failure === 'ticker') {
        logger.debug({ ticker, code: err.code }, 'chain_pull_ticker_unavailable')
      } else {
        logger.warn({ ticker, code: err.code }, 'chain_pull_provider_error')
      }
      return { result: { ticker, status: 'data_unavailable' }, failure }
    }
    logger.error({ ticker, err }, 'chain_pull_unexpected_error')
    return { result: { ticker, status: 'data_unavailable' }, failure: 'provider' }
  }
}

export async function pullWatchlistChains(
  provider: MarketDataProvider,
  db: Database.Database,
  opts: PullOptions = {}
): Promise<WatchlistChainsResult> {
  const tickers = listWatchlist(db).map((entry) => entry.ticker)
  const window = opts.window ?? DEFAULT_DTE_WINDOW
  const currentDate = opts.currentDate ?? new Date()
  const range = dteWindowToExpirationRange(currentDate, window)
  logger.debug({ tickers, range }, 'pull_watchlist_chains_request')

  const outcomes = await Promise.all(
    tickers.map((ticker) => pullTickerChain(provider, ticker, range))
  )

  const anyOk = outcomes.some((o) => o.result.status === 'ok')
  const everyFailureIsProviderLevel = outcomes.every((o) => o.failure === 'provider')
  const isOutage = tickers.length > 0 && !anyOk && everyFailureIsProviderLevel

  const status: WatchlistChainsResult['status'] = isOutage ? 'provider_unavailable' : 'ok'
  logger.debug(
    {
      status,
      tickerCount: tickers.length,
      okCount: outcomes.filter((o) => o.result.status === 'ok').length
    },
    'pull_watchlist_chains_result'
  )

  return { status, tickers: outcomes.map((o) => o.result) }
}
