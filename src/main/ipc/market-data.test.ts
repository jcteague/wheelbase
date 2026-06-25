import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Subject } from 'rxjs'
import {
  MarketDataError,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent
} from '../integrations/market-data-provider'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

const provider = {
  getStockQuotes: vi.fn(),
  getOptionSnapshot: vi.fn(),
  getOptionChainSnapshot: vi.fn(),
  supportsStreaming: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  stream: vi.fn()
}

const mockWebContents = { send: vi.fn() }
const getWindow = vi.fn(
  () => ({ webContents: mockWebContents }) as unknown as Electron.BrowserWindow
)

const AAPL_QUOTE: StockQuote = {
  price: '182.45',
  bid: '182.44',
  ask: '182.46',
  change: '1.45',
  changePercent: '0.0080',
  prevClose: '181.00',
  volume: 1000,
  timestamp: '2026-01-01T10:00:00Z'
}

const MSFT_QUOTE: StockQuote = {
  price: '418.30',
  bid: '418.25',
  ask: '418.35',
  change: '-1.70',
  changePercent: '-0.0040',
  prevClose: '420.00',
  volume: 500,
  timestamp: '2026-01-01T10:00:00Z'
}

function getHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): (...args: unknown[]) => unknown {
  const entry = calls.find(([c]) => c === channel)
  if (!entry) throw new Error(`Handler not registered for channel: ${channel}`)
  return entry[1]
}

