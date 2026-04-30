import { Observable, Subject } from 'rxjs'
import { filter } from 'rxjs/operators'
import {
  MarketDataError,
  type AccountInfo,
  type BrokerActivity,
  type DataFeed,
  type MarketDataProvider,
  type MarketStatus,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent,
  type StreamError
} from './market-data-provider'

// Module-level subjects so IPC test handlers can push events from outside this class.
export const fakeStockTickSubject = new Subject<StreamEvent<StockQuote>>()
export const fakeStreamErrorSubject = new Subject<StreamError>()

/**
 * In-process fake provider for e2e tests (enabled via WHEELBASE_MARKET_MOCK=true).
 * Reads fixture data from environment variables:
 *   WHEELBASE_MOCK_MARKET_STATUS   JSON string matching MarketStatus shape
 *   WHEELBASE_MOCK_STOCK_QUOTES    JSON string: Record<ticker, StockQuote>
 */
export class FakeMarketDataProvider implements MarketDataProvider {
  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    const raw = process.env.WHEELBASE_MOCK_STOCK_QUOTES
    const all: Record<string, StockQuote> = raw
      ? (JSON.parse(raw) as Record<string, StockQuote>)
      : {}
    const result = new Map<string, StockQuote>()
    for (const ticker of tickers) {
      if (all[ticker]) result.set(ticker, all[ticker])
    }
    return result
  }

  async getMarketStatus(): Promise<MarketStatus> {
    const raw = process.env.WHEELBASE_MOCK_MARKET_STATUS
    return raw
      ? (JSON.parse(raw) as MarketStatus)
      : { isOpen: false, session: 'closed', nextOpen: '', nextClose: '' }
  }

  async connect(): Promise<void> {
    // Instant connection in fake mode; ignores feed selection.
  }

  async disconnect(): Promise<void> {
    // Nothing to close
  }

  supportsStreaming(feed: DataFeed): boolean {
    return feed === 'stockQuotes'
  }

  stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
    if (feed !== 'stockQuotes') {
      throw new MarketDataError(
        'streaming_unsupported',
        `FakeMarketDataProvider: unsupported feed ${feed}`
      )
    }
    return fakeStockTickSubject.pipe(
      filter((event) => symbols.includes(event.symbol))
    ) as Observable<StreamEvent<StockQuote | OptionSnapshot>>
  }

  async getOptionSnapshots(): Promise<Map<string, OptionSnapshot>> {
    return new Map()
  }

  async getActivities(): Promise<BrokerActivity[]> {
    return []
  }

  async getAccountInfo(): Promise<AccountInfo> {
    throw new MarketDataError('unknown', 'FakeMarketDataProvider: getAccountInfo not implemented')
  }
}
