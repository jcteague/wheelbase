import type { Subscription } from 'rxjs'
import {
  type MarketDataProvider,
  type MarketStatus,
  type OptionSnapshot,
  type StockQuote,
  type StreamError
} from '../integrations/market-data-provider'
import { logger } from '../logger'

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

export type FetchOptionSnapshotsResult = {
  snapshots: Record<string, OptionSnapshot>
  unavailable: boolean
}

export async function fetchOptionSnapshots(
  provider: MarketDataProvider,
  symbols: string[]
): Promise<FetchOptionSnapshotsResult> {
  if (symbols.length === 0) return { snapshots: {}, unavailable: false }
  try {
    const map = await provider.getOptionSnapshots(symbols)
    return { snapshots: Object.fromEntries(map), unavailable: false }
  } catch (err) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code: unknown }).code
        : null
    if (code === 'options_no_subscription') {
      logger.warn('options data unavailable: OPRA subscription required')
      return { snapshots: {}, unavailable: true }
    }
    throw err
  }
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
    try {
      await provider.connect(['stockQuotes'])
      state.connected = true
    } catch (err) {
      // Streaming unavailable (e.g. insufficient subscription) — REST quotes still work
      logger.warn({ err }, 'stock quote stream connect failed; continuing without streaming')
      return tickers
    }
  }
  state.activeSub = provider.stream('stockQuotes', tickers).subscribe({
    next: (event) =>
      onTick(event.symbol, { ...flattenStockQuote(event.data as StockQuote), prevClose: null }),
    error: (err: unknown) => onError(err as StreamError)
  })
  return tickers
}