describe('registerMarketDataHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    provider.connect.mockResolvedValue(undefined)
    provider.stream.mockReturnValue(new Subject<StreamEvent<StockQuote | OptionSnapshot>>())
    getWindow.mockReturnValue({ webContents: mockWebContents } as unknown as Electron.BrowserWindow)
  })

  it('registers all three channels', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([c]) => c as string)
    expect(channels).toContain('market-data:stock-quotes')
    expect(channels).toContain('market-data:set-stock-quote-tickers')
    expect(channels).toContain('market-data:option-snapshots')
  })

  it('market-data:stock-quotes returns ok:true with quotes record on success', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getStockQuotes.mockResolvedValue(
      new Map([
        ['AAPL', AAPL_QUOTE],
        ['MSFT', MSFT_QUOTE]
      ])
    )

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:stock-quotes'
    )

    const result = await handler(null, { tickers: ['AAPL', 'MSFT'] })

    expect(result).toMatchObject({
      ok: true,
      quotes: {
        AAPL: expect.objectContaining({ prevClose: '181.00' }),
        MSFT: expect.objectContaining({ prevClose: '420.00' })
      }
    })
    expect((result as { quotes: Record<string, unknown> }).quotes['AAPL']).not.toHaveProperty(
      'change'
    )
    expect((result as { quotes: Record<string, unknown> }).quotes['AAPL']).not.toHaveProperty(
      'changePercent'
    )
  })

  it('market-data:stock-quotes returns ok:true with empty quotes when tickers is empty', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:stock-quotes'
    )

    const result = await handler(null, { tickers: [] })

    expect(result).toEqual({ ok: true, quotes: {} })
    expect(provider.getStockQuotes).not.toHaveBeenCalled()
  })

  it('market-data:stock-quotes returns ok:false with code auth_failed when provider throws MarketDataError(auth_failed)', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getStockQuotes.mockRejectedValue(
      new MarketDataError('auth_failed', 'authentication failed')
    )

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:stock-quotes'
    )

    const result = await handler(null, { tickers: ['AAPL'] })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__root__', code: 'auth_failed' })]
    })
  })

  it('market-data:stock-quotes returns ok:false with code network_error when provider throws MarketDataError(network_error)', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getStockQuotes.mockRejectedValue(
      new MarketDataError('network_error', 'connection refused')
    )

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:stock-quotes'
    )

    const result = await handler(null, { tickers: ['AAPL'] })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__root__', code: 'network_error' })]
    })
  })

  it('market-data:stock-quotes returns ok:false with code internal_error on unexpected throw', async () => {
    const { ipcMain } = await import('electron')
    const { logger } = await import('../logger')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getStockQuotes.mockRejectedValue(new Error('unexpected'))

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:stock-quotes'
    )

    const result = await handler(null, { tickers: ['AAPL'] })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'internal_error' })]
    })
    expect(vi.mocked(logger.error)).toHaveBeenCalled()
  })

  it('market-data:stock-quotes returns ok:false on Zod validation error', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:stock-quotes'
    )

    const result = await handler(null, { tickers: 'AAPL' })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'tickers' })]
    })
  })

  it('market-data:set-stock-quote-tickers calls provider.connect on first invocation', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:set-stock-quote-tickers'
    )

    await handler(null, { tickers: ['AAPL'] })

    expect(provider.connect).toHaveBeenCalledOnce()
  })

  it('market-data:set-stock-quote-tickers does not call provider.connect on second invocation', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:set-stock-quote-tickers'
    )

    await handler(null, { tickers: ['AAPL'] })
    await handler(null, { tickers: ['MSFT'] })

    expect(provider.connect).toHaveBeenCalledOnce()
  })

  it('market-data:set-stock-quote-tickers subscribes to provider.stream and forwards ticks via webContents.send', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    const subject = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()
    provider.stream.mockReturnValue(subject.asObservable())

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:set-stock-quote-tickers'
    )

    await handler(null, { tickers: ['AAPL'] })

    const tick: StreamEvent<StockQuote> = {
      feed: 'stockQuotes',
      symbol: 'AAPL',
      data: {
        price: '183.10',
        bid: '183.08',
        ask: '183.12',
        change: '0.00',
        changePercent: '0.0000',
        prevClose: '',
        volume: 0,
        timestamp: '2026-01-01T10:01:00Z'
      },
      timestamp: '2026-01-01T10:01:00Z'
    }
    subject.next(tick)

    expect(mockWebContents.send).toHaveBeenCalledWith('market-data:stock-quote', {
      ticker: 'AAPL',
      quote: expect.objectContaining({ price: '183.10', prevClose: null })
    })
    const sentQuote = (
      mockWebContents.send.mock.calls[0] as [
        string,
        { ticker: string; quote: Record<string, unknown> }
      ]
    )[1].quote
    expect(sentQuote).not.toHaveProperty('change')
    expect(sentQuote).not.toHaveProperty('changePercent')
  })

  it('market-data:set-stock-quote-tickers tears down previous subscription before subscribing again', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    const subject = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()
    provider.stream.mockReturnValue(subject.asObservable())

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:set-stock-quote-tickers'
    )

    await handler(null, { tickers: ['AAPL', 'MSFT'] })
    expect(subject.observers.length).toBe(1)

    await handler(null, { tickers: ['AAPL'] })
    // After second call, there should be exactly 1 observer (the new subscription, not both)
    expect(subject.observers.length).toBe(1)
    expect(provider.stream).toHaveBeenCalledTimes(2)
  })

  it('market-data:set-stock-quote-tickers with empty tickers tears down without subscribing', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:set-stock-quote-tickers'
    )

    const result = await handler(null, { tickers: [] })

    expect(result).toMatchObject({ ok: true, subscribedTickers: [] })
    expect(provider.stream).not.toHaveBeenCalled()
  })

  it('market-data:set-stock-quote-tickers forwards stream errors via webContents.send', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    const subject = new Subject<StreamEvent<StockQuote | OptionSnapshot>>()
    provider.stream.mockReturnValue(subject.asObservable())

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:set-stock-quote-tickers'
    )

    await handler(null, { tickers: ['AAPL'] })

    subject.error({
      feed: 'stockQuotes',
      code: 'stream_disconnected',
      message: 'stockQuotes stream disconnected',
      reconnectable: true
    })

    expect(mockWebContents.send).toHaveBeenCalledWith(
      'market-data:stream-error',
      expect.objectContaining({
        feed: 'stockQuotes',
        code: 'stream_disconnected',
        reconnectable: true
      })
    )
  })

  // --- market-data:option-snapshots ---

  const AAPL_OCC = 'AAPL260516P00180000'

  const AAPL_SNAPSHOT: OptionSnapshot = {
    bid: '1.20',
    ask: '1.40',
    mid: '1.30',
    lastTrade: '1.30',
    openInterest: 1000,
    volume: 250,
    greeks: {
      delta: '-0.30',
      gamma: '0.02',
      theta: '-0.05',
      vega: '0.10'
    },
    impliedVolatility: '0.25',
    timestamp: '2026-01-01T10:00:00Z'
  }

  it('registers market-data:option-snapshots channel', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([c]) => c as string)
    expect(channels).toContain('market-data:option-snapshots')
  })

  it('market-data:option-snapshots returns ok:true with snapshots record on success', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getOptionSnapshot.mockResolvedValue(AAPL_SNAPSHOT)

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-snapshots'
    )

    const result = await handler(null, { symbols: [AAPL_OCC] })

    expect(result).toMatchObject({
      ok: true,
      snapshots: {
        [AAPL_OCC]: expect.objectContaining({
          bid: '1.20',
          ask: '1.40',
          mid: '1.30',
          greeks: expect.objectContaining({ delta: '-0.30' })
        })
      }
    })
  })

  it('market-data:option-snapshots returns ok:true with empty snapshots when symbols is empty', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-snapshots'
    )

    const result = await handler(null, { symbols: [] })

    expect(result).toEqual({ ok: true, snapshots: {}, unavailable: false })
    expect(provider.getOptionSnapshot).not.toHaveBeenCalled()
  })

  it('market-data:option-snapshots returns ok:false with auth_failed when provider throws MarketDataError(auth_failed)', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getOptionSnapshot.mockRejectedValue(
      new MarketDataError('auth_failed', 'authentication failed')
    )

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-snapshots'
    )

    const result = await handler(null, { symbols: [AAPL_OCC] })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__root__', code: 'auth_failed' })]
    })
  })

  it('market-data:option-snapshots returns ok:false with network_error when provider throws MarketDataError(network_error)', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getOptionSnapshot.mockRejectedValue(
      new MarketDataError('network_error', 'connection refused')
    )

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-snapshots'
    )

    const result = await handler(null, { symbols: [AAPL_OCC] })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__root__', code: 'network_error' })]
    })
  })

  it('market-data:option-snapshots returns ok:false with internal_error on unexpected throw', async () => {
    const { ipcMain } = await import('electron')
    const { logger } = await import('../logger')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getOptionSnapshot.mockRejectedValue(new Error('unexpected'))

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-snapshots'
    )

    const result = await handler(null, { symbols: [AAPL_OCC] })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ code: 'internal_error' })]
    })
    expect(vi.mocked(logger.error)).toHaveBeenCalled()
  })

  it('market-data:option-snapshots returns ok:false on Zod validation error', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-snapshots'
    )

    const result = await handler(null, { symbols: AAPL_OCC })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'symbols' })]
    })
  })

  // --- market-data:option-snapshot (single contract) ---

  it('registers market-data:option-snapshot channel', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([c]) => c as string)
    expect(channels).toContain('market-data:option-snapshot')
  })

  it('market-data:option-snapshot returns { ok: true, snapshot } for a single OCC contract', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getOptionSnapshot.mockResolvedValue(AAPL_SNAPSHOT)

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-snapshot'
    )

    const result = await handler(null, { underlying: 'AAPL', contract: AAPL_OCC })

    expect(result).toMatchObject({ ok: true, snapshot: AAPL_SNAPSHOT })
    expect(provider.getOptionSnapshot).toHaveBeenCalledWith(AAPL_OCC)
  })

  // --- market-data:option-chain ---

  it('registers market-data:option-chain channel', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([c]) => c as string)
    expect(channels).toContain('market-data:option-chain')
  })

  it('market-data:option-chain returns { ok: true, snapshots, nextCursor }', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    provider.getOptionChainSnapshot.mockResolvedValue([AAPL_SNAPSHOT])

    registerMarketDataHandlers(() => provider, getWindow)
    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'market-data:option-chain'
    )

    const result = await handler(null, { underlying: 'AAPL' })

    expect(result).toMatchObject({ ok: true, snapshots: [AAPL_SNAPSHOT], nextCursor: null })
  })

  // --- guard: broker channels must NOT be registered here ---

  it('market-data namespace does not register :activities, :account, or :market-status handlers', async () => {
    const { ipcMain } = await import('electron')
    const { registerMarketDataHandlers } = await import('./market-data')

    registerMarketDataHandlers(() => provider, getWindow)

    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([c]) => c as string)
    expect(channels).not.toContain('market-data:activities')
    expect(channels).not.toContain('market-data:account')
    expect(channels).not.toContain('market-data:market-status')
  })
})
