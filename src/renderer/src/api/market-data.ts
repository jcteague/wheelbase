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

export async function getStockQuotes(tickers: string[]): Promise<StockQuotesByTicker> {
  const result = await window.api.getStockQuotes({ tickers })
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.quotes as StockQuotesByTicker
}

export async function getMarketStatus(): Promise<MarketStatus> {
  const result = await window.api.getMarketStatus()
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.status as MarketStatus
}
