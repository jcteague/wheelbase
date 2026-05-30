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

export type OptionGreeks = {
  delta: string
  gamma: string
  theta: string
  vega: string
  iv: string
}

export type OptionSnapshot = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks: OptionGreeks
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
