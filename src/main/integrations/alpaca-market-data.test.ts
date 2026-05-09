import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MarketDataError,
  type DataFeed,
  type OptionSnapshot,
  type StockQuote,
  type StreamError,
  type StreamEvent
} from './market-data-provider'

const mockGetActivity = vi.fn()
const mockGetAccount = vi.fn()
const mockGetClock = vi.fn()

// fetch mock for data API calls (getStockQuotes, getOptionSnapshots bypass the SDK)
const mockFetch = vi.fn()

function fetchOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  } as unknown as Response
}

function fetchErr(status: number, body = ''): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body)
  } as unknown as Response
}

// --- WebSocket & MessagePack mock infrastructure (hoisted for vi.mock access) ---
const { mockSockets, mockDecode, MockWebSocket } = vi.hoisted(() => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mockSockets: Array<{
    url: string
    readyState: number
    _handlers: Record<string, Array<(...args: any[]) => void>>
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
  }> = []
  const mockDecode = vi.fn()
  const MockWebSocket = vi.fn().mockImplementation(function (url: string) {
    const socket: (typeof mockSockets)[number] = {
      url,
      readyState: 1,
      _handlers: {},
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        if (!socket._handlers[event]) socket._handlers[event] = []
        socket._handlers[event].push(handler)
        return socket
      }),
      send: vi.fn(),
      close: vi.fn()
    }
    mockSockets.push(socket)
    return socket
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { mockSockets, mockDecode, MockWebSocket }
})

vi.mock('@alpacahq/typescript-sdk', () => ({
  createClient: vi.fn(() => ({
    getActivity: mockGetActivity,
    getAccount: mockGetAccount,
    getClock: mockGetClock
  }))
}))

vi.mock('ws', () => ({
  __esModule: true,
  default: MockWebSocket,
  WebSocket: MockWebSocket
}))

vi.mock('@msgpack/msgpack', () => ({
  decode: mockDecode,
  encode: vi.fn()
}))

import { AlpacaMarketDataProvider } from './alpaca-market-data'
import { emitSocketEvent, simulateAuth } from './alpaca-stream-test-utils'

function createProvider(overrides: Record<string, unknown> = {}): AlpacaMarketDataProvider {
  return new AlpacaMarketDataProvider({
    keyId: 'test-key',
    secretKey: 'test-secret',
    paper: true,
    ...overrides
  })
}

