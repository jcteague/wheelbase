import type { Subscription } from 'rxjs'
import {
  MarketDataError,
  type MarketDataProvider,
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
  // Last ticker set the renderer asked for, replayed by restartStockQuoteStream when the
  // credentials behind the socket change.
  tickers: string[]
}

export function newStreamState(): StreamState {
  return { connected: false, activeSub: null, tickers: [] }
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
  logger.debug({ symbols }, 'fetch_option_snapshots_request')
  const entries = await Promise.all(
    symbols.map(async (s) => {
      try {
        const snap = await provider.getOptionSnapshot(s)
        return [s, snap] as [string, OptionSnapshot]
      } catch (err) {
        if (err instanceof MarketDataError && err.code === 'not_found') {
          logger.debug(
            { symbol: s, code: err.code, message: err.message },
            'option_snapshot_missing'
          )
          return null
        }
        throw err
      }
    })
  )
  const found = entries.filter((e): e is [string, OptionSnapshot] => e !== null)
  const unavailable = found.length === 0 && symbols.length > 0
  logger.debug(
    { requested: symbols.length, resolved: found.length, unavailable },
    'fetch_option_snapshots_result'
  )
  if (unavailable) return { snapshots: {}, unavailable: true }
  return { snapshots: Object.fromEntries(found), unavailable: false }
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
  state.tickers = tickers
  if (tickers.length === 0) {
    // Dropping our rxjs subscription does not release the provider's: the socket holds its
    // per-symbol subscriptions against the plan's symbol cap until told to let them go.
    if (state.connected) provider.stream('stockQuotes', [])
    return []
  }
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

/**
 * Rebuilds the stock-quote stream against whatever credentials the provider now resolves.
 *
 * Alpaca authenticates once per socket, so a credential change (save, remove, or a paper↔live
 * switch) only takes effect after a full teardown and reconnect. The remembered ticker set is
 * replayed so the renderer never has to re-issue `set-stock-quote-tickers`.
 */
export async function restartStockQuoteStream(
  state: StreamState,
  provider: MarketDataProvider,
  onTick: (ticker: string, quote: IpcStockQuote) => void,
  onError: (err: StreamError) => void
): Promise<void> {
  state.activeSub?.unsubscribe()
  state.activeSub = null
  await provider.disconnect()
  state.connected = false

  const tickers = state.tickers
  if (tickers.length === 0) return

  await subscribeToStockQuotes(state, provider, tickers, onTick, onError)
  logger.info({ tickers }, 'stock_quote_stream_restarted')
}
