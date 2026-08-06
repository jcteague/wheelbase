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

// Each ticker's chain is a fully-paginated walk, so an unbounded fan-out over a large
// watchlist bursts hundreds of requests and earns a 429 from a healthy provider —
// which classifies as provider-level and would surface as a fake outage.
export const CHAIN_FETCH_CONCURRENCY = 4

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

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

  const outcomes = await mapWithConcurrency(tickers, CHAIN_FETCH_CONCURRENCY, (ticker) =>
    pullTickerChain(provider, ticker, range)
  )

  // Any ticker the provider actually answered for — with strikes or a legitimately
  // empty chain — proves the provider is up. Without that proof, a provider-level
  // failure is an outage even if some other ticker failed for its own reason (a
  // delisted 404), which must not mask the outage from the screener.
  const providerAnswered = outcomes.some(
    (o) => o.result.status === 'ok' || o.result.status === 'no_options_listed'
  )
  const anyProviderFailure = outcomes.some((o) => o.failure === 'provider')
  const isOutage = !providerAnswered && anyProviderFailure

  const status: WatchlistChainsResult['status'] = isOutage ? 'provider_unavailable' : 'ok'
  const okCount = outcomes.filter((o) => o.result.status === 'ok').length
  const unavailableCount = outcomes.filter((o) => o.result.status === 'data_unavailable').length
  logger.info(
    { status, tickerCount: tickers.length, okCount, unavailableCount },
    'Watchlist chain pull completed'
  )

  return { status, tickers: outcomes.map((o) => o.result) }
}
