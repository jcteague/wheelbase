import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FakeMarketDataProvider, fakeStockTickSubject } from './fake-market-data'
import {
  MarketDataError,
  type OptionChainQuote,
  type OptionSnapshot,
  type StockQuote
} from './market-data-provider'

describe('FakeMarketDataProvider — interface shape', () => {
  it('no longer exposes broker methods (getAccountInfo, getActivities, getMarketStatus)', () => {
    const provider = new FakeMarketDataProvider()
    // These broker methods must not exist on the slimmed MarketDataProvider
    expect((provider as unknown as Record<string, unknown>)['getAccountInfo']).toBeUndefined()
    expect((provider as unknown as Record<string, unknown>)['getActivities']).toBeUndefined()
    expect((provider as unknown as Record<string, unknown>)['getMarketStatus']).toBeUndefined()
  })
})

const SNAPSHOT: OptionSnapshot = {
  bid: '2.10',
  ask: '2.20',
  mid: '2.15',
  lastTrade: '2.18',
  openInterest: 1234,
  volume: 567,
  greeks: {
    delta: '-0.32',
    gamma: '0.04',
    theta: '-0.05',
    vega: '0.12'
  },
  impliedVolatility: '0.28',
  timestamp: '2026-04-29T15:30:00Z'
}

describe('FakeMarketDataProvider.getOptionSnapshot', () => {
  let originalEnv: string | undefined

  beforeEach(() => {
    originalEnv = process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    } else {
      process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = originalEnv
    }
  })

  it('returns snapshot from WHEELBASE_MOCK_OPTION_SNAPSHOTS env var', async () => {
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({
      AAPL260516P00180000: SNAPSHOT
    })

    const provider = new FakeMarketDataProvider()
    const result = await provider.getOptionSnapshot('AAPL260516P00180000')

    expect(result).toEqual(SNAPSHOT)
  })

  it('throws MarketDataError when symbol is not in env var', async () => {
    delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS

    const provider = new FakeMarketDataProvider()
    await expect(provider.getOptionSnapshot('AAPL260516P00180000')).rejects.toMatchObject({
      code: 'unknown'
    })
  })
})

