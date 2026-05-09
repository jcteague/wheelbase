/**
 * E2E Integration Tests for AlpacaMarketDataProvider (via factory)
 * US-31 — Market Data Provider Adapter
 *
 * One test per AC — exercises the full flow from factory → typed response
 * with mocked external dependencies (Alpaca SDK + WebSocket).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MarketDataError,
  type DataFeed,
  type OptionSnapshot,
  type StockQuote,
  type StreamError,
  type StreamEvent
} from './market-data-provider'

// --- Mock infrastructure (hoisted for vi.mock access) ---
const mockGetActivity = vi.fn()
const mockGetAccount = vi.fn()
const mockGetClock = vi.fn()

const mockFetch = vi.fn()

function fetchOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  } as unknown as Response
}

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

import { createMarketDataProvider } from './market-data-factory'
import { emitSocketEvent, simulateAuth } from './alpaca-stream-test-utils'

async function connectAndAuth(overrides: Record<string, unknown> = {}): Promise<{
  provider: ReturnType<typeof createMarketDataProvider>
  stockSocket: (typeof mockSockets)[number] | undefined
  optionSocket: (typeof mockSockets)[number] | undefined
}> {
  const provider = createMarketDataProvider({
    provider: 'alpaca',
    keyId: 'test-key',
    secretKey: 'test-secret',
    paper: true,
    ...overrides
  })
  const connectPromise = provider.connect()

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

// --- Stock quote mock data (v2/stocks/snapshots response format) ---
// Response has tickers as top-level keys (camelCase fields, no "snapshots" wrapper)
const stockSnapshotsResponse = (tickers: string[]): Response => {
  const all: Record<string, unknown> = {
    AAPL: {
      latestQuote: { bp: 172.6, ap: 172.7, t: '2026-04-25T20:00:00Z' },
      prevDailyBar: { c: 170.0 }
    },
    MSFT: {
      latestQuote: { bp: 420.5, ap: 420.6, t: '2026-04-25T20:00:00Z' },
      prevDailyBar: { c: 415.0 }
    },
    TSLA: {
      latestQuote: { bp: 250.0, ap: 250.1, t: '2026-04-25T20:00:00Z' },
      prevDailyBar: { c: 248.0 }
    }
  }
  const body: Record<string, unknown> = {}
  for (const t of tickers) if (all[t]) body[t] = all[t]
  return fetchOk(body)
}

// --- Option snapshot mock data ---
const contractId = 'AAPL260516P00180000'
const optionSnapshotsResponse = fetchOk({
  snapshots: {
    [contractId]: {
      latest_trade: { t: '2026-04-25T19:30:00Z', p: 4.25, s: 10, x: 'A', c: '' },
      latest_quote: {
        t: '2026-04-25T19:30:00Z',
        bp: 4.15,
        ap: 4.35,
        bs: 50,
        as: 30,
        bx: 'A',
        ax: 'A',
        c: ''
      },
      greeks: { delta: -0.45, gamma: 0.02, theta: -0.05, vega: 0.23, rho: 0.01 },
      impliedVolatility: 0.35
    }
  }
})

// --- E2E Tests ---

describe('AlpacaMarketDataProvider — E2E Integration (via factory)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSockets.length = 0
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // AC-1: Interface exposes stock quote retrieval
  it('returns stock quotes as map with 2dp prices', async () => {
    mockFetch.mockResolvedValue(stockSnapshotsResponse(['AAPL', 'MSFT', 'TSLA']))

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })
    const result = await provider.getStockQuotes(['AAPL', 'MSFT', 'TSLA'])

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(3)

    for (const symbol of ['AAPL', 'MSFT', 'TSLA']) {
      const quote = result.get(symbol)!
      expect(quote).toBeDefined()
      expect(quote.price).toMatch(/^\d+\.\d{2}$/)
    }
  })

  // AC-2: Interface exposes option snapshot retrieval
  it('returns option snapshots with greeks and computed mid', async () => {
    mockFetch.mockResolvedValue(optionSnapshotsResponse)

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })
    const result = await provider.getOptionSnapshots([contractId])

    expect(result).toBeInstanceOf(Map)
    const snap = result.get(contractId)!
    expect(snap).toBeDefined()
    expect(snap.bid).toMatch(/^\d+\.\d{2}$/)
    expect(snap.ask).toMatch(/^\d+\.\d{2}$/)
    // mid = (4.15 + 4.35) / 2 = 4.25
    expect(snap.mid).toBe('4.25')
    expect(snap.greeks.delta).toMatch(/^-?\d+\.\d{4}$/)
    expect(snap.greeks.iv).toMatch(/^-?\d+\.\d{4}$/)
    expect(typeof snap.timestamp).toBe('string')
  })

  // AC-3: Interface exposes broker activity polling
  it('returns activities sorted by transactionTime desc', async () => {
    mockGetActivity.mockResolvedValue([
      {
        activity_type: 'OPASN',
        id: 'a1',
        date: '2026-04-18',
        symbol: 'AAPL',
        qty: '100',
        per_share_amount: '180.00'
      },
      {
        activity_type: 'OPASN',
        id: 'a3',
        date: '2026-04-22',
        symbol: 'MSFT',
        qty: '100',
        per_share_amount: '190.00'
      },
      {
        activity_type: 'OPASN',
        id: 'a2',
        date: '2026-04-20',
        symbol: 'TSLA',
        qty: '100',
        per_share_amount: '170.00'
      }
    ])

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })
    const result = await provider.getActivities({ type: 'OPASN' })

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(3)
    // sorted descending
    expect(result[0].transactionTime).toBe('2026-04-22')
    expect(result[1].transactionTime).toBe('2026-04-20')
    expect(result[2].transactionTime).toBe('2026-04-18')
    // all BrokerActivity fields present
    expect(result[0]).toMatchObject({
      activityId: expect.any(String),
      activityType: 'OPASN',
      symbol: expect.any(String),
      qty: expect.any(Number),
      price: expect.any(String),
      transactionTime: expect.any(String)
    })
  })

  // AC-4: Interface exposes account info retrieval
  it('returns account info with paper environment', async () => {
    mockGetAccount.mockResolvedValue({
      buying_power: '50000.00',
      portfolio_value: '125000.00',
      cash: '50000.00',
      status: 'ACTIVE',
      currency: 'USD'
    })

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })
    const result = await provider.getAccountInfo()

    expect(result.buyingPower).toBeDefined()
    expect(result.portfolioValue).toBeDefined()
    expect(result.cash).toBeDefined()
    expect(result.environment).toBe('paper')
  })

  // AC-5: Interface exposes market status check
  it('returns market status with session type', async () => {
    mockGetClock.mockResolvedValue({
      timestamp: '2026-04-27T14:00:00-04:00',
      is_open: true,
      next_open: '2026-04-28T09:30:00-04:00',
      next_close: '2026-04-27T16:00:00-04:00'
    })

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })
    const result = await provider.getMarketStatus()

    expect(typeof result.isOpen).toBe('boolean')
    expect(typeof result.nextOpen).toBe('string')
    expect(typeof result.nextClose).toBe('string')
    expect(['regular', 'pre', 'post', 'closed']).toContain(result.session)
  })

  // AC-6: Provider declares streaming capabilities per feed
  it('supports streaming for all three feeds', () => {
    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })

    expect(provider.supportsStreaming('stockQuotes')).toBe(true)
    expect(provider.supportsStreaming('optionQuotes')).toBe(true)
    expect(provider.supportsStreaming('optionTrades')).toBe(true)
  })

  // AC-7: Provider connects and streams stock quotes
  it('streams stock quotes via Observable', async () => {
    const { provider, stockSocket } = await connectAndAuth()
    expect(stockSocket).toBeDefined()

    const events: StreamEvent<StockQuote | OptionSnapshot>[] = []
    provider.stream('stockQuotes', ['AAPL', 'MSFT']).subscribe({ next: (e) => events.push(e) })

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
    expect((events[0].data as StockQuote).bid).toBe('172.60')
    expect((events[0].data as StockQuote).ask).toBe('172.70')
    expect(typeof events[0].timestamp).toBe('string')
  })

  // AC-8: Provider streams option quotes via MessagePack
  it('streams option quotes decoded from MessagePack', async () => {
    const { provider, optionSocket } = await connectAndAuth()
    expect(optionSocket).toBeDefined()

    const events: StreamEvent<StockQuote | OptionSnapshot>[] = []
    provider.stream('optionQuotes', [contractId]).subscribe({ next: (e) => events.push(e) })

    mockDecode.mockReturnValue([
      {
        T: 'q',
        S: contractId,
        bp: 4.15,
        ap: 4.35,
        t: '2026-04-25T19:30:00Z'
      }
    ])

    emitSocketEvent(optionSocket!, 'message', Buffer.from([0x92, 0xa1]))

    expect(mockDecode).toHaveBeenCalled()
    expect(events).toHaveLength(1)
    expect(events[0].feed).toBe('optionQuotes')
    expect(events[0].symbol).toBe(contractId)
  })

  // AC-9: Unsubscribe stops receiving events for those symbols
  it('stops events after Observable unsubscribe', async () => {
    const { provider, stockSocket } = await connectAndAuth()
    expect(stockSocket).toBeDefined()

    const events: StreamEvent<StockQuote | OptionSnapshot>[] = []
    const sub = provider.stream('stockQuotes', ['AAPL']).subscribe({ next: (e) => events.push(e) })

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

    // Emit another — should NOT be received
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

    // WebSocket should still be open
    expect(stockSocket!.close).not.toHaveBeenCalled()
  })

  // AC-10: Disconnect closes all streams
  it('closes sockets and completes Observables on disconnect', async () => {
    const { provider, stockSocket, optionSocket } = await connectAndAuth()
    expect(stockSocket).toBeDefined()
    expect(optionSocket).toBeDefined()

    let stockCompleted = false
    let optionCompleted = false

    provider.stream('stockQuotes', ['AAPL']).subscribe({
      next: () => {},
      complete: () => {
        stockCompleted = true
      }
    })
    provider.stream('optionQuotes', [contractId]).subscribe({
      next: () => {},
      complete: () => {
        optionCompleted = true
      }
    })

    await provider.disconnect()

    expect(stockSocket!.close).toHaveBeenCalled()
    expect(optionSocket!.close).toHaveBeenCalled()
    expect(stockCompleted).toBe(true)
    expect(optionCompleted).toBe(true)
  })

  // AC-11: Alpaca implementation connects using configured credentials
  it('authenticates with paper credentials', async () => {
    mockGetAccount.mockResolvedValue({
      buying_power: '50000.00',
      portfolio_value: '125000.00',
      cash: '50000.00'
    })

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'paper-key',
      secretKey: 'paper-secret',
      paper: true,
      dataFeed: 'sip',
      optionFeed: 'opra'
    })

    const connectPromise = provider.connect()
    if (mockSockets.length >= 2) {
      simulateAuth(mockSockets[mockSockets.length - 2])
      simulateAuth(mockSockets[mockSockets.length - 1])
    }
    await connectPromise

    // Connected to correct endpoints
    expect(mockSockets[mockSockets.length - 2].url).toContain('v2/sip')
    expect(mockSockets[mockSockets.length - 1].url).toContain('v1beta1/opra')

    // getAccountInfo returns paper environment
    const info = await provider.getAccountInfo()
    expect(info.environment).toBe('paper')
  })

  // AC-12: Provider returns structured error when credentials are invalid
  it('throws MarketDataError auth_failed on 401', async () => {
    const error = Object.assign(new Error('Unauthorized'), { status: 401 })
    mockGetAccount.mockRejectedValue(error)

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'bad-key',
      secretKey: 'bad-secret',
      paper: true
    })

    const thrown = await provider.getAccountInfo().catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(MarketDataError)
    expect((thrown as MarketDataError).code).toBe('auth_failed')
    expect((thrown as MarketDataError).message).toMatch(/authentication/i)
  })

  // AC-13: Provider returns structured error when API is unreachable
  it('throws MarketDataError network_error on connection failure', async () => {
    mockFetch.mockRejectedValue(
      Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    )

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })

    const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

    expect(thrown).toBeInstanceOf(MarketDataError)
    expect((thrown as MarketDataError).code).toBe('network_error')
  })

  // AC-14: Provider emits error event when stream disconnects unexpectedly
  it('emits StreamError on unexpected WebSocket close', async () => {
    const { provider, stockSocket } = await connectAndAuth()
    expect(stockSocket).toBeDefined()

    let receivedError: StreamError | null = null
    provider.stream('stockQuotes', ['AAPL']).subscribe({
      next: () => {},
      error: (err: unknown) => {
        receivedError = err as StreamError
      }
    })

    emitSocketEvent(stockSocket!, 'close', 1006)

    expect(receivedError).not.toBeNull()
    expect(receivedError!.code).toBe('stream_disconnected')
    expect(receivedError!.feed).toBe('stockQuotes')
    expect(receivedError!.reconnectable).toBe(true)
  })

  // AC-15: Provider handles unknown ticker gracefully
  it('omits unknown tickers without error', async () => {
    mockFetch.mockResolvedValue(stockSnapshotsResponse(['AAPL']))

    const provider = createMarketDataProvider({
      provider: 'alpaca',
      keyId: 'test-key',
      secretKey: 'test-secret',
      paper: true
    })

    const result = await provider.getStockQuotes(['AAPL', 'ZZZZZ'])

    expect(result.has('AAPL')).toBe(true)
    expect(result.has('ZZZZZ')).toBe(false)
  })

  // AC-16: Subscribe rejects unsupported feed
  it('throws MarketDataError streaming_unsupported', async () => {
    const { provider } = await connectAndAuth()

    expect(() => provider.stream('invalidFeed' as DataFeed, ['AAPL'])).toThrow(MarketDataError)

    try {
      provider.stream('invalidFeed' as DataFeed, ['AAPL'])
    } catch (err) {
      expect((err as MarketDataError).code).toBe('streaming_unsupported')
    }
  })
})
