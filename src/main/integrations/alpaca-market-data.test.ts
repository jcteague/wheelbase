// [US-99] AlpacaMarketDataProvider — implements MarketDataProvider on Alpaca's free plan

import type { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MarketDataError,
  type OptionSnapshot,
  type StockQuote,
  type StreamEvent
} from './market-data-provider'
import type { AlpacaCredentials } from '../services/settings'
import { logger } from '../logger'

const mockFetch = vi.fn()

type MockWsInstance = EventEmitter & {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  readyState: number
}

// Captured sockets and their URLs so tests can drive the handshake frame by frame.
const mockWsInstances: MockWsInstance[] = []
const mockWsUrls: string[] = []
vi.mock('ws', async () => {
  const { EventEmitter: Emitter } = await import('events')
  // readyState is modelled because the provider gates subscription frames on OPEN.
  class MockWs extends Emitter {
    static readonly OPEN = 1
    static readonly CLOSED = 3
    send = vi.fn()
    close = vi.fn()
    readyState = 1
    constructor(url: string) {
      super()
      mockWsUrls.push(url)
      mockWsInstances.push(this as unknown as MockWsInstance)
    }
  }
  return { default: MockWs }
})

// One observed minute bar for AAPL.
const BAR_FRAME = {
  T: 'b',
  S: 'AAPL',
  o: 319.5,
  h: 319.9,
  l: 319.4,
  c: 319.8,
  v: 40,
  t: '2026-09-04T20:34:00Z',
  n: 1,
  vw: 319.8
}

function fetchOk(body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => headers[name] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body))
  } as unknown as Response
}

function fetchErr(status: number, body = '', headers: Record<string, string> = {}): Response {
  return {
    ok: false,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body)
  } as unknown as Response
}

import { AlpacaMarketDataProvider } from './alpaca-market-data'

const PAPER_CREDS: AlpacaCredentials = {
  environment: 'paper',
  keyId: 'PKTESTKEYID',
  secret: 'super-secret-value'
}

function createProvider(creds: AlpacaCredentials | null = PAPER_CREDS): {
  provider: AlpacaMarketDataProvider
  loadCredentials: ReturnType<typeof vi.fn>
} {
  const loadCredentials = vi.fn(() => creds)
  return { provider: new AlpacaMarketDataProvider({ loadCredentials }), loadCredentials }
}

// Live AAPL snapshot transcribed from Alpaca on 2026-09-04 (Friday close).
const AAPL_SNAPSHOT = {
  latestTrade: {
    p: 319.8,
    s: 100,
    t: '2026-09-04T20:34:14.232841838Z',
    x: 'V',
    c: ['@'],
    i: 1,
    z: 'C'
  },
  latestQuote: {
    bp: 305.33,
    bs: 1,
    ap: 338.27,
    as: 1,
    t: '2026-09-04T20:34:14.232841838Z',
    bx: 'V',
    ax: 'V',
    c: ['R'],
    z: 'C'
  },
  dailyBar: {
    o: 325.0,
    h: 329.0,
    l: 318.0,
    c: 319.8,
    v: 1224559,
    t: '2026-09-04T04:00:00Z',
    n: 9000,
    vw: 322.1
  },
  prevDailyBar: {
    o: 327.0,
    h: 330.0,
    l: 325.0,
    c: 328.22,
    v: 2000000,
    t: '2026-09-03T04:00:00Z',
    n: 12000,
    vw: 327.5
  }
}

function snapshotWithout(block: keyof typeof AAPL_SNAPSHOT): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...AAPL_SNAPSHOT }
  delete copy[block]
  return copy
}

function lastFetchUrl(): string {
  const call = mockFetch.mock.calls.at(-1)
  return String(call?.[0])
}

function fetchUrlAt(index: number): string {
  return String(mockFetch.mock.calls[index]?.[0])
}

function fetchInitAt(index: number): RequestInit {
  return (mockFetch.mock.calls[index]?.[1] ?? {}) as RequestInit
}

