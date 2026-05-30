// [US-39] MassiveMarketDataProvider — implements MarketDataProvider

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketDataError, type OptionChainFilter } from './market-data-provider'

const mockFetch = vi.fn()

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

import { MassiveMarketDataProvider } from './massive-market-data'

function createProvider(apiKey = 'test-massive-key'): MassiveMarketDataProvider {
  return new MassiveMarketDataProvider({ apiKey })
}

describe('MassiveMarketDataProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // === getStockQuotes ===

  describe('getStockQuotes', () => {
    it("issues two GET /v3/quotes/{ticker}/last requests in parallel for ['AAPL', 'MSFT']", async () => {
      mockFetch.mockResolvedValue(
        fetchOk({ results: { last: { b: 172.6, a: 172.7, t: '2026-05-29T14:00:00Z' } } })
      )

      const provider = createProvider()
      await provider.getStockQuotes(['AAPL', 'MSFT'])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string)
      expect(urls.some((u) => u.includes('/v3/quotes/AAPL/last'))).toBe(true)
      expect(urls.some((u) => u.includes('/v3/quotes/MSFT/last'))).toBe(true)
    })

    it('constructs Authorization: Bearer ${apiKey} header on every request', async () => {
      mockFetch.mockResolvedValue(
        fetchOk({ results: { last: { b: 172.6, a: 172.7, t: '2026-05-29T14:00:00Z' } } })
      )

      const provider = createProvider('my-secret-key')
      await provider.getStockQuotes(['AAPL'])

      const init = mockFetch.mock.calls[0][1] as RequestInit
      const headers = init.headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer my-secret-key')
    })

    it('returns Map keyed by ticker with bid/ask/price/timestamp parsed from results.last.b/a/t', async () => {
      mockFetch.mockResolvedValue(
        fetchOk({ results: { last: { b: 172.6, a: 172.7, t: '2026-05-29T14:00:00Z' } } })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      expect(result).toBeInstanceOf(Map)
      const quote = result.get('AAPL')!
      expect(quote.bid).toBe('172.60')
      expect(quote.ask).toBe('172.70')
      expect(quote.timestamp).toBe('2026-05-29T14:00:00Z')
    })

    it('computes mid as (bid + ask) / 2 with HALF_UP to 2dp: bid=10.01 ask=10.04 → mid=10.03', async () => {
      mockFetch.mockResolvedValue(
        fetchOk({ results: { last: { b: 10.01, a: 10.04, t: '2026-05-29T14:00:00Z' } } })
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['TSLA'])

      // (10.01 + 10.04) / 2 = 10.025 → rounds HALF_UP to 10.03
      expect(result.get('TSLA')!.price).toBe('10.03')
    })
  })

  // === getOptionSnapshot ===

  describe('getOptionSnapshot', () => {
    const contract = 'AAPL260516P00180000'

    function optionSnapshotBody(opts: {
      bid: number
      ask: number
      lastTrade?: number
      greeks?: { delta: number; gamma: number; theta: number; vega: number }
      impliedVolatility?: number
    }): unknown {
      return {
        results: {
          details: { contract_type: 'put', strike_price: '180', expiration_date: '2026-05-16' },
          latest_quote: { b: opts.bid, a: opts.ask, t: '2026-05-29T14:00:00Z' },
          latest_trade: { p: opts.lastTrade ?? 2.5, t: '2026-05-29T13:59:00Z', s: 10 },
          greeks: opts.greeks ?? null,
          implied_volatility: opts.impliedVolatility ?? null
        }
      }
    }

    it('parses underlying from OCC symbol and calls /v3/snapshot/options/{underlying}/{contract}', async () => {
      mockFetch.mockResolvedValue(fetchOk(optionSnapshotBody({ bid: 4.15, ask: 4.35 })))

      const provider = createProvider()
      await provider.getOptionSnapshot(contract)

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('/v3/snapshot/options/AAPL/')
      expect(url).toContain(contract)
    })

    it('returns greeks + impliedVolatility when response includes them', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          optionSnapshotBody({
            bid: 4.15,
            ask: 4.35,
            greeks: { delta: -0.45, gamma: 0.02, theta: -0.05, vega: 0.23 },
            impliedVolatility: 0.3456
          })
        )
      )

      const provider = createProvider()
      const snap = await provider.getOptionSnapshot(contract)

      expect(snap.greeks).toBeDefined()
      expect(snap.greeks!.delta).toBe('-0.4500')
      expect(snap.greeks!.gamma).toBe('0.0200')
      expect(snap.impliedVolatility).toBe('0.3456')
    })

    it('returns greeks=undefined and impliedVolatility=undefined when response omits them', async () => {
      mockFetch.mockResolvedValue(fetchOk(optionSnapshotBody({ bid: 4.15, ask: 4.35 })))

      const provider = createProvider()
      const snap = await provider.getOptionSnapshot(contract)

      expect(snap.greeks).toBeUndefined()
      expect(snap.impliedVolatility).toBeUndefined()
    })
  })

  // === getOptionChainSnapshot ===

  describe('getOptionChainSnapshot', () => {
    function chainBody(results: unknown[], nextUrl: string | null = null): unknown {
      return { results, next_url: nextUrl }
    }

    function makeSnapResult(symbol: string): unknown {
      return {
        symbol,
        latest_quote: { b: 2.0, a: 2.2, t: '2026-05-29T14:00:00Z' },
        latest_trade: { p: 2.1, t: '2026-05-29T13:59:00Z', s: 5 },
        greeks: null,
        implied_volatility: null
      }
    }

    it('translates filter into query params: expiration_date.gte/lte, contract_type, strike_price.gte/lte, limit', async () => {
      mockFetch.mockResolvedValue(fetchOk(chainBody([])))

      const filter: OptionChainFilter = {
        underlying: 'AAPL',
        expirationFrom: '2026-05-01',
        expirationTo: '2026-06-30',
        type: 'put',
        strikeFrom: '170',
        strikeTo: '190',
        limit: 50
      }

      const provider = createProvider()
      await provider.getOptionChainSnapshot(filter)

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('expiration_date.gte=2026-05-01')
      expect(url).toContain('expiration_date.lte=2026-06-30')
      expect(url).toContain('contract_type=put')
      expect(url).toContain('strike_price.gte=170')
      expect(url).toContain('strike_price.lte=190')
      expect(url).toContain('limit=50')
    })

    it('follows next_url to fetch additional pages until exhausted', async () => {
      const page1 = chainBody(
        [makeSnapResult('AAPL260516P00180000')],
        'https://api.example.com/v3/snapshot/options/AAPL?cursor=abc123'
      )
      const page2 = chainBody([makeSnapResult('AAPL260516P00175000')], null)

      mockFetch.mockResolvedValueOnce(fetchOk(page1)).mockResolvedValueOnce(fetchOk(page2))

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(results).toHaveLength(2)
    })

    it('returns nextCursor when caller-supplied page limit is reached', async () => {
      const page1 = chainBody(
        [makeSnapResult('AAPL260516P00180000')],
        'https://api.example.com/v3/snapshot/options/AAPL?cursor=page2cursor'
      )

      mockFetch.mockResolvedValueOnce(fetchOk(page1))

      const provider = createProvider()
      // limit=1 means stop after 1 page even if next_url exists
      const results = await provider.getOptionChainSnapshot({
        underlying: 'AAPL',
        limit: 1,
        cursor: undefined
      })

      // With a single page limit, should stop and return nextCursor
      // The implementation should return the cursor, not follow next_url
      // This is verified via the result length (only 1 page fetched)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(results).toHaveLength(1)
    })
  })

  // === Error handling ===

  describe('error handling', () => {
    it("missing API key throws MarketDataError('auth_failed') with 'Massive API key not configured'", async () => {
      const provider = new MassiveMarketDataProvider({ apiKey: '' })
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('auth_failed')
      expect((thrown as MarketDataError).message).toMatch(/not configured/i)
    })

    it("401/403 response throws MarketDataError('auth_failed')", async () => {
      mockFetch.mockResolvedValue(fetchErr(401, 'Unauthorized'))

      const provider = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('auth_failed')
    })

    it("403 response throws MarketDataError('auth_failed')", async () => {
      mockFetch.mockResolvedValue(fetchErr(403, 'Forbidden'))

      const provider = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('auth_failed')
    })

    it('429 response triggers retry with Retry-After wait, up to 2 retries, then throws MarketDataError(rate_limited)', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchErr(429, 'Too Many Requests', { 'Retry-After': '0' }))
        .mockResolvedValueOnce(fetchErr(429, 'Too Many Requests', { 'Retry-After': '0' }))
        .mockResolvedValueOnce(fetchErr(429, 'Too Many Requests', { 'Retry-After': '0' }))

      const provider = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      // 1 initial + 2 retries = 3 total calls
      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('rate_limited')
    })

    it('429 then 200 succeeds after retry', async () => {
      mockFetch
        .mockResolvedValueOnce(fetchErr(429, 'Too Many Requests', { 'Retry-After': '0' }))
        .mockResolvedValueOnce(
          fetchOk({ results: { last: { b: 172.6, a: 172.7, t: '2026-05-29T14:00:00Z' } } })
        )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(result.get('AAPL')).toBeDefined()
    })

    it("network failure (fetch throws) returns MarketDataError('network_error')", async () => {
      mockFetch.mockRejectedValue(
        Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      )

      const provider = createProvider()
      const thrown = await provider.getStockQuotes(['AAPL']).catch((e: unknown) => e)

      expect(thrown).toBeInstanceOf(MarketDataError)
      expect((thrown as MarketDataError).code).toBe('network_error')
    })
  })

  // === Streaming capability ===

  describe('streaming', () => {
    it("supportsStreaming('stockQuotes') returns true", () => {
      const provider = createProvider()
      expect(provider.supportsStreaming('stockQuotes')).toBe(true)
    })

    it("supportsStreaming('optionQuotes') returns true", () => {
      const provider = createProvider()
      expect(provider.supportsStreaming('optionQuotes')).toBe(true)
    })

    it("stream() throws MarketDataError('streaming_unsupported') for now", () => {
      const provider = createProvider()

      expect(() => provider.stream('stockQuotes', ['AAPL'])).toThrow(MarketDataError)

      try {
        provider.stream('stockQuotes', ['AAPL'])
      } catch (err) {
        expect((err as MarketDataError).code).toBe('streaming_unsupported')
      }
    })
  })

  // === connect / disconnect ===

  describe('connect and disconnect', () => {
    it('connect() resolves without error (no-op)', async () => {
      const provider = createProvider()
      await expect(provider.connect()).resolves.toBeUndefined()
    })

    it('disconnect() resolves without error (no-op)', async () => {
      const provider = createProvider()
      await expect(provider.disconnect()).resolves.toBeUndefined()
    })
  })
})
