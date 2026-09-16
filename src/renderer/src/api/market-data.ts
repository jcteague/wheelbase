import { apiError } from './error'

export type StockQuote = {
  price: string
  bid: string
  ask: string
  prevClose: string | null
  volume: number
  timestamp: string
}

export type StockQuotesByTicker = Record<string, StockQuote>

export type MarketStatus = {
  isOpen: boolean
  nextOpen: string
  nextClose: string
  session: 'regular' | 'pre' | 'post' | 'closed'
}

// Hand-maintained mirror of `OptionSnapshot` in
// `src/main/integrations/market-data-provider.ts` — that type is the source of truth.
export type OptionGreeks = {
  delta: string
  gamma: string
  theta: string
  vega: string
}

export type OptionSnapshot = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  /** all four present or the block is absent — the producer never sends a partial set */
  greeks?: OptionGreeks
  /** 4dp decimal string, e.g. '0.2840'; independent of `greeks` */
  impliedVolatility?: string
  timestamp: string
}

export type OptionSnapshotsBySymbol = Record<string, OptionSnapshot>

export type OptionSnapshotsResult = {
  snapshots: OptionSnapshotsBySymbol
  unavailable: boolean
}

export async function getStockQuotes(tickers: string[]): Promise<StockQuotesByTicker> {
  const result = await window.api.marketData.stockQuotes({ tickers })
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.quotes as StockQuotesByTicker
}

export async function getMarketStatus(): Promise<MarketStatus> {
  const result = await window.api.marketData.marketStatus()
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.status as MarketStatus
}

export async function getOptionSnapshots(symbols: string[]): Promise<OptionSnapshotsResult> {
  const result = await window.api.getOptionSnapshots({ symbols })
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return {
    snapshots: result.snapshots as OptionSnapshotsBySymbol,
    unavailable: result.unavailable ?? false
  }
}
