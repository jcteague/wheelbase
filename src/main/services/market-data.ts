import type { Subscription } from 'rxjs'
import {
  type MarketDataProvider,
  type MarketStatus,
  type StockQuote,
  type StreamError
} from '../integrations/market-data-provider'

export type IpcStockQuote = {
  price: string
  bid: string
  ask: string
  prevClose: string | null
  volume: number
  timestamp: string
}

export type StreamState = {
  connected: boolean
  activeSub: Subscription | null
}

export function newStreamState(): StreamState {
  return { connected: false, activeSub: null }
}

function flattenStockQuote(q: StockQuote): IpcStockQuote {
  return {
    price: q.price,
    bid: q.bid,
    ask: q.ask,
    prevClose: q.prevClose || null,
    volume: q.volume,
    timestamp: q.timestamp
  }
}

export async function fetchStockQuotes(
  provider: MarketDataProvider,
  tickers: string[]
): Promise<Record<string, IpcStockQuote>> {
  if (tickers.length === 0) return {}
  const map = await provider.getStockQuotes(tickers)
  return Object.fromEntries(Array.from(map, ([t, q]) => [t, flattenStockQuote(q)]))
}

export async function fetchMarketStatus(provider: MarketDataProvider): Promise<MarketStatus> {
  return provider.getMarketStatus()
}

export async function subscribeToStockQuotes(
  state: StreamState,
  provider: MarketDataProvider,
  tickers: string[],
  onTick: (ticker: string, quote: IpcStockQuote) => void,
  onError: (err: StreamError) => void
): Promise<string[]> {
  state.activeSub?.unsubscribe()
  state.activeSub = null
  if (tickers.length === 0) return []
  if (!state.connected) {
    await provider.connect(['stockQuotes'])
    state.connected = true
  }
  state.activeSub = provider.stream('stockQuotes', tickers).subscribe({
    next: (event) =>
      onTick(event.symbol, { ...flattenStockQuote(event.data as StockQuote), prevClose: null }),
    error: (err: unknown) => onError(err as StreamError)
  })
  return tickers
}
