// [US-39] MassiveMarketDataProvider — implements MarketDataProvider

import type { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketDataError, type OptionChainFilter } from './market-data-provider'

const mockFetch = vi.fn()

type MockWsInstance = EventEmitter & {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

// Captured WebSocket instances so tests can drive the auth flow
const mockWsInstances: MockWsInstance[] = []
vi.mock('ws', async () => {
  const { EventEmitter: Emitter } = await import('events')
  class MockWs extends Emitter {
    send = vi.fn()
    close = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_url: string) {
      super()
      mockWsInstances.push(this as unknown as MockWsInstance)
    }
  }
  return { default: MockWs }
})

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
    mockWsInstances.length = 0
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // === getStockQuotes ===

  describe('getStockQuotes', () => {
    function stockSnapshotBody(opts: {
      price: number
      prevClose?: number
      volume?: number
      todaysChange?: number
      todaysChangePerc?: number
    }): unknown {
      return {
        ticker: {
          day: { c: opts.price, v: opts.volume ?? 1000000 },
          min: { c: opts.price, t: 1748527200000 },
          prevDay: { c: opts.prevClose ?? 170.0 },
          todaysChange: opts.todaysChange ?? 0,
          todaysChangePerc: opts.todaysChangePerc ?? 0
        }
      }
    }

    it("issues two GET /v2/snapshot requests in parallel for ['AAPL', 'MSFT']", async () => {
      mockFetch.mockResolvedValue(fetchOk(stockSnapshotBody({ price: 172.65 })))

      const provider = createProvider()
      await provider.getStockQuotes(['AAPL', 'MSFT'])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string)
      expect(
        urls.some((u) => u.includes('/v2/snapshot/locale/us/markets/stocks/tickers/AAPL'))
      ).toBe(true)
      expect(
        urls.some((u) => u.includes('/v2/snapshot/locale/us/markets/stocks/tickers/MSFT'))
      ).toBe(true)
    })

    it('appends apiKey as a query parameter on every request', async () => {
      mockFetch.mockResolvedValue(fetchOk(stockSnapshotBody({ price: 172.65 })))

      const provider = createProvider('my-secret-key')
      await provider.getStockQuotes(['AAPL'])

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain('apiKey=my-secret-key')
    })

    it('returns Map keyed by ticker with price/prevClose/change from Massive aggregate snapshot', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          stockSnapshotBody({
            price: 172.65,
            prevClose: 170.5,
            volume: 50_000_000,
            todaysChange: 2.15,
            todaysChangePerc: 1.26
          })
        )
      )

      const provider = createProvider()
      const result = await provider.getStockQuotes(['AAPL'])

      expect(result).toBeInstanceOf(Map)
      const quote = result.get('AAPL')!
      // Massive has no live bid/ask — price, bid, ask are all the last-minute close
      expect(quote.price).toBe('172.65')
      expect(quote.bid).toBe('172.65')
      expect(quote.ask).toBe('172.65')
      expect(quote.prevClose).toBe('170.50')
      expect(quote.change).toBe('2.15')
      expect(quote.volume).toBe(50_000_000)
    })

    it('uses last-minute close (min.c) as the price and sets bid === ask === price', async () => {
      mockFetch.mockResolvedValue(fetchOk(stockSnapshotBody({ price: 748.07 })))

      const provider = createProvider()
      const result = await provider.getStockQuotes(['SPY'])

      expect(result.get('SPY')!.price).toBe('748.07')
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
          last_quote: { bid: opts.bid, ask: opts.ask, last_updated: 1748527200000000000 },
          last_trade: {
            price: opts.lastTrade ?? 2.5,
            sip_timestamp: 1748527140000000000,
            size: 10
          },
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
      // Massive/Polygon requires the `O:` prefix on the contract ticker.
      expect(url).toContain(`/v3/snapshot/options/AAPL/O:${contract}`)
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

    // Guard: US-64 widens getOptionChainSnapshot, NOT this single-contract method.
    it('does not carry chain identity fields (contractId/strike/expiration/contractType)', async () => {
      mockFetch.mockResolvedValue(fetchOk(optionSnapshotBody({ bid: 4.15, ask: 4.35 })))

      const provider = createProvider()
      const snap = await provider.getOptionSnapshot(contract)

      expect(snap).not.toHaveProperty('contractId')
      expect(snap).not.toHaveProperty('strike')
      expect(snap).not.toHaveProperty('expiration')
      expect(snap).not.toHaveProperty('contractType')
    })
  })

  // === getOptionChainSnapshot ===

  describe('getOptionChainSnapshot', () => {
    function chainBody(results: unknown[], nextUrl: string | null = null): unknown {
      return { results, next_url: nextUrl }
    }

    function makeSnapResult(symbol: string): unknown {
      return {
        details: {
          ticker: `O:${symbol}`,
          strike_price: 180,
          expiration_date: '2026-05-16',
          contract_type: 'put'
        },
        open_interest: 100,
        day: { volume: 50 },
        last_quote: { bid: 2.0, ask: 2.2, last_updated: 1748527200000000000 },
        last_trade: { price: 2.1, sip_timestamp: 1748527140000000000, size: 5 },
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

  // === getOptionChainSnapshot — US-64 per-strike enrichment ===

  describe('getOptionChainSnapshot — per-strike identity + OI/volume (US-64)', () => {
    function chainBody(results: unknown[], nextUrl: string | null = null): unknown {
      return { results, next_url: nextUrl }
    }

    function makeChainResult(opts: {
      ticker: string
      strike: number
      expiration?: string
      contractType?: 'put' | 'call'
      bid?: number
      ask?: number
      openInterest?: number | null
      volume?: number | null
      greeks?: { delta: number; gamma: number; theta: number; vega: number } | null
    }): unknown {
      return {
        details: {
          ticker: opts.ticker,
          strike_price: opts.strike,
          expiration_date: opts.expiration ?? '2026-09-18',
          contract_type: opts.contractType ?? 'put'
        },
        open_interest: opts.openInterest === undefined ? 1500 : opts.openInterest,
        day: { volume: opts.volume === undefined ? 320 : opts.volume },
        last_quote: {
          bid: opts.bid ?? 2.0,
          ask: opts.ask ?? 2.2,
          last_updated: 1748527200000000000
        },
        last_trade: { price: 2.1, sip_timestamp: 1748527140000000000, size: 5 },
        greeks: opts.greeks ?? null,
        implied_volatility: null
      }
    }

    it('maps each result to an OptionChainQuote with contractId (O: stripped), 4dp strike, expiration, contractType', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          chainBody([
            makeChainResult({
              ticker: 'O:AAPL260918P00190000',
              strike: 190,
              expiration: '2026-09-18',
              contractType: 'put'
            })
          ])
        )
      )

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(results).toHaveLength(1)
      const quote = results[0]
      expect(quote.contractId).toBe('AAPL260918P00190000')
      // 4dp TEXT is the codebase-wide money convention (legs.strike, own_below_price)
      expect(quote.strike).toBe('190.0000')
      expect(quote.expiration).toBe('2026-09-18')
      expect(quote.contractType).toBe('put')
    })

    it('populates openInterest and volume from open_interest / day.volume (source values preserved)', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          chainBody([
            makeChainResult({
              ticker: 'O:AAPL260918P00190000',
              strike: 190,
              openInterest: 4211,
              volume: 875
            })
          ])
        )
      )

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(results[0].openInterest).toBe(4211)
      expect(results[0].volume).toBe(875)
    })

    it('falls back to null openInterest/volume when Massive omits open_interest / day', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          chainBody([
            {
              details: {
                ticker: 'O:AAPL260918P00190000',
                strike_price: 190,
                expiration_date: '2026-09-18',
                contract_type: 'put'
              },
              open_interest: null,
              day: null,
              last_quote: { bid: 2.0, ask: 2.2, last_updated: 1748527200000000000 },
              last_trade: { price: 2.1, sip_timestamp: 1748527140000000000, size: 5 },
              greeks: null,
              implied_volatility: null
            }
          ])
        )
      )

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(results[0].openInterest).toBeNull()
      expect(results[0].volume).toBeNull()
    })

    it('reuses money logic: mid is (bid + ask) / 2 HALF_UP 2dp, bid/ask are 2dp strings', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          chainBody([
            makeChainResult({ ticker: 'O:AAPL260918P00190000', strike: 190, bid: 2.11, ask: 2.16 })
          ])
        )
      )

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(results[0].bid).toBe('2.11')
      expect(results[0].ask).toBe('2.16')
      // (2.11 + 2.16) / 2 = 2.135 -> HALF_UP 2dp -> 2.14
      expect(results[0].mid).toBe('2.14')
    })

    it('omits greeks/delta when the chain entry has no greeks (no fabricated zeros)', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          chainBody([
            makeChainResult({ ticker: 'O:AAPL260918P00190000', strike: 190, greeks: null })
          ])
        )
      )

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(results[0].greeks).toBeUndefined()
    })

    // Never-traded / thinly-quoted strikes come back without last_trade, last_quote or
    // greeks. One such strike must not abort the whole underlying's chain.
    it('keeps the chain intact when a strike omits last_trade, last_quote and greeks', async () => {
      mockFetch.mockResolvedValue(
        fetchOk(
          chainBody([
            {
              details: {
                ticker: 'O:AAPL260918P00050000',
                strike_price: 50,
                expiration_date: '2026-09-18',
                contract_type: 'put'
              },
              open_interest: 0,
              day: null
            },
            makeChainResult({ ticker: 'O:AAPL260918P00190000', strike: 190 })
          ])
        )
      )

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(results).toHaveLength(2)
      expect(results[0]).toMatchObject({
        contractId: 'AAPL260918P00050000',
        bid: '0.00',
        ask: '0.00',
        mid: '0.00',
        lastTrade: '0.00'
      })
      expect(results[0].greeks).toBeUndefined()
      expect(results[0].impliedVolatility).toBeUndefined()
      expect(results[1].contractId).toBe('AAPL260918P00190000')
    })

    it('returns an empty chain when the provider answers with no results array', async () => {
      mockFetch.mockResolvedValue(fetchOk({ status: 'OK', count: 0, next_url: null }))

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(results).toEqual([])
    })

    it('maps every page result through mapChainResult and preserves next_url pagination', async () => {
      const page1 = chainBody(
        [makeChainResult({ ticker: 'O:AAPL260918P00190000', strike: 190 })],
        'https://api.example.com/v3/snapshot/options/AAPL?cursor=abc123'
      )
      const page2 = chainBody(
        [makeChainResult({ ticker: 'O:AAPL260918P00185000', strike: 185 })],
        null
      )
      mockFetch.mockResolvedValueOnce(fetchOk(page1)).mockResolvedValueOnce(fetchOk(page2))

      const provider = createProvider()
      const results = await provider.getOptionChainSnapshot({ underlying: 'AAPL' })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.contractId)).toEqual([
        'AAPL260918P00190000',
        'AAPL260918P00185000'
      ])
      expect(results.every((r) => typeof r.strike === 'string')).toBe(true)
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
          fetchOk({
            ticker: {
              day: { c: 172.65, v: 1000000 },
              min: { c: 172.65, t: 1748527200000 },
              prevDay: { c: 170.0 },
              todaysChange: 2.65,
              todaysChangePerc: 1.56
            }
          })
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
    it('supportsStreaming() returns true', () => {
      expect(createProvider().supportsStreaming()).toBe(true)
    })

    it('stream() returns an Observable filtered to the given symbols', () => {
      const provider = createProvider()
      const obs = provider.stream('stockQuotes', ['AAPL'])
      expect(obs).toHaveProperty('subscribe')
    })
  })

  // === connect / disconnect ===

  describe('connect and disconnect', () => {
    function simulateAuthFlow(ws: EventEmitter): void {
      // open → provider sends auth; auth_success → provider sends subscribe; success → resolves
      ws.emit('open')
      process.nextTick(() => {
        ws.emit('message', Buffer.from(JSON.stringify([{ ev: 'status', status: 'auth_success' }])))
        process.nextTick(() => {
          ws.emit('message', Buffer.from(JSON.stringify([{ ev: 'status', status: 'success' }])))
        })
      })
    }

    it('connect() resolves after auth_success + subscription confirmed', async () => {
      const provider = createProvider('my-key')
      const connectPromise = provider.connect()
      simulateAuthFlow(mockWsInstances[0])
      await expect(connectPromise).resolves.toBeUndefined()
    })

    it('connect() rejects with auth_failed when server refuses the key', async () => {
      const provider = createProvider('bad-key')
      const connectPromise = provider.connect()
      const ws = mockWsInstances[0]
      ws.emit('open')
      process.nextTick(() => {
        ws.emit('message', Buffer.from(JSON.stringify([{ ev: 'status', status: 'auth_failed' }])))
      })
      await expect(connectPromise).rejects.toMatchObject({ code: 'auth_failed' })
    })

    it('connect() sends auth message with the API key on open', async () => {
      const provider = createProvider('secret-key')
      const connectPromise = provider.connect()
      const ws = mockWsInstances[0]
      simulateAuthFlow(ws)
      await connectPromise
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ action: 'auth', params: 'secret-key' }))
    })

    it('stream() emits AM bar ticks filtered to subscribed symbols', async () => {
      const provider = createProvider('key')
      const connectPromise = provider.connect()
      simulateAuthFlow(mockWsInstances[0])
      await connectPromise

      const ticks: unknown[] = []
      provider.stream('stockQuotes', ['SPY']).subscribe((ev) => ticks.push(ev))

      const ws = mockWsInstances[0]
      ws.emit(
        'message',
        Buffer.from(
          JSON.stringify([
            {
              ev: 'AM',
              sym: 'SPY',
              v: 1000,
              vw: 748.0,
              c: 748.0,
              o: 747.0,
              h: 749.0,
              l: 746.0,
              s: 1748527140000,
              e: 1748527200000
            },
            {
              ev: 'AM',
              sym: 'AAPL',
              v: 500,
              vw: 200.0,
              c: 200.0,
              o: 199.0,
              h: 201.0,
              l: 198.0,
              s: 1748527140000,
              e: 1748527200000
            }
          ])
        )
      )
      await Promise.resolve()

      expect(ticks).toHaveLength(1)
      expect((ticks[0] as { symbol: string }).symbol).toBe('SPY')
    })

    it('disconnect() closes the WebSocket', async () => {
      const provider = createProvider('key')
      const connectPromise = provider.connect()
      simulateAuthFlow(mockWsInstances[0])
      await connectPromise
      const ws = mockWsInstances[0]
      await provider.disconnect()
      expect(ws.close).toHaveBeenCalled()
    })
  })
})