describe('AlpacaMarketDataProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // === getStockQuotes ===

  describe('getStockQuotes', () => {
    it('issues exactly one batched IEX snapshot request for the whole ticker list', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: AAPL_SNAPSHOT, MSFT: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      await provider.getStockQuotes(['AAPL', 'MSFT'])

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(fetchUrlAt(0)).toBe(
        'https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL%2CMSFT&feed=iex'
      )
    })

    it('sends the loaded credentials as Alpaca auth headers', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      await provider.getStockQuotes(['AAPL'])

      const headers = fetchInitAt(0).headers as Record<string, string>
      expect(headers['APCA-API-KEY-ID']).toBe(PAPER_CREDS.keyId)
      expect(headers['APCA-API-SECRET-KEY']).toBe(PAPER_CREDS.secret)
    })

    it('resolves credentials on every request rather than caching them', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider, loadCredentials } = createProvider()
      await provider.getStockQuotes(['AAPL'])
      const afterFirst = loadCredentials.mock.calls.length
      await provider.getStockQuotes(['AAPL'])

      expect(loadCredentials.mock.calls.length).toBeGreaterThan(afterFirst)
    })

    it('makes no request and returns an empty map for an empty ticker list', async () => {
      const { provider } = createProvider()
      const result = await provider.getStockQuotes([])

      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.size).toBe(0)
    })

    it('maps the live AAPL snapshot onto StockQuote', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      expect(result.get('AAPL')).toEqual({
        price: '319.80',
        bid: '305.33',
        ask: '338.27',
        prevClose: '328.22',
        change: '-8.42',
        // -8.42 / 328.22 * 100 = -2.56535250… → ROUND_HALF_UP at 4dp.
        // (data-model.md's worked example prints -2.5653; its own stated rule gives -2.5654)
        changePercent: '-2.5654',
        volume: 1224559,
        timestamp: '2026-09-04T20:34:14.232Z'
      })
    })

    it('omits a ticker that is absent from the response map', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      const result = await provider.getStockQuotes(['AAPL', 'ZZZZ'])

      expect(result.has('ZZZZ')).toBe(false)
      expect(result.has('AAPL')).toBe(true)
    })

    it('skips a snapshot without latestTrade and still returns its sibling', async () => {
      const debugSpy = vi.spyOn(logger, 'debug')
      mockFetch.mockResolvedValue(
        fetchOk({ AAPL: AAPL_SNAPSHOT, MSFT: snapshotWithout('latestTrade') })
      )

      const { provider } = createProvider()
      const result = await provider.getStockQuotes(['AAPL', 'MSFT'])

      expect(result.has('MSFT')).toBe(false)
      expect(result.get('AAPL')?.price).toBe('319.80')
      expect(debugSpy).toHaveBeenCalled()
    })

    it('falls back to the trade price for bid and ask when latestQuote is absent', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: snapshotWithout('latestQuote') }))

      const { provider } = createProvider()
      const quote = await provider.getStockQuotes(['AAPL']).then((m) => m.get('AAPL'))

      expect(quote?.bid).toBe('319.80')
      expect(quote?.ask).toBe('319.80')
      expect(quote?.price).toBe('319.80')
    })

    it('blanks prevClose, change and changePercent when prevDailyBar is absent', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: snapshotWithout('prevDailyBar') }))

      const { provider } = createProvider()
      const quote = await provider.getStockQuotes(['AAPL']).then((m) => m.get('AAPL'))

      expect(quote?.prevClose).toBe('')
      expect(quote?.change).toBe('')
      expect(quote?.changePercent).toBe('')
    })

    it('defaults volume to 0 when dailyBar is absent', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: snapshotWithout('dailyBar') }))

      const { provider } = createProvider()
      const quote = await provider.getStockQuotes(['AAPL']).then((m) => m.get('AAPL'))

      expect(quote?.volume).toBe(0)
    })

    it('throws auth_failed without fetching when no credentials are configured', async () => {
      const { provider } = createProvider(null)
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('auth_failed')
      expect((thrown as MarketDataError).message).toBe('Alpaca credentials not configured')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('never logs the secret', async () => {
      const debugSpy = vi.spyOn(logger, 'debug')
      mockFetch.mockResolvedValue(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      await provider.getStockQuotes(['AAPL'])

      const logged = JSON.stringify(debugSpy.mock.calls)
      expect(logged).not.toContain(PAPER_CREDS.secret)
    })
  })

  // === apiFetch error mapping (exercised through getStockQuotes) ===

  describe('apiFetch error mapping', () => {
    it.each([
      [401, 'auth_failed', 'HTTP 401'],
      [403, 'auth_failed', 'HTTP 403']
    ])('maps HTTP %i to %s', async (status, code, message) => {
      mockFetch.mockResolvedValue(fetchErr(status))

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe(code)
      expect((thrown as MarketDataError).message).toBe(message)
    })

    it('maps HTTP 404 to not_found', async () => {
      mockFetch.mockResolvedValue(fetchErr(404))

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('not_found')
      expect((thrown as MarketDataError).message).toContain('HTTP 404')
    })

    it.each([400, 500])('maps HTTP %i to unknown', async (status) => {
      mockFetch.mockResolvedValue(fetchErr(status))

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('unknown')
      expect((thrown as MarketDataError).message).toBe(`HTTP ${status}`)
    })

    it('retries a 429 honouring Retry-After and succeeds on the second call', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchErr(429, '', { 'Retry-After': '0' }))
        .mockResolvedValueOnce(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.get('AAPL')?.price).toBe('319.80')
    })

    it('gives up with rate_limited after exactly three 429 responses', async () => {
      mockFetch.mockResolvedValue(fetchErr(429, '', { 'Retry-After': '0' }))

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect((thrown as MarketDataError).code).toBe('rate_limited')
      expect((thrown as MarketDataError).message).toBe('rate limit exceeded')
    })

    it('maps a transport failure to network_error', async () => {
      mockFetch.mockRejectedValue(
        Object.assign(new Error('getaddrinfo ENOTFOUND'), { cause: { code: 'ENOTFOUND' } })
      )

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('network_error')
    })

    it('maps a non-network fetch rejection to unknown', async () => {
      mockFetch.mockRejectedValue(new Error('boom'))

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('unknown')
      expect((thrown as MarketDataError).message).toBe('boom')
    })

    it('requests the snapshot endpoint on the data host', async () => {
      mockFetch.mockResolvedValue(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      await provider.getStockQuotes(['AAPL'])

      expect(lastFetchUrl()).toContain('https://data.alpaca.markets/v2/stocks/snapshots')
    })
  })
})

// === Option fixtures (transcribed from Alpaca on 2026-09-04) ===

const ATM_PUT_KEY = 'AAPL261009P00320000'
const OTM_PUT_KEY = 'AAPL261009P00110000'

const ATM_PUT_SNAPSHOT = {
  latestQuote: {
    ap: 9.41,
    as: 44,
    ax: 'W',
    bp: 8.97,
    bs: 25,
    bx: 'U',
    c: 'A',
    t: '2026-09-04T19:59:59.813790162Z'
  },
  latestTrade: { c: 'a', p: 9.21, s: 2, t: '2026-09-04T19:59:44.613327747Z', x: 'J' },
  greeks: { delta: -0.467, gamma: 0.0163, rho: -0.1434, theta: -0.1309, vega: 0.3826 },
  impliedVolatility: 0.2538,
  dailyBar: {
    c: 9.21,
    h: 9.75,
    l: 6.45,
    n: 53,
    o: 6.45,
    t: '2026-09-04T04:00:00Z',
    v: 147,
    vw: 8.301633
  }
}

