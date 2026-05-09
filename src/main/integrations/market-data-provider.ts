import type { Observable } from 'rxjs'

// --- Error types ---

export type MarketDataErrorCode =
  | 'auth_failed'
  | 'network_error'
  | 'options_no_subscription'
  | 'rate_limited'
  | 'stream_disconnected'
  | 'streaming_unsupported'
  | 'subscription_failed'
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
  prevClose: string // 2dp; '' on stream ticks, set on REST snapshot
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
  greeks: {
    delta: string
    gamma: string
    theta: string
    vega: string
    iv: string
  }
  timestamp: string
}

export type BrokerActivity = {
  activityId: string
  activityType: string
  symbol: string
  qty: number
  price: string
  transactionTime: string
}

export type ActivityFilter = {
  type: string
  since?: string
}

export type AccountInfo = {
  buyingPower: string
  portfolioValue: string
  cash: string
  environment: 'paper' | 'live'
}

export type MarketStatus = {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}

// --- Streaming types ---

export type DataFeed = 'stockQuotes' | 'optionQuotes' | 'optionTrades'

export type StreamEvent<T> = {
  feed: DataFeed
  symbol: string
  data: T
  timestamp: string
}

export type StreamError = {
  feed: DataFeed
  code: string
  message: string
  reconnectable: boolean
}

// --- Provider interface ---

export type MarketDataProvider = {
  getStockQuotes(tickers: string[]): Promise<Map<string, StockQuote>>
  getOptionSnapshots(contractIds: string[]): Promise<Map<string, OptionSnapshot>>
  getActivities(filter: ActivityFilter): Promise<BrokerActivity[]>
  getAccountInfo(): Promise<AccountInfo>
  getMarketStatus(): Promise<MarketStatus>
  supportsStreaming(feed: DataFeed): boolean
  connect(feeds?: DataFeed[]): Promise<void>
  disconnect(): Promise<void>
  stream(feed: DataFeed, symbols: string[]): Observable<StreamEvent<StockQuote | OptionSnapshot>>
}