describe('FakeMarketDataProvider.getOptionChainSnapshot (US-64)', () => {
  let originalEnv: string | undefined

  function chainQuote(
    overrides: Partial<OptionChainQuote> & Pick<OptionChainQuote, 'contractId'>
  ): OptionChainQuote {
    return {
      bid: '2.10',
      ask: '2.20',
      mid: '2.15',
      lastTrade: '2.18',
      openInterest: 1234,
      volume: 567,
      timestamp: '2026-07-26T15:30:00Z',
      strike: '190.00',
      expiration: '2026-09-05',
      contractType: 'put',
      ...overrides
    }
  }

  const AAPL_PUT = chainQuote({ contractId: 'AAPL260905P00190000' })
  const MSFT_PUT = chainQuote({
    contractId: 'MSFT260905P00400000',
    strike: '400.00'
  })
  const AAPL_CALL = chainQuote({
    contractId: 'AAPL260905C00200000',
    strike: '200.00',
    contractType: 'call'
  })
  const AAPL_PUT_OUT_OF_WINDOW = chainQuote({
    contractId: 'AAPL261218P00190000',
    expiration: '2026-12-18'
  })

  beforeEach(() => {
    originalEnv = process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({
      [AAPL_PUT.contractId]: AAPL_PUT,
      [MSFT_PUT.contractId]: MSFT_PUT,
      [AAPL_CALL.contractId]: AAPL_CALL,
      [AAPL_PUT_OUT_OF_WINDOW.contractId]: AAPL_PUT_OUT_OF_WINDOW
    })
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    } else {
      process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = originalEnv
    }
  })

  it('returns only AAPL puts within the expiration window, each an OptionChainQuote', async () => {
    const provider = new FakeMarketDataProvider()

    const result = await provider.getOptionChainSnapshot({
      underlying: 'AAPL',
      type: 'put',
      expirationFrom: '2026-08-22',
      expirationTo: '2026-09-06'
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(AAPL_PUT)
    // Carries per-strike identity (OptionChainQuote, not a bare OptionSnapshot).
    expect(result[0].contractId).toBe('AAPL260905P00190000')
    expect(result[0].contractType).toBe('put')
    expect(result[0].strike).toBe('190.00')
    expect(result[0].expiration).toBe('2026-09-05')
  })

  it('excludes calls, other underlyings, and out-of-window expirations', async () => {
    const provider = new FakeMarketDataProvider()

    const result = await provider.getOptionChainSnapshot({
      underlying: 'AAPL',
      type: 'put',
      expirationFrom: '2026-08-22',
      expirationTo: '2026-09-06'
    })

    const ids = result.map((q) => q.contractId)
    expect(ids).not.toContain('AAPL260905C00200000') // call
    expect(ids).not.toContain('MSFT260905P00400000') // other underlying
    expect(ids).not.toContain('AAPL261218P00190000') // out of window
  })

  it('returns [] when no mock snapshots are configured', async () => {
    delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    const provider = new FakeMarketDataProvider()

    const result = await provider.getOptionChainSnapshot({ underlying: 'AAPL', type: 'put' })

    expect(result).toEqual([])
  })

  // Pre-US-64 fixtures (and every existing e2e spec) seed this env var with bare
  // OptionSnapshot values keyed by OCC symbol. The chain filter must derive the
  // identity fields from the key rather than assume the fixture carries them.
  it('derives identity from the OCC key for bare OptionSnapshot fixtures', async () => {
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({
      AAPL260620P00180000: SNAPSHOT,
      AAPL260620C00185000: SNAPSHOT,
      MSFT260620P00400000: SNAPSHOT
    })
    const provider = new FakeMarketDataProvider()

    const result = await provider.getOptionChainSnapshot({
      underlying: 'AAPL',
      type: 'put',
      expirationFrom: '2026-06-01',
      expirationTo: '2026-07-31'
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      contractId: 'AAPL260620P00180000',
      strike: '180.0000',
      expiration: '2026-06-20',
      contractType: 'put',
      bid: SNAPSHOT.bid
    })
  })

  it('skips fixture keys that are not parseable OCC symbols', async () => {
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({ 'not-an-occ-symbol': SNAPSHOT })
    const provider = new FakeMarketDataProvider()

    const result = await provider.getOptionChainSnapshot({ underlying: 'AAPL', type: 'put' })

    expect(result).toEqual([])
  })
})

describe('FakeMarketDataProvider — stock quotes, forced errors and streaming', () => {
  const STOCK_QUOTE: StockQuote = {
    price: '182.45',
    bid: '182.44',
    ask: '182.46',
    change: '1.45',
    changePercent: '0.0080',
    prevClose: '181.00',
    volume: 1000,
    timestamp: '2026-04-28T10:00:00Z'
  }

  afterEach(() => {
    delete process.env.WHEELBASE_MOCK_STOCK_QUOTES
    delete process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS
    delete process.env.FAKE_MARKET_DATA_ERROR
  })

  it('getStockQuotes returns only the requested tickers from WHEELBASE_MOCK_STOCK_QUOTES', async () => {
    process.env.WHEELBASE_MOCK_STOCK_QUOTES = JSON.stringify({
      AAPL: STOCK_QUOTE,
      MSFT: STOCK_QUOTE
    })

    const result = await new FakeMarketDataProvider().getStockQuotes(['AAPL', 'TSLA'])

    expect([...result.keys()]).toEqual(['AAPL'])
    expect(result.get('AAPL')).toEqual(STOCK_QUOTE)
  })

  it('getStockQuotes returns an empty map when no fixtures are configured', async () => {
    const result = await new FakeMarketDataProvider().getStockQuotes(['AAPL'])

    expect(result.size).toBe(0)
  })

  it('every REST call throws the MarketDataError named by FAKE_MARKET_DATA_ERROR', async () => {
    process.env.FAKE_MARKET_DATA_ERROR = 'auth_failed'
    const provider = new FakeMarketDataProvider()

    await expect(provider.getStockQuotes(['AAPL'])).rejects.toMatchObject({ code: 'auth_failed' })
    await expect(provider.getOptionSnapshot('AAPL260516P00180000')).rejects.toMatchObject({
      code: 'auth_failed'
    })
    await expect(provider.getOptionChainSnapshot({ underlying: 'AAPL' })).rejects.toMatchObject({
      code: 'auth_failed'
    })
  })

  it('getOptionChainSnapshot drops contracts expiring before expirationFrom', async () => {
    process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = JSON.stringify({ AAPL260905P00190000: SNAPSHOT })

    const result = await new FakeMarketDataProvider().getOptionChainSnapshot({
      underlying: 'AAPL',
      expirationFrom: '2026-09-10'
    })

    expect(result).toEqual([])
  })

  it('supports streaming only for the stockQuotes feed', () => {
    const provider = new FakeMarketDataProvider()

    expect(provider.supportsStreaming('stockQuotes')).toBe(true)
    expect(provider.supportsStreaming('optionQuotes')).toBe(false)
  })

  it('stream() rejects non-stock feeds with streaming_unsupported', () => {
    let caught: unknown
    try {
      new FakeMarketDataProvider().stream('optionQuotes', ['AAPL'])
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(MarketDataError)
    expect((caught as MarketDataError).code).toBe('streaming_unsupported')
  })

  it('stream() forwards only ticks for the subscribed symbols', () => {
    const received: string[] = []
    const subscription = new FakeMarketDataProvider()
      .stream('stockQuotes', ['AAPL'])
      .subscribe((event) => received.push(event.symbol))

    fakeStockTickSubject.next({
      feed: 'stockQuotes',
      symbol: 'MSFT',
      data: STOCK_QUOTE,
      timestamp: '2026-04-28T10:00:01Z'
    })
    fakeStockTickSubject.next({
      feed: 'stockQuotes',
      symbol: 'AAPL',
      data: STOCK_QUOTE,
      timestamp: '2026-04-28T10:00:02Z'
    })
    subscription.unsubscribe()

    expect(received).toEqual(['AAPL'])
  })
})