describe('AlpacaMarketDataProvider — REST Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // === Stock Quotes ===

  function stockSnapshotResponse(
    tickers: Record<string, { bp: number; ap: number; t: string; prevClose: number }>
  ): Response {
    const body: Record<string, unknown> = {}
    for (const [symbol, q] of Object.entries(tickers)) {
      body[symbol] = {
        latestQuote: { bp: q.bp, ap: q.ap, t: q.t },
        prevDailyBar: { c: q.prevClose }
      }
    }
    // /v2/stocks/snapshots returns tickers as top-level keys (no "snapshots" wrapper)
    return fetchOk(body)
  }

  describe('getStockQuotes', () => {
    it('returns map of ticker to StockQuote for valid tickers', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          AAPL: { bp: 172.6, ap: 172.7, t: '2026-04-25T20:00:00Z', prevClose: 170.0 },
          MSFT: { bp: 420.5, ap: 420.6, t: '2026-04-25T20:00:00Z', prevClose: 415.0 }
        })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL', 'MSFT'])

      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(2)

      const aapl = result.get('AAPL')!
      expect(aapl.bid).toBe('172.60')
      expect(aapl.ask).toBe('172.70')
      expect(aapl.price).toMatch(/^\d+\.\d{2}$/)
      expect(typeof aapl.prevClose).toBe('string')
      expect(typeof aapl.volume).toBe('number')
      expect(typeof aapl.timestamp).toBe('string')
    })

    it('omits unknown tickers from result', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          AAPL: { bp: 172.6, ap: 172.7, t: '2026-04-25T20:00:00Z', prevClose: 170.0 }
        })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL', 'ZZZZZ'])

      expect(result.has('AAPL')).toBe(true)
      expect(result.has('ZZZZZ')).toBe(false)
    })

    it('returns price as string with 2 decimal places', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          AAPL: { bp: 172.5, ap: 172.5, t: '2026-04-25T20:00:00Z', prevClose: 170.0 }
        })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      expect(result.get('AAPL')!.price).toBe('172.50')
    })

    it('returns prevClose from prev_daily_bar.c', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          AAPL: { bp: 182.44, ap: 182.46, t: '2026-04-27T14:00:00Z', prevClose: 181.0 }
        })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      expect(result.get('AAPL')!.prevClose).toBe('181.00')
    })

    it('computes change as (mid − prevClose)', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          AAPL: { bp: 182.44, ap: 182.46, t: '2026-04-27T14:00:00Z', prevClose: 181.0 }
        })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      // mid = (182.44 + 182.46) / 2 = 182.45, prevClose = 181.00, change = 1.45
      expect(result.get('AAPL')!.change).toBe('1.45')
    })

    it('computes changePercent as (change / prevClose)', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          AAPL: { bp: 182.44, ap: 182.46, t: '2026-04-27T14:00:00Z', prevClose: 181.0 }
        })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      // change / prevClose = 1.45 / 181.00 ≈ 0.0080 (4dp)
      expect(result.get('AAPL')!.changePercent).toBe('0.0080')
    })

    it('returns negative change when price is below prevClose', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          TSLA: { bp: 418.28, ap: 418.32, t: '2026-04-27T14:00:00Z', prevClose: 420.0 }
        })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['TSLA'])

      // mid = (418.28 + 418.32) / 2 = 418.30, prevClose = 420.00, change = -1.70
      // changePercent = -1.70 / 420.00 ≈ -0.0040 (4dp)
      expect(result.get('TSLA')!.change).toBe('-1.70')
      expect(result.get('TSLA')!.changePercent).toBe('-0.0040')
    })

    it('calls /v2/stocks/snapshots with iex feed by default', async () => {
      mockFetch.mockResolvedValue(
        stockSnapshotResponse({
          AAPL: { bp: 182.44, ap: 182.46, t: '2026-04-27T14:00:00Z', prevClose: 181.0 }
        })
      )

      const provider = createProvider()
      await provider.getStockQuotes(['AAPL'])

      const calledUrl = mockFetch.mock.calls[0][0] as string
      expect(calledUrl).toContain('data.alpaca.markets')
      expect(calledUrl).toContain('/v2/stocks/snapshots')
      expect(calledUrl).toContain('feed=iex')
    })

    it('throws MarketDataError(auth_failed) on 401', async () => {
      mockFetch.mockResolvedValue(fetchErr(401, 'Unauthorized'))

      const provider = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('auth_failed')
    })

    it('throws MarketDataError(network_error) on ECONNREFUSED', async () => {
      mockFetch.mockRejectedValue(
        Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      )

      const provider = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('network_error')
    })
  })

  // === Option Snapshots ===

  describe('getOptionSnapshots', () => {
    const contractId = 'AAPL260516P00180000'

    function optionSnapshotResponse(
      snaps: Record<string, { bp: number; ap: number; p: number; delta?: number; iv?: number }>
    ): Response {
      const snapshots: Record<string, unknown> = {}
      for (const [sym, s] of Object.entries(snaps)) {
        snapshots[sym] = {
          latest_trade: { t: '2026-04-25T19:30:00Z', p: s.p, s: 10, x: 'A', c: '' },
          latest_quote: {
            t: '2026-04-25T19:30:00Z',
            bp: s.bp,
            ap: s.ap,
            bs: 50,
            as: 30,
            bx: 'A',
            ax: 'A',
            c: ''
          },
          greeks: { delta: s.delta ?? -0.45, gamma: 0.02, theta: -0.05, vega: 0.23, rho: 0.01 },
          impliedVolatility: s.iv ?? 0.35
        }
      }
      return fetchOk({ snapshots })
    }

    it('returns map of contractId to OptionSnapshot', async () => {
      mockFetch.mockResolvedValue(
        optionSnapshotResponse({
          [contractId]: { bp: 4.15, ap: 4.35, p: 4.2, delta: -0.4532, iv: 0.3456 }
        })
      )

      const provider = createProvider()
      const result = await provider.getOptionSnapshots([contractId])

      expect(result).toBeInstanceOf(Map)
      const snap = result.get(contractId)!
      expect(snap.bid).toMatch(/^\d+\.\d{2}$/)
      expect(snap.ask).toMatch(/^\d+\.\d{2}$/)
      expect(snap.mid).toMatch(/^\d+\.\d{2}$/)
      expect(snap.lastTrade).toMatch(/^\d+\.\d{2}$/)
      expect(snap.greeks.delta).toMatch(/^-?\d+\.\d{4}$/)
      expect(snap.greeks.iv).toMatch(/^-?\d+\.\d{4}$/)
      expect(typeof snap.timestamp).toBe('string')
    })

    it('computes mid as (bid + ask) / 2', async () => {
      mockFetch.mockResolvedValue(
        optionSnapshotResponse({ [contractId]: { bp: 4.15, ap: 4.35, p: 4.25 } })
      )

      const provider = createProvider()
      const result = await provider.getOptionSnapshots([contractId])

      expect(result.get(contractId)!.mid).toBe('4.25')
    })

    it('sets openInterest and volume to null', async () => {
      mockFetch.mockResolvedValue(
        optionSnapshotResponse({ [contractId]: { bp: 4.15, ap: 4.35, p: 4.2 } })
      )

      const provider = createProvider()
      const result = await provider.getOptionSnapshots([contractId])
      const snap = result.get(contractId)!

      expect(snap.openInterest).toBeNull()
      expect(snap.volume).toBeNull()
    })
  })

  // === Activities ===

  describe('getActivities', () => {
    it('returns array sorted by transactionTime desc', async () => {
      mockGetActivity.mockResolvedValue([
        {
          activity_type: 'OPASN',
          id: 'a1',
          date: '2026-04-18',
          net_amount: '-18000.00',
          symbol: 'AAPL',
          qty: '100',
          per_share_amount: '180.00'
        },
        {
          activity_type: 'OPASN',
          id: 'a3',
          date: '2026-04-22',
          net_amount: '-19000.00',
          symbol: 'MSFT',
          qty: '100',
          per_share_amount: '190.00'
        },
        {
          activity_type: 'OPASN',
          id: 'a2',
          date: '2026-04-20',
          net_amount: '-17000.00',
          symbol: 'TSLA',
          qty: '100',
          per_share_amount: '170.00'
        }
      ])

      const provider = createProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result[0].transactionTime).toBe('2026-04-22')
      expect(result[1].transactionTime).toBe('2026-04-20')
      expect(result[2].transactionTime).toBe('2026-04-18')
    })

    it('maps Alpaca fields to BrokerActivity shape', async () => {
      mockGetActivity.mockResolvedValue([
        {
          activity_type: 'OPASN',
          id: 'act-001',
          date: '2026-04-20',
          net_amount: '-18000.00',
          symbol: 'AAPL260516P00180000',
          qty: '100',
          per_share_amount: '180.00'
        }
      ])

      const provider = createProvider()
      const result = await provider.getActivities({ type: 'OPASN' })

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        activityId: 'act-001',
        activityType: 'OPASN',
        symbol: 'AAPL260516P00180000',
        qty: 100,
        price: '180.00',
        transactionTime: '2026-04-20'
      })
    })
  })

  // === Account Info ===

  describe('getAccountInfo', () => {
    it('returns buying power, portfolio value, cash, environment', async () => {
      mockGetAccount.mockResolvedValue({
        buying_power: '50000.00',
        portfolio_value: '125000.00',
        cash: '50000.00',
        status: 'ACTIVE',
        currency: 'USD'
      })

      const provider = createProvider({ paper: true })
      const result = await provider.getAccountInfo()

      expect(result.buyingPower).toBe('50000.00')
      expect(result.portfolioValue).toBe('125000.00')
      expect(result.cash).toBe('50000.00')
      expect(result.environment).toBe('paper')
    })

    it('returns environment "live" when paper is false', async () => {
      mockGetAccount.mockResolvedValue({
        buying_power: '50000.00',
        portfolio_value: '125000.00',
        cash: '50000.00'
      })

      const provider = createProvider({ paper: false })
      const result = await provider.getAccountInfo()

      expect(result.environment).toBe('live')
    })
  })

  // === Market Status ===

  describe('getMarketStatus', () => {
    it('returns isOpen, nextOpen, nextClose, session for regular hours', async () => {
      mockGetClock.mockResolvedValue({
        timestamp: '2026-04-27T14:00:00-04:00',
        is_open: true,
        next_open: '2026-04-28T09:30:00-04:00',
        next_close: '2026-04-27T16:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.isOpen).toBe(true)
      expect(result.session).toBe('regular')
      expect(typeof result.nextOpen).toBe('string')
      expect(typeof result.nextClose).toBe('string')
    })

    it('returns session "closed" when market is closed', async () => {
      mockGetClock.mockResolvedValue({
        timestamp: '2026-04-27T02:00:00-04:00',
        is_open: false,
        next_open: '2026-04-27T09:30:00-04:00',
        next_close: '2026-04-27T16:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.session).toBe('closed')
    })

    it('returns session "pre" during pre-market hours', async () => {
      mockGetClock.mockResolvedValue({
        timestamp: '2026-04-27T08:00:00-04:00',
        is_open: false,
        next_open: '2026-04-27T09:30:00-04:00',
        next_close: '2026-04-27T16:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.session).toBe('pre')
    })

    it('returns session "post" during post-market hours', async () => {
      mockGetClock.mockResolvedValue({
        timestamp: '2026-04-27T17:00:00-04:00',
        is_open: false,
        next_open: '2026-04-28T09:30:00-04:00',
        next_close: '2026-04-28T16:00:00-04:00'
      })

      const provider = createProvider()
      const result = await provider.getMarketStatus()

      expect(result.session).toBe('post')
    })
  })

  // === Error Handling ===

  describe('error handling', () => {
    it('throws MarketDataError with code auth_failed on 401/403', async () => {
      const error = Object.assign(new Error('Unauthorized'), { status: 401 })
      mockGetAccount.mockRejectedValue(error)

      const provider = createProvider()
      const thrown = await provider.getAccountInfo().catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('auth_failed')
    })

    it('throws MarketDataError with code network_error on connection failure', async () => {
      mockFetch.mockRejectedValue(
        Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      )

      const provider = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('network_error')
      expect((thrown as MarketDataError).message).toMatch(/stock|quote/i)
    })

    it('handles unknown ticker gracefully (no error)', async () => {
      mockFetch.mockResolvedValue(
        fetchOk({
          AAPL: {
            latestQuote: { bp: 172.6, ap: 172.7, t: '2026-04-25T20:00:00Z' },
            prevDailyBar: { c: 170.0 }
          }
        })
      )

      const provider = createProvider()
      await expect(provider.getStockQuotes(['AAPL', 'ZZZZZ'])).resolves.toBeDefined()

      const result = await provider.getStockQuotes(['AAPL', 'ZZZZZ'])
      expect(result.has('AAPL')).toBe(true)
      expect(result.has('ZZZZZ')).toBe(false)
    })
  })
})

// === WebSocket Streaming Helpers ===

/**
 * Helper to create a connected provider for streaming tests.
 * When the implementation exists, this will create WebSocket connections and authenticate.
 * With stubs, connect() is a no-op and mockSockets stays empty.
 */
async function connectAndAuth(overrides: Record<string, unknown> = {}): Promise<{
  provider: AlpacaMarketDataProvider
  stockSocket: (typeof mockSockets)[number] | undefined
  optionSocket: (typeof mockSockets)[number] | undefined
}> {
  const provider = createProvider(overrides)
  const connectPromise = provider.connect()

  // When implementation exists, sockets are created synchronously before first await.
  // Simulate the auth flow to allow connect() to resolve.
  if (mockSockets.length >= 2) {
    simulateAuth(mockSockets[mockSockets.length - 2])
    simulateAuth(mockSockets[mockSockets.length - 1])
  }

  await connectPromise

  return {
    provider,
    stockSocket: mockSockets[mockSockets.length - 2],
    optionSocket: mockSockets[mockSockets.length - 1]
  }
}

// === Streaming Tests ===

describe('AlpacaMarketDataProvider — WebSocket Streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSockets.length = 0
  })

  // --- supportsStreaming ---

  describe('supportsStreaming', () => {
    it('returns true for stockQuotes', () => {
      const provider = createProvider()
      expect(provider.supportsStreaming('stockQuotes')).toBe(true)
    })

    it('returns true for optionQuotes', () => {
      const provider = createProvider()
      expect(provider.supportsStreaming('optionQuotes')).toBe(true)
    })

    it('returns true for optionTrades', () => {
      const provider = createProvider()
      expect(provider.supportsStreaming('optionTrades')).toBe(true)
    })
  })

  // --- connect ---

  describe('connect', () => {
    it('opens stock and option WebSocket connections', async () => {
      const provider = createProvider({ dataFeed: 'sip', optionFeed: 'opra' })
      const connectPromise = provider.connect()

      // connect() should create two sockets synchronously before first internal await
      if (mockSockets.length >= 2) {
        simulateAuth(mockSockets[0])
        simulateAuth(mockSockets[1])
      }
      await connectPromise

      expect(mockSockets).toHaveLength(2)
      expect(mockSockets[0].url).toContain('v2/sip')
      expect(mockSockets[1].url).toContain('v1beta1/opra')
    })

    it('authenticates both connections', async () => {
      const provider = createProvider()
      const connectPromise = provider.connect()

      // Must have 2 sockets to test auth flow
      expect(mockSockets.length).toBeGreaterThanOrEqual(2)

      const stockSocket = mockSockets[0]
      const optionSocket = mockSockets[1]

      // Simulate server connected message on both
      emitSocketEvent(stockSocket, 'open')
      emitSocketEvent(stockSocket, 'message', JSON.stringify([{ T: 'success', msg: 'connected' }]))
      emitSocketEvent(optionSocket, 'open')
      emitSocketEvent(optionSocket, 'message', JSON.stringify([{ T: 'success', msg: 'connected' }]))

      // Provider should have sent auth with key/secret on both sockets
      expect(stockSocket.send).toHaveBeenCalledWith(expect.stringContaining('"action":"auth"'))

      const authMsg = JSON.parse(stockSocket.send.mock.calls[0][0] as string)
      expect(authMsg.key).toBe('test-key')
      expect(authMsg.secret).toBe('test-secret')

      // Complete auth on both
      emitSocketEvent(
        stockSocket,
        'message',
        JSON.stringify([{ T: 'success', msg: 'authenticated' }])
      )
      emitSocketEvent(
        optionSocket,
        'message',
        JSON.stringify([{ T: 'success', msg: 'authenticated' }])
      )

      await connectPromise
    })

    it('opens only the stock socket when feeds=["stockQuotes"]', async () => {
      const provider = createProvider({ dataFeed: 'sip', optionFeed: 'opra' })
      const connectPromise = provider.connect(['stockQuotes'])

      expect(mockSockets).toHaveLength(1)
      expect(mockSockets[0].url).toContain('v2/sip')
      simulateAuth(mockSockets[0])
      await connectPromise
    })

    it('opens only the option socket when feeds=["optionQuotes"]', async () => {
      const provider = createProvider({ dataFeed: 'sip', optionFeed: 'opra' })
      const connectPromise = provider.connect(['optionQuotes'])

      expect(mockSockets).toHaveLength(1)
      expect(mockSockets[0].url).toContain('v1beta1/opra')
      simulateAuth(mockSockets[0])
      await connectPromise
    })

    it('resolves after both connections authenticate', async () => {
      const provider = createProvider()
      const connectPromise = provider.connect()

      expect(mockSockets.length).toBeGreaterThanOrEqual(2)

      // Authenticate only the first socket
      simulateAuth(mockSockets[0])

      // Promise should NOT have resolved yet (second socket not authed)
      let resolved = false
      void connectPromise.then(() => {
        resolved = true
      })
      await new Promise((r) => setTimeout(r, 10))
      expect(resolved).toBe(false)

      // Now authenticate the second socket
      simulateAuth(mockSockets[1])

      await connectPromise
    })
  })

  // --- stream ---

  describe('stream', () => {
    it('sends subscribe message on stock WebSocket for stockQuotes', async () => {
      const { provider, stockSocket } = await connectAndAuth()
      expect(stockSocket).toBeDefined()
      stockSocket!.send.mockClear()

      provider.stream('stockQuotes', ['AAPL', 'MSFT']).subscribe({ next: () => {} })

      const subscribeMsg = JSON.parse(stockSocket!.send.mock.calls[0][0] as string)
      expect(subscribeMsg).toEqual({ action: 'subscribe', quotes: ['AAPL', 'MSFT'] })
    })

    it('emits StockQuote events as they arrive', async () => {
      const { provider, stockSocket } = await connectAndAuth()
      expect(stockSocket).toBeDefined()

      const events: StreamEvent<StockQuote | OptionSnapshot>[] = []
      provider.stream('stockQuotes', ['AAPL']).subscribe({ next: (e) => events.push(e) })

      // Simulate a stock quote message arriving on the stock WebSocket
      emitSocketEvent(
        stockSocket!,
        'message',
        JSON.stringify([
          {
            T: 'q',
            S: 'AAPL',
            bp: 172.6,
            ap: 172.7,
            bs: 3,
            as: 1,
            bx: 'V',
            ax: 'V',
            t: '2026-04-25T20:00:00Z'
          }
        ])
      )

      expect(events).toHaveLength(1)
      expect(events[0].feed).toBe('stockQuotes')
      expect(events[0].symbol).toBe('AAPL')
      expect(events[0].data).toMatchObject({ bid: '172.60', ask: '172.70' })
      expect(typeof events[0].timestamp).toBe('string')
    })

    it('sends subscribe on option WebSocket for optionQuotes', async () => {
      const { provider, optionSocket } = await connectAndAuth()
      expect(optionSocket).toBeDefined()
      optionSocket!.send.mockClear()

      provider.stream('optionQuotes', ['AAPL260516P00180000']).subscribe({ next: () => {} })

      // Option socket should have received a subscribe message (MessagePack-encoded)
      expect(optionSocket!.send).toHaveBeenCalled()
    })

    it('decodes MessagePack option quote messages', async () => {
      const { provider, optionSocket } = await connectAndAuth()
      expect(optionSocket).toBeDefined()

      const events: StreamEvent<StockQuote | OptionSnapshot>[] = []
      provider
        .stream('optionQuotes', ['AAPL260516P00180000'])
        .subscribe({ next: (e) => events.push(e) })

      // Configure mock decode to return a parsed option quote
      mockDecode.mockReturnValue([
        {
          T: 'q',
          S: 'AAPL260516P00180000',
          bp: 4.15,
          ap: 4.35,
          t: '2026-04-25T19:30:00Z'
        }
      ])

      // Simulate binary message on option socket
      emitSocketEvent(optionSocket!, 'message', Buffer.from([0x92, 0xa1]))

      expect(mockDecode).toHaveBeenCalled()
      expect(events).toHaveLength(1)
      expect(events[0].feed).toBe('optionQuotes')
      expect(events[0].symbol).toBe('AAPL260516P00180000')
    })
  })

  // --- unsubscribe ---

  describe('unsubscribe', () => {
    it('stops receiving events after unsubscribe', async () => {
      const { provider, stockSocket } = await connectAndAuth()
      expect(stockSocket).toBeDefined()

      const events: StreamEvent<StockQuote | OptionSnapshot>[] = []
      const sub = provider
        .stream('stockQuotes', ['AAPL'])
        .subscribe({ next: (e) => events.push(e) })

      // Emit one event — should be received
      emitSocketEvent(
        stockSocket!,
        'message',
        JSON.stringify([
          {
            T: 'q',
            S: 'AAPL',
            bp: 172.6,
            ap: 172.7,
            bs: 3,
            as: 1,
            bx: 'V',
            ax: 'V',
            t: '2026-04-25T20:00:00Z'
          }
        ])
      )
      expect(events).toHaveLength(1)

      sub.unsubscribe()

      // Emit another event — should NOT be received
      emitSocketEvent(
        stockSocket!,
        'message',
        JSON.stringify([
          {
            T: 'q',
            S: 'AAPL',
            bp: 173.0,
            ap: 173.1,
            bs: 3,
            as: 1,
            bx: 'V',
            ax: 'V',
            t: '2026-04-25T20:01:00Z'
          }
        ])
      )
      expect(events).toHaveLength(1)
    })

    it('sends unsubscribe message on WebSocket', async () => {
      const { provider, stockSocket } = await connectAndAuth()
      expect(stockSocket).toBeDefined()

      const sub = provider.stream('stockQuotes', ['AAPL', 'MSFT']).subscribe({ next: () => {} })

      stockSocket!.send.mockClear()
      sub.unsubscribe()

      // Teardown should have sent an unsubscribe message
      const unsubMsg = JSON.parse(stockSocket!.send.mock.calls[0][0] as string)
      expect(unsubMsg).toEqual({ action: 'unsubscribe', quotes: ['AAPL', 'MSFT'] })
    })

    it('keeps WebSocket open for other subscriptions', async () => {
      const { provider, stockSocket } = await connectAndAuth()
      expect(stockSocket).toBeDefined()

      const msftEvents: StreamEvent<StockQuote | OptionSnapshot>[] = []

      const sub1 = provider.stream('stockQuotes', ['AAPL']).subscribe({ next: () => {} })
      provider.stream('stockQuotes', ['MSFT']).subscribe({ next: (e) => msftEvents.push(e) })

      // Unsubscribe AAPL only
      sub1.unsubscribe()

      // Socket should still be open (close not called)
      expect(stockSocket!.close).not.toHaveBeenCalled()

      // MSFT should still receive events
      emitSocketEvent(
        stockSocket!,
        'message',
        JSON.stringify([
          {
            T: 'q',
            S: 'MSFT',
            bp: 420.5,
            ap: 420.6,
            bs: 2,
            as: 1,
            bx: 'Q',
            ax: 'Q',
            t: '2026-04-25T20:02:00Z'
          }
        ])
      )
      expect(msftEvents).toHaveLength(1)
    })
  })

  // --- disconnect ---

  describe('disconnect', () => {
    it('closes all WebSocket connections', async () => {
      const { provider, stockSocket, optionSocket } = await connectAndAuth()
      expect(stockSocket).toBeDefined()
      expect(optionSocket).toBeDefined()

      await provider.disconnect()

      expect(stockSocket!.close).toHaveBeenCalled()
      expect(optionSocket!.close).toHaveBeenCalled()
    })

    it('completes all active Observable streams', async () => {
      const { provider } = await connectAndAuth()

      let completed = false
      provider.stream('stockQuotes', ['AAPL']).subscribe({
        next: () => {},
        complete: () => {
          completed = true
        }
      })

      await provider.disconnect()

      expect(completed).toBe(true)
    })
  })

  // --- error handling ---

  describe('error handling', () => {
    it('stream errors with StreamError when stock WebSocket disconnects', async () => {
      const { provider, stockSocket } = await connectAndAuth()
      expect(stockSocket).toBeDefined()

      let receivedError: StreamError | null = null
      provider.stream('stockQuotes', ['AAPL']).subscribe({
        next: () => {},
        error: (err: unknown) => {
          receivedError = err as StreamError
        }
      })

      // Simulate unexpected WebSocket close
      emitSocketEvent(stockSocket!, 'close', 1006)

      expect(receivedError).not.toBeNull()
      expect(receivedError!.code).toBe('stream_disconnected')
      expect(receivedError!.feed).toBe('stockQuotes')
      expect(receivedError!.reconnectable).toBe(true)
    })

    it('stream errors with StreamError when option WebSocket disconnects', async () => {
      const { provider, optionSocket } = await connectAndAuth()
      expect(optionSocket).toBeDefined()

      let receivedError: StreamError | null = null
      provider.stream('optionQuotes', ['AAPL260516P00180000']).subscribe({
        next: () => {},
        error: (err: unknown) => {
          receivedError = err as StreamError
        }
      })

      // Simulate unexpected WebSocket close on option socket
      emitSocketEvent(optionSocket!, 'close', 1006)

      expect(receivedError).not.toBeNull()
      expect(receivedError!.code).toBe('stream_disconnected')
      expect(receivedError!.feed).toBe('optionQuotes')
      expect(receivedError!.reconnectable).toBe(true)
    })

    it('stream throws MarketDataError for unsupported feed', async () => {
      const { provider } = await connectAndAuth()

      // Valid feeds should NOT throw (returns Observable)
      const observable = provider.stream('stockQuotes', ['AAPL'])
      expect(observable).toBeDefined()
      expect(observable.subscribe).toBeInstanceOf(Function)

      // Invalid/unsupported feed SHOULD throw
      expect(() => provider.stream('invalidFeed' as DataFeed, ['AAPL'])).toThrow(MarketDataError)

      try {
        provider.stream('invalidFeed' as DataFeed, ['AAPL'])
      } catch (err) {
        expect((err as MarketDataError).code).toBe('streaming_unsupported')
      }
    })
  })
})
