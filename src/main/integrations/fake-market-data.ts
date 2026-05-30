import { Observable, Subject } from 'rxjs'
import { filter } from 'rxjs/operators'
import {
  MarketDataError,
  type MarketDataErrorCode,
  type MarketDataFeed,
  type MarketDataProvider,
  type OptionChainFilter,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent,
  type StreamError
} from './market-data-provider'

// Module-level subjects so IPC test handlers can push events from outside this class.
export const fakeStockTickSubject = new Subject<StreamEvent<StockQuote>>()
export const fakeStreamErrorSubject = new Subject<StreamError>()

function buildMockMap<T>(envVar: string, keys: string[]): Map<string, T> {
  const raw = process.env[envVar]
  const all: Record<string, T> = raw ? (JSON.parse(raw) as Record<string, T>) : {}
  const result = new Map<string, T>()
  for (const key of keys) {
    if (all[key]) result.set(key, all[key])
  }
  return result
}

/**
 * In-process fake provider for e2e tests (enabled via FAKE_MARKET_DATA=true).
 * Reads fixture data from environment variables:
 *   WHEELBASE_MOCK_STOCK_QUOTES       JSON string: Record<ticker, StockQuote>
 *   WHEELBASE_MOCK_OPTION_SNAPSHOTS   JSON string: Record<symbol, OptionSnapshot>
 *   FAKE_MARKET_DATA_ERROR            MarketDataErrorCode — when set, all calls throw this error
 */
export class FakeMarketDataProvider implements MarketDataProvider {
  private maybeThrow(): void {
    const code = process.env.FAKE_MARKET_DATA_ERROR
    if (code) throw new MarketDataError(code as MarketDataErrorCode, `Fake error: ${code}`)
  }

  async getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>> {
    this.maybeThrow()
    return buildMockMap<StockQuote>('WHEELBASE_MOCK_STOCK_QUOTES', tickers)
  }

  async getOptionSnapshot(contractId: string): Promise<OptionSnapshot> {
    this.maybeThrow()
    const map = buildMockMap<OptionSnapshot>('WHEELBASE_MOCK_OPTION_SNAPSHOTS', [contractId])
    const snapshot = map.get(contractId)
    if (!snapshot) {
      throw new MarketDataError('unknown', `FakeMarketDataProvider: no snapshot for ${contractId}`)
    }
    return snapshot
  }

  async getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]> {
    this.maybeThrow()
    const raw = process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, OptionSnapshot>
    return Object.values(all).filter(() => !!filter.underlying)
  }

  async connect(): Promise<void> {
    // Instant connection in fake mode; ignores feed selection.
  }

  async disconnect(): Promise<void> {
    // Nothing to close
  }

  supportsStreaming(feed: MarketDataFeed): boolean {
    return feed === 'stockQuotes'
  }

  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>> {
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
}