// Deep OTM: Alpaca has no model for it, so greeks is present but empty and it has never
// been quoted or traded.
const OTM_PUT_SNAPSHOT = {
  greeks: {},
  dailyBar: {
    c: 0.01,
    h: 0.01,
    l: 0.01,
    n: 1,
    o: 0.01,
    t: '2026-09-04T04:00:00Z',
    v: 3,
    vw: 0.01
  }
}

const CHAIN_FILTER = {
  underlying: 'AAPL',
  type: 'put' as const,
  expirationFrom: '2026-10-06',
  expirationTo: '2026-10-21'
}

const ATM_EXPECTED = {
  contractId: ATM_PUT_KEY,
  strike: '320.0000',
  expiration: '2026-10-09',
  contractType: 'put',
  bid: '8.97',
  ask: '9.41',
  mid: '9.19',
  lastTrade: '9.21',
  openInterest: 8,
  volume: 147,
  greeks: { delta: '-0.4670', gamma: '0.0163', theta: '-0.1309', vega: '0.3826' },
  impliedVolatility: '0.2538',
  timestamp: '2026-09-04T19:59:59.813Z'
}

function chainPage(
  snapshots: Record<string, unknown>,
  nextPageToken: string | null = null
): unknown {
  return { snapshots, next_page_token: nextPageToken }
}

function contractsPage(
  rows: Array<{ symbol: string; open_interest: string | null }>,
  nextPageToken: string | null = null
): unknown {
  return { option_contracts: rows, next_page_token: nextPageToken }
}

function paramsAt(index: number): URLSearchParams {
  return new URL(fetchUrlAt(index)).searchParams
}

