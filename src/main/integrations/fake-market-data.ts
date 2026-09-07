import { Observable, Subject } from 'rxjs'
import { filter } from 'rxjs/operators'
import { parseOccSymbol } from '../core/option-symbol'
import {
  MarketDataError,
  type MarketDataErrorCode,
  type MarketDataFeed,
  type MarketDataProvider,
  type OptionChainFilter,
  type OptionChainQuote,
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

  async getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionChainQuote[]> {
    this.maybeThrow()
    const raw = process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    if (!raw) return []
    const all = JSON.parse(raw) as Record<string, OptionSnapshot | Partial<OptionChainQuote>>
    return Object.entries(all).flatMap(([symbol, snapshot]) => {
      // Fixtures are keyed by OCC symbol and may hold bare OptionSnapshots — every e2e spec
      // predating the chain endpoint seeds them that way — so per-strike identity is derived
      // from the key rather than assumed present on the value.
      const identity = parseOccSymbol(symbol)
      if (!identity) return []
      const { underlying, ...quoteFields } = identity
      if (underlying !== filter.underlying) return []
      const quote: OptionChainQuote = { ...quoteFields, ...(snapshot as OptionChainQuote) }
      if (filter.type && quote.contractType !== filter.type) return []
      if (filter.expirationFrom && quote.expiration < filter.expirationFrom) return []
      if (filter.expirationTo && quote.expiration > filter.expirationTo) return []
      return [quote]
    })
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
