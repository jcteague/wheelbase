import type { Observable } from 'rxjs'

// --- Error types ---

export type MarketDataErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'rate_limited'
  | 'streaming_unsupported'
  | 'unknown'

export class MarketDataError extends Error {
  readonly code: MarketDataErrorCode

  constructor(code: MarketDataErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'MarketDataError'
  }
}

// --- Data types ---

export type StockQuote = {
  price: string
  bid: string
  ask: string
  change: string
  changePercent: string
  prevClose: string
  volume: number
  timestamp: string
}

export type OptionSnapshot = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks?: {
    delta: string
    gamma: string
    theta: string
    vega: string
  }
  impliedVolatility?: string
  timestamp: string
}

export type OptionChainFilter = {
  underlying: string
  expirationFrom?: string
  expirationTo?: string
  type?: 'put' | 'call'
  strikeFrom?: string
  strikeTo?: string
  limit?: number
  cursor?: string
}

// --- Streaming types ---

export type MarketDataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'

export type StreamEvent<T> = {
  feed: MarketDataFeed
  symbol: string
  data: T
  timestamp: string
}

export type StreamError = {
  feed: MarketDataFeed
  code: string
  message: string
  reconnectable: boolean
}

// --- Provider interface ---

export type MarketDataProvider = {
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshot(contractId: string): Promise<OptionSnapshot>
  getOptionChainSnapshot(filter: OptionChainFilter): Promise<OptionSnapshot[]>
  supportsStreaming(feed: MarketDataFeed): boolean
  connect(feeds?: MarketDataFeed[]): Promise<void>
  disconnect(): Promise<void>
  stream(
    feed: MarketDataFeed,
    symbols: string[]
  ): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}