describe('AlpacaMarketDataProvider option data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('getOptionChainSnapshot', () => {
    function mockChainThenContracts(
      snapshots: Record<string, unknown>,
      rows: Array<{ symbol: string; open_interest: string | null }>
    ): void {
      mockFetch
        .mockResolvedValueOnce(fetchOk(chainPage(snapshots)))
        .mockResolvedValueOnce(fetchOk(contractsPage(rows)))
    }

    it('requests the indicative chain feed with the filter translated to Alpaca params', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider()
      await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(fetchUrlAt(0)).toContain('https://data.alpaca.markets/v1beta1/options/snapshots/AAPL?')
      const params = paramsAt(0)
      expect(params.get('feed')).toBe('indicative')
      expect(params.get('type')).toBe('put')
      expect(params.get('expiration_date_gte')).toBe('2026-10-06')
      expect(params.get('expiration_date_lte')).toBe('2026-10-21')
      expect(params.get('limit')).toBe('1000')
      expect(params.has('page_token')).toBe(false)
    })

    it('translates strike bounds to strike_price_gte/lte', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider()
      await provider.getOptionChainSnapshot({
        ...CHAIN_FILTER,
        strikeFrom: '300',
        strikeTo: '340'
      })

      expect(paramsAt(0).get('strike_price_gte')).toBe('300')
      expect(paramsAt(0).get('strike_price_lte')).toBe('340')
    })

    it('honours an explicit limit and returns a single page despite next_page_token', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, 'p2')))
        .mockResolvedValueOnce(fetchOk(contractsPage([])))

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot({ ...CHAIN_FILTER, limit: 50 })

      expect(paramsAt(0).get('limit')).toBe('50')
      expect(result).toHaveLength(1)
      // one chain page + one contracts page — the next_page_token was not followed
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('caps an oversized limit at the Alpaca page maximum', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider()
      await provider.getOptionChainSnapshot({ ...CHAIN_FILTER, limit: 5000 })

      expect(paramsAt(0).get('limit')).toBe('1000')
    })

    it('passes a cursor through as page_token', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider()
      await provider.getOptionChainSnapshot({ ...CHAIN_FILTER, limit: 50, cursor: 'abc' })

      expect(paramsAt(0).get('page_token')).toBe('abc')
    })

    it('walks chain pages to exhaustion when no limit is given', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, 'p2')))
        .mockResolvedValueOnce(fetchOk(chainPage({ [OTM_PUT_KEY]: OTM_PUT_SNAPSHOT }, null)))
        .mockResolvedValueOnce(fetchOk(contractsPage([])))

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(paramsAt(1).get('page_token')).toBe('p2')
      expect(result.map((q) => q.contractId)).toEqual([ATM_PUT_KEY, OTM_PUT_KEY])
    })

    it('joins open interest from the paper trading host after the chain request', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [
        { symbol: ATM_PUT_KEY, open_interest: '8' }
      ])

      const { provider } = createProvider()
      await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(fetchUrlAt(0)).toContain('https://data.alpaca.markets')
      expect(fetchUrlAt(1)).toContain('https://paper-api.alpaca.markets/v2/options/contracts')
      const params = paramsAt(1)
      expect(params.get('underlying_symbols')).toBe('AAPL')
      expect(params.get('type')).toBe('put')
      expect(params.get('expiration_date_gte')).toBe('2026-10-06')
      expect(params.get('expiration_date_lte')).toBe('2026-10-21')
      expect(params.get('limit')).toBe('10000')
      const headers = fetchInitAt(1).headers as Record<string, string>
      expect(headers['APCA-API-KEY-ID']).toBe(PAPER_CREDS.keyId)
      expect(headers['APCA-API-SECRET-KEY']).toBe(PAPER_CREDS.secret)
    })

    it('uses the live trading host for live credentials', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider({
        environment: 'live',
        keyId: 'AKLIVE',
        secret: 'live-secret'
      })
      await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(fetchUrlAt(1)).toContain('https://api.alpaca.markets/v2/options/contracts')
    })

    it('follows contracts pagination to exhaustion', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT })))
        .mockResolvedValueOnce(
          fetchOk(contractsPage([{ symbol: 'OTHER', open_interest: '3' }], 'c2'))
        )
        .mockResolvedValueOnce(
          fetchOk(contractsPage([{ symbol: ATM_PUT_KEY, open_interest: '8' }], null))
        )

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(paramsAt(2).get('page_token')).toBe('c2')
      expect(result[0].openInterest).toBe(8)
    })

    it('maps the ATM fixture onto the worked OptionChainQuote example', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [
        { symbol: ATM_PUT_KEY, open_interest: '8' }
      ])

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result).toEqual([ATM_EXPECTED])
    })

    it('reports null open interest when the contracts row carries null', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [
        { symbol: ATM_PUT_KEY, open_interest: null }
      ])

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result[0].openInterest).toBeNull()
    })

    it('reports null open interest when the symbol is absent from contracts', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result[0].openInterest).toBeNull()
    })

    it.each([
      ['a 500 response', () => mockFetch.mockResolvedValueOnce(fetchErr(500))],
      [
        'a transport failure',
        () =>
          mockFetch.mockRejectedValueOnce(
            Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })
          )
      ],
      [
        'exhausted rate limiting',
        () => mockFetch.mockResolvedValue(fetchErr(429, '', { 'Retry-After': '0' }))
      ]
    ])(
      'returns quotes with null open interest and warns when contracts fails with %s',
      async (_label, failContracts) => {
        const warnSpy = vi.spyOn(logger, 'warn')
        mockFetch.mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT })))
        failContracts()

        const { provider } = createProvider()
        const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

        expect(result).toHaveLength(1)
        expect(result[0].openInterest).toBeNull()
        expect(JSON.stringify(warnSpy.mock.calls)).toContain('AAPL')
      }
    )

    it('maps a never-quoted deep-OTM strike to zeroed prices without dropping its sibling', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT, [OTM_PUT_KEY]: OTM_PUT_SNAPSHOT }, [
        { symbol: ATM_PUT_KEY, open_interest: '8' }
      ])

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      const otm = result.find((q) => q.contractId === OTM_PUT_KEY)
      expect(otm).toMatchObject({
        bid: '0.00',
        ask: '0.00',
        mid: '0.00',
        lastTrade: '0.00',
        volume: 3,
        timestamp: '1970-01-01T00:00:00.000Z'
      })
      expect(otm).not.toHaveProperty('greeks')
      expect(result.find((q) => q.contractId === ATM_PUT_KEY)).toEqual(ATM_EXPECTED)
    })

    it('omits greeks when the set is incomplete and never emits rho', async () => {
      mockChainThenContracts(
        { [ATM_PUT_KEY]: { ...ATM_PUT_SNAPSHOT, greeks: { delta: -0.2 } } },
        []
      )

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result[0]).not.toHaveProperty('greeks')
      expect(JSON.stringify(result[0])).not.toContain('rho')
    })

    it('omits impliedVolatility when Alpaca does not supply it', async () => {
      const noIv: Record<string, unknown> = { ...ATM_PUT_SNAPSHOT }
      delete noIv.impliedVolatility
      mockChainThenContracts({ [ATM_PUT_KEY]: noIv }, [])

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result[0]).not.toHaveProperty('impliedVolatility')
    })

    it('normalises nanosecond timestamps to millisecond ISO strings', async () => {
      mockChainThenContracts({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result[0].timestamp).toBe('2026-09-04T19:59:59.813Z')
    })

    it('skips a snapshot key that is not a valid OCC symbol', async () => {
      const debugSpy = vi.spyOn(logger, 'debug')
      mockChainThenContracts({ BOGUS: ATM_PUT_SNAPSHOT, [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT }, [])

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result.map((q) => q.contractId)).toEqual([ATM_PUT_KEY])
      expect(JSON.stringify(debugSpy.mock.calls)).toContain('BOGUS')
    })

    it('returns an empty array and skips the contracts request for an empty chain', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(chainPage({})))

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result).toEqual([])
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('throws auth_failed without fetching when no credentials are configured', async () => {
      const { provider } = createProvider(null)
      const thrown = await provider.getOptionChainSnapshot(CHAIN_FILTER).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('auth_failed')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('getOptionSnapshot', () => {
    it('requests the single-contract indicative snapshot and maps it', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT })))

      const { provider } = createProvider()
      const result = await provider.getOptionSnapshot(ATM_PUT_KEY)

      expect(fetchUrlAt(0)).toBe(
        `https://data.alpaca.markets/v1beta1/options/snapshots?symbols=${ATM_PUT_KEY}&feed=indicative`
      )
      expect(result).toEqual({
        bid: '8.97',
        ask: '9.41',
        mid: '9.19',
        lastTrade: '9.21',
        openInterest: null,
        volume: 147,
        greeks: { delta: '-0.4670', gamma: '0.0163', theta: '-0.1309', vega: '0.3826' },
        impliedVolatility: '0.2538',
        timestamp: '2026-09-04T19:59:59.813Z'
      })
    })

    it('throws not_found when the requested symbol is absent from the response', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk(chainPage({})))

      const { provider } = createProvider()
      const thrown = await provider.getOptionSnapshot(ATM_PUT_KEY).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('not_found')
      expect((thrown as MarketDataError).message).toBe(
        `Option contract ${ATM_PUT_KEY} not in snapshot`
      )
    })

    it('throws auth_failed without fetching when no credentials are configured', async () => {
      const { provider } = createProvider(null)
      const thrown = await provider.getOptionSnapshot(ATM_PUT_KEY).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('auth_failed')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})

