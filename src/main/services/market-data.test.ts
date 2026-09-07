import { Subject } from 'rxjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MarketDataError,
  type MarketDataProvider,
  type OptionSnapshot,
  type StockQuote,
  type StreamError,
  type StreamEvent
} from '../integrations/market-data-provider'
import { logger } from '../logger'
import {
  newStreamState,
  restartStockQuoteStream,
  subscribeToStockQuotes,
  type IpcStockQuote,
  type StreamState
} from './market-data'

const TICK: StockQuote = {
  price: '319.80',
  bid: '319.80',
  ask: '319.80',
  change: '',
  changePercent: '',
  prevClose: '',
  volume: 40,
  timestamp: '2026-09-04T20:34:00.000Z'
}

type StubProvider = MarketDataProvider & {
  ticks: Subject<StreamEvent<StockQuote | OptionSnapshot>>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  stream: ReturnType<typeof vi.fn>
}

function createProvider(): StubProvider {
  const ticks = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()
  return {
    ticks,
    getStockQuotes: vi.fn(),
    getOptionSnapshot: vi.fn(),
    getOptionChainSnapshot: vi.fn(),
    supportsStreaming: vi.fn(() => true),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    stream: vi.fn(() => ticks)
  } as unknown as StubProvider
}

describe('subscribeToStockQuotes', () => {
  let state: StreamState
  let onTick: ReturnType<typeof vi.fn<(ticker: string, quote: IpcStockQuote) => void>>
  let onError: ReturnType<typeof vi.fn<(err: StreamError) => void>>

  beforeEach(() => {
    vi.restoreAllMocks()
    state = newStreamState()
    onTick = vi.fn<(ticker: string, quote: IpcStockQuote) => void>()
    onError = vi.fn<(err: StreamError) => void>()
  })

  it('starts with no remembered tickers', () => {
    expect(state.tickers).toEqual([])
  })

  it('remembers the subscribed ticker set on the stream state', async () => {
    const provider = createProvider()

    await subscribeToStockQuotes(state, provider, ['AAPL', 'NVDA'], onTick, onError)

    expect(state.tickers).toEqual(['AAPL', 'NVDA'])
  })

  // Dropping the renderer's rxjs subscription does not release Alpaca's: the socket keeps
  // its per-symbol bars subscriptions against the free plan's 30-symbol cap until told to
  // let go, so navigating between views would leak symbols until a 405 killed the stream.
  it('releases the provider subscriptions when the ticker set becomes empty', async () => {
    const provider = createProvider()
    await subscribeToStockQuotes(state, provider, ['AAPL'], onTick, onError)
    provider.stream.mockClear()

    await subscribeToStockQuotes(state, provider, [], onTick, onError)

    expect(provider.stream).toHaveBeenCalledWith('stockQuotes', [])
  })

  // Without this the socket is dead but `connected` stays true, so the next
  // set-stock-quote-tickers skips connect() and subscribes to a stream nothing feeds.
  it('clears connected when the stream errors, so the next call reconnects', async () => {
    const provider = createProvider()
    await subscribeToStockQuotes(state, provider, ['AAPL'], onTick, onError)
    expect(state.connected).toBe(true)

    provider.ticks.error({
      feed: 'stockQuotes',
      code: 'connection_lost',
      message: 'socket closed',
      reconnectable: true
    })

    expect(state.connected).toBe(false)
    expect(onError).toHaveBeenCalled()

    provider.connect.mockClear()
    await subscribeToStockQuotes(state, provider, ['AAPL'], onTick, onError)
    expect(provider.connect).toHaveBeenCalledTimes(1)
  })

  it('remembers an empty ticker set', async () => {
    const provider = createProvider()
    await subscribeToStockQuotes(state, provider, ['AAPL'], onTick, onError)

    await subscribeToStockQuotes(state, provider, [], onTick, onError)

    expect(state.tickers).toEqual([])
  })
})

describe('restartStockQuoteStream', () => {
  let state: StreamState
  let onTick: ReturnType<typeof vi.fn<(ticker: string, quote: IpcStockQuote) => void>>
  let onError: ReturnType<typeof vi.fn<(err: StreamError) => void>>

  beforeEach(() => {
    vi.restoreAllMocks()
    state = newStreamState()
    onTick = vi.fn<(ticker: string, quote: IpcStockQuote) => void>()
    onError = vi.fn<(err: StreamError) => void>()
  })

  it('tears the socket down and resubscribes the remembered tickers', async () => {
    const provider = createProvider()
    await subscribeToStockQuotes(state, provider, ['AAPL'], onTick, onError)
    provider.connect.mockClear()
    provider.stream.mockClear()

    await restartStockQuoteStream(state, provider, onTick, onError)

    expect(provider.disconnect).toHaveBeenCalledTimes(1)
    expect(provider.connect).toHaveBeenCalledTimes(1)
    expect(provider.stream).toHaveBeenCalledWith('stockQuotes', ['AAPL'])
  })

  it('forwards a tick from the restarted stream', async () => {
    const provider = createProvider()
    await subscribeToStockQuotes(state, provider, ['AAPL'], onTick, onError)
    await restartStockQuoteStream(state, provider, onTick, onError)

    provider.ticks.next({
      feed: 'stockQuotes',
      symbol: 'AAPL',
      data: TICK,
      timestamp: TICK.timestamp
    })

    expect(onTick).toHaveBeenCalledWith(
      'AAPL',
      expect.objectContaining<Partial<IpcStockQuote>>({ price: '319.80', prevClose: null })
    )
  })

  it('tears down without reconnecting when no tickers are remembered', async () => {
    const provider = createProvider()

    await restartStockQuoteStream(state, provider, onTick, onError)

    expect(provider.disconnect).toHaveBeenCalledTimes(1)
    expect(provider.connect).not.toHaveBeenCalled()
    expect(state.connected).toBe(false)
  })

  // New credentials may not carry a streaming entitlement; REST quotes must keep working.
  it('degrades to REST-only when the reconnect fails', async () => {
    const warnSpy = vi.spyOn(logger, 'warn')
    const provider = createProvider()
    await subscribeToStockQuotes(state, provider, ['AAPL'], onTick, onError)
    provider.connect.mockRejectedValue(
      new MarketDataError('streaming_unsupported', 'insufficient subscription')
    )

    await expect(restartStockQuoteStream(state, provider, onTick, onError)).resolves.toBeUndefined()

    expect(state.connected).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
  })
})
