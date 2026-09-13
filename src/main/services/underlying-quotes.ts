// [US-96] Shared underlying-quote read for the screener and the watchlist snapshot.
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { mapWithConcurrency } from '../concurrency'
import { logger } from '../logger'
import { flattenStockQuote, type IpcStockQuote } from './market-data'

// One stock-snapshot request per ticker — bounded for the 429 hazard an unbounded
// fan-out over the whole watchlist would earn.
const QUOTE_FETCH_CONCURRENCY = 4

/**
 * Latest quote per ticker, each ticker fetched and isolated on its own: one failure
 * degrades to that ticker being absent from the map — leaving only whatever depended
 * on its price unevaluated — rather than sinking the quotes the others returned.
 */
export async function fetchIsolatedStockQuotes(
  provider: MarketDataProvider,
  tickers: string[]
): Promise<Map<string, IpcStockQuote>> {
  const entries = await mapWithConcurrency(tickers, QUOTE_FETCH_CONCURRENCY, async (ticker) => {
    try {
      const quote = (await provider.getStockQuotes([ticker])).get(ticker)
      return quote === undefined ? null : ([ticker, flattenStockQuote(quote)] as const)
    } catch (err) {
      logger.warn({ err, ticker }, 'underlying_quote_fetch_failed')
      return null
    }
  })
  return new Map(entries.filter((entry) => entry !== null))
}