// === Streaming ===

describe('AlpacaMarketDataProvider streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWsInstances.length = 0
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function serverSends(ws: MockWsInstance, frames: unknown[]): void {
    ws.emit('message', Buffer.from(JSON.stringify(frames)))
  }

  function sentFrames(ws: MockWsInstance): Array<Record<string, unknown>> {
    return ws.send.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>)
  }

  // Drives the observed handshake: connected → client auths → authenticated → connect resolves.
  async function connectProvider(
    creds: AlpacaCredentials | null = PAPER_CREDS
  ): Promise<{ provider: AlpacaMarketDataProvider; ws: MockWsInstance }> {
    const { provider } = createProvider(creds)
    const connecting = provider.connect()
    const ws = mockWsInstances[0]
    serverSends(ws, [{ T: 'success', msg: 'connected' }])
    serverSends(ws, [{ T: 'success', msg: 'authenticated' }])
    await connecting
    return { provider, ws }
  }

  describe('supportsStreaming', () => {
    it('streams stock quotes only', () => {
      const { provider } = createProvider()
      expect(provider.supportsStreaming('stockQuotes')).toBe(true)
      expect(provider.supportsStreaming('optionQuotes')).toBe(false)
      expect(provider.supportsStreaming('optionTrades')).toBe(false)
    })
  })

  describe('connect', () => {
    it('opens the IEX stream and authenticates with the loaded credentials', async () => {
      const { ws } = await connectProvider()

      expect(mockWsUrls[0]).toBe('wss://stream.data.alpaca.markets/v2/iex')
      expect(sentFrames(ws)).toEqual([
        { action: 'auth', key: PAPER_CREDS.keyId, secret: PAPER_CREDS.secret }
      ])
    })

    it('sends no subscribe frame during the handshake', async () => {
      const { ws } = await connectProvider()

      expect(sentFrames(ws).some((f) => f.action === 'subscribe')).toBe(false)
    })

    it('rejects with auth_failed and opens no socket without credentials', async () => {
      const { provider } = createProvider(null)
      const thrown = await provider.connect().catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('auth_failed')
      expect(mockWsInstances).toHaveLength(0)
    })

    it.each([
      [402, 'auth_failed'],
      [409, 'streaming_unsupported'],
      [406, 'unknown']
    ])('rejects an error frame with code %i as %s', async (code, expected) => {
      const { provider } = createProvider()
      const connecting = provider.connect()
      const ws = mockWsInstances[0]
      serverSends(ws, [{ T: 'success', msg: 'connected' }])
      serverSends(ws, [{ T: 'error', code, msg: 'refused' }])

      const thrown = await connecting.catch((e: unknown) => e)
      expect((thrown as MarketDataError).code).toBe(expected)
      expect(ws.close).toHaveBeenCalled()
    })

    it('rejects a socket transport error as network_error', async () => {
      const { provider } = createProvider()
      const connecting = provider.connect()
      mockWsInstances[0].emit('error', new Error('ECONNRESET'))

      const thrown = await connecting.catch((e: unknown) => e)
      expect((thrown as MarketDataError).code).toBe('network_error')
    })

    it('rejects with network_error when no authenticated frame arrives within 10s', async () => {
      vi.useFakeTimers()
      const { provider } = createProvider()
      // The handler is attached up front: advancing the timers rejects before any later
      // `.catch()` could run, which Vitest would report as an unhandled rejection.
      const connecting = provider.connect().catch((e: unknown) => e)
      serverSends(mockWsInstances[0], [{ T: 'success', msg: 'connected' }])

      await vi.advanceTimersByTimeAsync(10_000)

      const thrown = await connecting
      expect((thrown as MarketDataError).code).toBe('network_error')
      expect((thrown as MarketDataError).message).toBe('auth timeout')
    })

    // The confirmation must echo what the SERVER acknowledged, not our local set —
    // otherwise a client/server subscription mismatch is invisible in the log.
    it('logs the server-confirmed bars separately from the frames we send', async () => {
      const debugSpy = vi.spyOn(logger, 'debug')
      const { provider, ws } = await connectProvider()
      provider.stream('stockQuotes', ['AAPL'])
      debugSpy.mockClear()

      serverSends(ws, [{ T: 'subscription', bars: ['AAPL', 'NVDA'] }])

      expect(debugSpy).toHaveBeenCalledWith(
        { bars: ['AAPL', 'NVDA'] },
        'alpaca_ws_subscription_confirmed'
      )
    })

    it('never logs the secret in control-frame logging', async () => {
      const debugSpy = vi.spyOn(logger, 'debug')
      const infoSpy = vi.spyOn(logger, 'info')
      const { provider, ws } = await connectProvider()
      provider.stream('stockQuotes', ['AAPL'])
      serverSends(ws, [{ T: 'subscription', bars: ['AAPL'] }])

      const logged = JSON.stringify([...debugSpy.mock.calls, ...infoSpy.mock.calls])
      expect(logged).not.toContain(PAPER_CREDS.secret)
    })
  })

  describe('stream subscriptions', () => {
    it('subscribes to the requested bars after connecting', async () => {
      const { provider, ws } = await connectProvider()
      ws.send.mockClear()

      provider.stream('stockQuotes', ['AAPL', 'NVDA'])

      expect(sentFrames(ws)).toEqual([{ action: 'subscribe', bars: ['AAPL', 'NVDA'] }])
    })

    it('sends only the difference when the ticker set changes', async () => {
      const { provider, ws } = await connectProvider()
      provider.stream('stockQuotes', ['AAPL', 'NVDA'])
      ws.send.mockClear()

      provider.stream('stockQuotes', ['NVDA', 'TSLA'])

      expect(sentFrames(ws)).toEqual([
        { action: 'unsubscribe', bars: ['AAPL'] },
        { action: 'subscribe', bars: ['TSLA'] }
      ])
    })

    it('sends nothing when the ticker set is unchanged', async () => {
      const { provider, ws } = await connectProvider()
      provider.stream('stockQuotes', ['AAPL'])
      ws.send.mockClear()

      provider.stream('stockQuotes', ['AAPL'])

      expect(ws.send).not.toHaveBeenCalled()
    })

    it('sends nothing while the socket is not open', async () => {
      const { provider, ws } = await connectProvider()
      ws.send.mockClear()
      ws.readyState = 3

      provider.stream('stockQuotes', ['AAPL'])

      expect(ws.send).not.toHaveBeenCalled()
    })

    it('sends nothing before connect but still delivers later ticks', async () => {
      const { provider } = createProvider()
      const received: Array<StreamEvent<StockQuote | OptionSnapshot>> = []
      provider.stream('stockQuotes', ['AAPL']).subscribe((ev) => received.push(ev))

      expect(mockWsInstances).toHaveLength(0)

      const connecting = provider.connect()
      const ws = mockWsInstances[0]
      serverSends(ws, [{ T: 'success', msg: 'connected' }])
      serverSends(ws, [{ T: 'success', msg: 'authenticated' }])
      await connecting
      serverSends(ws, [BAR_FRAME])

      expect(received).toHaveLength(1)
    })
  })

  describe('ticks', () => {
    it('maps a bar frame onto a StockQuote stream event for a matching subscriber', async () => {
      const { provider, ws } = await connectProvider()
      const received: Array<StreamEvent<StockQuote | OptionSnapshot>> = []
      provider.stream('stockQuotes', ['AAPL']).subscribe((ev) => received.push(ev))

      serverSends(ws, [BAR_FRAME])

      expect(received).toEqual([
        {
          feed: 'stockQuotes',
          symbol: 'AAPL',
          data: {
            price: '319.80',
            bid: '319.80',
            ask: '319.80',
            change: '',
            changePercent: '',
            prevClose: '',
            volume: 40,
            timestamp: '2026-09-04T20:34:00.000Z'
          },
          timestamp: '2026-09-04T20:34:00.000Z'
        }
      ])
    })

    it('does not deliver a tick to a subscriber for a different symbol', async () => {
      const { provider, ws } = await connectProvider()
      const received: unknown[] = []
      provider.stream('stockQuotes', ['MSFT']).subscribe((ev) => received.push(ev))

      serverSends(ws, [BAR_FRAME])

      expect(received).toHaveLength(0)
    })

    it('delivers every tick to a subscriber with an empty symbol list', async () => {
      const { provider, ws } = await connectProvider()
      const received: unknown[] = []
      provider.stream('stockQuotes', []).subscribe((ev) => received.push(ev))

      serverSends(ws, [BAR_FRAME])

      expect(received).toHaveLength(1)
    })

    it('ignores a non-JSON frame and an unknown frame type without throwing', async () => {
      const { provider, ws } = await connectProvider()
      const received: unknown[] = []
      let errored: unknown = null
      provider.stream('stockQuotes', []).subscribe({
        next: (ev) => received.push(ev),
        error: (err) => {
          errored = err
        }
      })

      expect(() => ws.emit('message', Buffer.from('not json'))).not.toThrow()
      serverSends(ws, [{ T: 'somethingNew', foo: 1 }])

      expect(received).toHaveLength(0)
      expect(errored).toBeNull()
    })
  })

  describe('post-connect error frames', () => {
    it.each([
      [405, 'symbol_limit'],
      [406, 'connection_limit'],
      [499, 'unknown']
    ])('surfaces error code %i on the stream error channel as %s', async (code, expected) => {
      const { provider, ws } = await connectProvider()
      let errored: unknown = null
      provider.stream('stockQuotes', ['AAPL']).subscribe({
        next: () => {},
        error: (err) => {
          errored = err
        }
      })

      serverSends(ws, [{ T: 'error', code, msg: 'symbol limit exceeded' }])

      expect(errored).toEqual({
        feed: 'stockQuotes',
        code: expected,
        message: 'symbol limit exceeded',
        reconnectable: false
      })
    })
  })

  describe('disconnect', () => {
    it('closes the socket and forgets the subscribed set', async () => {
      const { provider, ws } = await connectProvider()
      provider.stream('stockQuotes', ['AAPL'])
      await provider.disconnect()

      expect(ws.close).toHaveBeenCalled()

      const reconnecting = provider.connect()
      const ws2 = mockWsInstances[1]
      serverSends(ws2, [{ T: 'success', msg: 'connected' }])
      serverSends(ws2, [{ T: 'success', msg: 'authenticated' }])
      await reconnecting
      ws2.send.mockClear()

      provider.stream('stockQuotes', ['AAPL'])

      expect(sentFrames(ws2)).toEqual([{ action: 'subscribe', bars: ['AAPL'] }])
    })

    it('resolves when there is no socket', async () => {
      const { provider } = createProvider()
      await expect(provider.disconnect()).resolves.toBeUndefined()
    })

    it('clears the socket on a server-initiated close', async () => {
      const infoSpy = vi.spyOn(logger, 'info')
      const { ws } = await connectProvider()

      ws.emit('close')

      expect(JSON.stringify(infoSpy.mock.calls)).toContain('alpaca_ws_closed')
    })
  })
})

// === Defensive fallbacks ===
//
// Alpaca's payloads are typed as fully-optional because the vendor omits blocks rather than
// sending nulls. These pin what the provider does when a block, header or field is absent so
// a thin response degrades instead of throwing.

describe('AlpacaMarketDataProvider degraded payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWsInstances.length = 0
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  describe('REST', () => {
    it('reports a generic message for a network rejection that is not an Error', async () => {
      mockFetch.mockRejectedValue({ cause: { code: 'ENOTFOUND' } })

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('network_error')
      expect((thrown as MarketDataError).message).toBe('network error')
    })

    it('stringifies a non-Error, non-network rejection', async () => {
      mockFetch.mockRejectedValue('kaboom')

      const { provider } = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect((thrown as MarketDataError).code).toBe('unknown')
      expect((thrown as MarketDataError).message).toBe('kaboom')
    })

    it('waits a default second when a 429 carries no Retry-After header', async () => {
      vi.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(fetchErr(429))
        .mockResolvedValueOnce(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      const pending = provider.getStockQuotes(['AAPL'])

      await vi.advanceTimersByTimeAsync(999)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      expect(await pending).toEqual(expect.any(Map))
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns an empty chain when the response omits the snapshots map', async () => {
      mockFetch.mockResolvedValueOnce(fetchOk({ next_page_token: null }))

      const { provider } = createProvider()

      expect(await provider.getOptionChainSnapshot(CHAIN_FILTER)).toEqual([])
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips a snapshot key whose value is null', async () => {
      mockFetch
        .mockResolvedValueOnce(
          fetchOk({
            snapshots: { [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT, [OTM_PUT_KEY]: null },
            next_page_token: null
          })
        )
        .mockResolvedValueOnce(fetchOk(contractsPage([])))

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result.map((q) => q.contractId)).toEqual([ATM_PUT_KEY])
    })

    it('treats a contracts response with no rows as no open interest', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT })))
        .mockResolvedValueOnce(fetchOk({ next_page_token: null }))

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result[0].openInterest).toBeNull()
    })

    it('reports null open interest for an unparseable count', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT })))
        .mockResolvedValueOnce(
          fetchOk(contractsPage([{ symbol: ATM_PUT_KEY, open_interest: 'n/a' }]))
        )

      const { provider } = createProvider()
      const result = await provider.getOptionChainSnapshot(CHAIN_FILTER)

      expect(result[0].openInterest).toBeNull()
    })

    it('returns an empty map for an empty ticker list even with no credentials', async () => {
      const { provider } = createProvider(null)

      expect((await provider.getStockQuotes([])).size).toBe(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('waits the default second when Retry-After is an HTTP date rather than seconds', async () => {
      vi.useFakeTimers()
      mockFetch
        .mockResolvedValueOnce(
          fetchErr(429, '', { 'Retry-After': 'Fri, 06 Sep 2026 12:00:00 GMT' })
        )
        .mockResolvedValueOnce(fetchOk({ AAPL: AAPL_SNAPSHOT }))

      const { provider } = createProvider()
      const pending = provider.getStockQuotes(['AAPL'])

      await vi.advanceTimersByTimeAsync(999)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      await pending
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('reports null volume for a contract with no daily bar', async () => {
      const noBar: Record<string, unknown> = { ...ATM_PUT_SNAPSHOT }
      delete noBar.dailyBar
      mockFetch.mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: noBar })))

      const { provider } = createProvider()

      expect((await provider.getOptionSnapshot(ATM_PUT_KEY)).volume).toBeNull()
    })

    it('omits every optional query parameter an unbounded filter leaves unset', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchOk(chainPage({ [ATM_PUT_KEY]: ATM_PUT_SNAPSHOT })))
        .mockResolvedValueOnce(fetchOk(contractsPage([])))

      const { provider } = createProvider()
      await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      const chain = paramsAt(0)
      expect(chain.has('type')).toBe(false)
      expect(chain.has('expiration_date_gte')).toBe(false)
      expect(chain.has('expiration_date_lte')).toBe(false)
      expect(chain.has('strike_price_gte')).toBe(false)
      expect(chain.get('feed')).toBe('indicative')
      expect(paramsAt(1).has('type')).toBe(false)
    })
  })

  describe('websocket', () => {
    function serverSends(ws: MockWsInstance, frames: unknown[]): void {
      ws.emit('message', Buffer.from(JSON.stringify(frames)))
    }

    async function connected(): Promise<{
      provider: AlpacaMarketDataProvider
      ws: MockWsInstance
    }> {
      const { provider } = createProvider()
      const connecting = provider.connect()
      const ws = mockWsInstances[0]
      serverSends(ws, [{ T: 'success', msg: 'connected' }])
      serverSends(ws, [{ T: 'success', msg: 'authenticated' }])
      await connecting
      return { provider, ws }
    }

    it('accepts a string frame as well as a Buffer', async () => {
      const { provider, ws } = await connected()
      const received: unknown[] = []
      provider.stream('stockQuotes', ['AAPL']).subscribe((ev) => received.push(ev))

      ws.emit('message', JSON.stringify([BAR_FRAME]))

      expect(received).toHaveLength(1)
    })

    it('ignores valid JSON that is not a frame array', async () => {
      const { provider, ws } = await connected()
      const received: unknown[] = []
      provider.stream('stockQuotes', []).subscribe((ev) => received.push(ev))

      ws.emit('message', Buffer.from(JSON.stringify({ T: 'b', S: 'AAPL' })))

      expect(received).toHaveLength(0)
    })

    it('zeroes a bar frame that carries no price, symbol, volume or timestamp', async () => {
      const { provider, ws } = await connected()
      const received: Array<StreamEvent<StockQuote | OptionSnapshot>> = []
      provider.stream('stockQuotes', []).subscribe((ev) => received.push(ev))

      serverSends(ws, [{ T: 'b' }])

      expect(received[0]).toEqual({
        feed: 'stockQuotes',
        symbol: '',
        data: expect.objectContaining({ price: '0.00', volume: 0 }),
        timestamp: '1970-01-01T00:00:00.000Z'
      })
    })

    it('falls back to a generic message for a post-connect error frame with no msg', async () => {
      const { provider, ws } = await connected()
      let errored: unknown = null
      provider.stream('stockQuotes', []).subscribe({
        next: () => {},
        error: (err) => {
          errored = err
        }
      })

      serverSends(ws, [{ T: 'error', code: 405 }])

      expect(errored).toMatchObject({ message: 'Alpaca WebSocket error' })
    })

    it('falls back to a generic message for a handshake error frame with no msg', async () => {
      const { provider } = createProvider()
      const connecting = provider.connect().catch((e: unknown) => e)
      const ws = mockWsInstances[0]
      serverSends(ws, [{ T: 'success', msg: 'connected' }])
      serverSends(ws, [{ T: 'error', code: 499 }])

      expect((await connecting) as MarketDataError).toMatchObject({
        code: 'unknown',
        message: 'Alpaca WebSocket error'
      })
    })

    it('ignores a socket error raised after connect has already resolved', async () => {
      const { ws } = await connected()

      expect(() => ws.emit('error', new Error('late failure'))).not.toThrow()
    })

    // An rxjs Subject is permanently stopped once it errors. A symbol-limit rejection must
    // not therefore end streaming for the life of the process: reconnecting has to work.
    it('recovers streaming after a stream error ends the previous subscription', async () => {
      const { provider, ws } = await connected()
      let errored: unknown = null
      provider.stream('stockQuotes', ['AAPL']).subscribe({
        next: () => {},
        error: (err) => {
          errored = err
        }
      })

      serverSends(ws, [{ T: 'error', code: 405, msg: 'symbol limit exceeded' }])
      expect(errored).toMatchObject({ code: 'symbol_limit' })

      await provider.disconnect()
      const reconnecting = provider.connect()
      const ws2 = mockWsInstances[1]
      serverSends(ws2, [{ T: 'success', msg: 'connected' }])
      serverSends(ws2, [{ T: 'success', msg: 'authenticated' }])
      await reconnecting

      const received: unknown[] = []
      let reErrored: unknown = null
      provider.stream('stockQuotes', ['AAPL']).subscribe({
        next: (ev) => received.push(ev),
        error: (err) => {
          reErrored = err
        }
      })
      serverSends(ws2, [BAR_FRAME])

      expect(reErrored).toBeNull()
      expect(received).toHaveLength(1)
    })

    // A socket's `close` event arrives after the closing handshake, by which time
    // connect() has already installed its replacement. Only the current socket may
    // clear the provider's state.
    it('ignores a previous socket closing after its replacement is installed', async () => {
      const { provider, ws } = await connected()

      await provider.disconnect()
      const reconnecting = provider.connect()
      const ws2 = mockWsInstances[1]

      // The old socket finishes closing only now — after this.ws already points at ws2.
      ws.emit('close')

      serverSends(ws2, [{ T: 'success', msg: 'connected' }])
      serverSends(ws2, [{ T: 'success', msg: 'authenticated' }])
      await reconnecting
      ws2.send.mockClear()

      provider.stream('stockQuotes', ['AAPL'])

      expect(ws2.send.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
        { action: 'subscribe', bars: ['AAPL'] }
      ])
    })

    it('closes the socket when the handshake times out', async () => {
      vi.useFakeTimers()
      const { provider } = createProvider()
      const connecting = provider.connect().catch((e: unknown) => e)
      const ws = mockWsInstances[0]
      serverSends(ws, [{ T: 'success', msg: 'connected' }])

      await vi.advanceTimersByTimeAsync(10_000)
      await connecting

      expect(ws.close).toHaveBeenCalled()
    })

    it('closes a socket left open by a previous connect before opening another', async () => {
      const { provider, ws } = await connected()

      const reconnecting = provider.connect()
      const ws2 = mockWsInstances[1]
      serverSends(ws2, [{ T: 'success', msg: 'connected' }])
      serverSends(ws2, [{ T: 'success', msg: 'authenticated' }])
      await reconnecting

      expect(ws.close).toHaveBeenCalled()
    })

    // A replacement socket starts with no server-side subscriptions, so the provider's
    // record of them has to be discarded with the socket it belonged to.
    it('subscribes afresh on a socket that replaces one left open', async () => {
      const { provider } = await connected()
      provider.stream('stockQuotes', ['AAPL'])

      const reconnecting = provider.connect()
      const ws2 = mockWsInstances[1]
      serverSends(ws2, [{ T: 'success', msg: 'connected' }])
      serverSends(ws2, [{ T: 'success', msg: 'authenticated' }])
      await reconnecting
      ws2.send.mockClear()

      provider.stream('stockQuotes', ['AAPL'])

      expect(ws2.send.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
        { action: 'subscribe', bars: ['AAPL'] }
      ])
    })

    it('sends only an unsubscribe when the new ticker set adds nothing', async () => {
      const { provider, ws } = await connected()
      provider.stream('stockQuotes', ['AAPL', 'NVDA'])
      ws.send.mockClear()

      provider.stream('stockQuotes', ['AAPL'])

      expect(ws.send.mock.calls.map((c) => JSON.parse(String(c[0])))).toEqual([
        { action: 'unsubscribe', bars: ['NVDA'] }
      ])
    })
  })
})
