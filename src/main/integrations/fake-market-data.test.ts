import Decimal from 'decimal.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { blackScholesPrice } from '../core/black-scholes'
import {
  FakeMarketDataProvider,
  dailyBarRequestCount,
  dailyBarRequests,
  fakeStockTickSubject,
  marketCalendarFetchCount,
  setFakeIvSeries
} from './fake-market-data'
import {
  MarketDataError,
  type MarketCalendarDay,
  type MarketStatus,
  type OptionChainQuote,
  type OptionSnapshot,
  type StockQuote
} from './market-data-provider'

describe('FakeMarketDataProvider — interface shape', () => {
  // [US-116] Account methods stay on the broker fake; market facts move here.
  it('exposes the market facts and none of the account methods', () => {
    const provider = new FakeMarketDataProvider()

    expect(typeof provider.getMarketStatus).toBe('function')
    expect(typeof provider.getMarketCalendar).toBe('function')
    expect((provider as unknown as Record<string, unknown>)['getAccountInfo']).toBeUndefined()
    expect((provider as unknown as Record<string, unknown>)['getActivities']).toBeUndefined()
  })
})

// [US-116] The e2e seams for market status and the exchange calendar, moved off the fake
// broker so FAKE_BROKER_ERROR can no longer break a market fact.
describe('FakeMarketDataProvider.getMarketStatus', () => {
  afterEach(() => {
    delete process.env.FAKE_MARKET_STATUS
    delete process.env.FAKE_MARKET_DATA_ERROR
  })

  it('returns the MarketStatus named by FAKE_MARKET_STATUS when set', async () => {
    const status: MarketStatus = {
      isOpen: true,
      nextOpen: '2026-05-30T13:30:00Z',
      nextClose: '2026-05-29T20:00:00Z',
      session: 'regular'
    }
    process.env.FAKE_MARKET_STATUS = JSON.stringify(status)

    const result = await new FakeMarketDataProvider().getMarketStatus()

    expect(result).toEqual(status)
  })

  it('returns a default MarketStatus when FAKE_MARKET_STATUS is unset', async () => {
    const result = await new FakeMarketDataProvider().getMarketStatus()

    expect(result).toMatchObject({
      isOpen: expect.any(Boolean),
      nextOpen: expect.any(String),
      nextClose: expect.any(String),
      session: expect.stringMatching(/^(regular|pre|post|closed)$/)
    })
  })

  it('throws the MarketDataError named by FAKE_MARKET_DATA_ERROR', async () => {
    process.env.FAKE_MARKET_DATA_ERROR = 'auth_failed'

    await expect(new FakeMarketDataProvider().getMarketStatus()).rejects.toMatchObject({
      code: 'auth_failed'
    })
  })
})

describe('FakeMarketDataProvider.getMarketCalendar', () => {
  afterEach(() => {
    delete process.env.FAKE_MARKET_CALENDAR
    delete process.env.FAKE_MARKET_DATA_ERROR
    delete process.env.FAKE_MARKET_CALENDAR_ERROR
  })

  it('generates every weekday in the range at 16:00 when FAKE_MARKET_CALENDAR is unset', async () => {
    // 2026-09-07 is a Monday; 2026-09-12 a Saturday, 2026-09-13 a Sunday.
    const result = await new FakeMarketDataProvider().getMarketCalendar({
      start: '2026-09-07',
      end: '2026-09-13'
    })

    expect(result.map((d) => d.date)).toEqual([
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11'
    ])
    expect(result.every((d) => d.close === '16:00')).toBe(true)
  })

  it('returns only fixture days inside the requested range when FAKE_MARKET_CALENDAR is set', async () => {
    const fixture: MarketCalendarDay[] = [
      { date: '2026-09-04', close: '16:00' },
      { date: '2026-09-08', close: '13:00' },
      { date: '2026-09-30', close: '16:00' }
    ]
    process.env.FAKE_MARKET_CALENDAR = JSON.stringify(fixture)

    const result = await new FakeMarketDataProvider().getMarketCalendar({
      start: '2026-09-07',
      end: '2026-09-11'
    })

    expect(result).toEqual([{ date: '2026-09-08', close: '13:00' }])
  })

  it('throws the MarketDataError named by FAKE_MARKET_DATA_ERROR', async () => {
    process.env.FAKE_MARKET_DATA_ERROR = 'network_error'

    await expect(
      new FakeMarketDataProvider().getMarketCalendar({ start: '2026-09-07', end: '2026-09-11' })
    ).rejects.toMatchObject({ code: 'network_error' })
  })

  // [US-116] "The calendar is not refetched on every render" is only observable from a
  // spec if the fake counts its fetches: the throttle lives in the store, and the bench
  // gives no other outward sign of having skipped one.
  it('counts calendar fetches so the refresh throttle is observable', async () => {
    const provider = new FakeMarketDataProvider()
    const before = marketCalendarFetchCount()

    await provider.getMarketCalendar({ start: '2026-09-07', end: '2026-09-11' })
    await provider.getMarketCalendar({ start: '2026-09-07', end: '2026-09-11' })

    // A delta, because the count is process-wide and the e2e seam reads it the same way.
    expect(marketCalendarFetchCount() - before).toBe(2)
  })

  // [US-116] AC 5 and AC 6 need the calendar to fail while quotes and chains serve
  // normally. FAKE_MARKET_DATA_ERROR is global to the fake, so the calendar gets its own
  // seam rather than a spec racing a global toggle across one concurrent call.
  it('throws only the calendar call when FAKE_MARKET_CALENDAR_ERROR is set', async () => {
    process.env.FAKE_MARKET_CALENDAR_ERROR = 'network_error'
    const provider = new FakeMarketDataProvider()

    await expect(
      provider.getMarketCalendar({ start: '2026-09-07', end: '2026-09-11' })
    ).rejects.toMatchObject({ code: 'network_error' })
    await expect(provider.getStockQuotes(['AAPL'])).resolves.toBeInstanceOf(Map)
    await expect(provider.getMarketStatus()).resolves.toMatchObject({ session: 'regular' })
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

// [US-121] Bars synthesised from a programmed IV series — the offline seam for IV history.
describe('FakeMarketDataProvider daily bars', () => {
  const WEEKLY_CALL = 'AAPL260410C00200500' // Fri 2026-04-10 — not the third Friday
  const WEEKLY_PUT = 'AAPL260410P00200500'
  const MONTHLY_CALL = 'AAPL260417C00200500' // Fri 2026-04-17 — third Friday
  // Juneteenth 2026 falls on the third Friday, so the June monthly expires Thursday 06-18.
  const HOLIDAY_MONTHLY_CALL = 'AAPL260618C00200500'
  const SESSION = '2026-03-12'

  const bsVwap = (type: 'call' | 'put', expiryDays: number, iv: number): string =>
    new Decimal(
      blackScholesPrice({
        type,
        spot: 200.4,
        strike: 200.5,
        yearsToExpiry: expiryDays / 365,
        rate: 0.045,
        dividendYield: 0,
        volatility: iv
      })
    ).toFixed(4)

  beforeEach(() => {
    setFakeIvSeries({})
  })

  afterEach(() => {
    delete process.env.WHEELBASE_FAKE_IV_SERIES
    delete process.env.FAKE_MARKET_DATA_ERROR
    vi.useRealTimers()
  })

  it('prices one bar per symbol at the session IV with the default trade count', async () => {
    setFakeIvSeries({ AAPL: { price: 200.4, sessions: { [SESSION]: 0.2475 } } })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL, WEEKLY_PUT],
      start: SESSION
    })

    // 2026-03-12 → 2026-04-10 is 29 calendar days.
    expect(result.get(WEEKLY_CALL)).toEqual([
      {
        date: SESSION,
        vwap: bsVwap('call', 29, 0.2475),
        close: bsVwap('call', 29, 0.2475),
        volume: 100,
        tradeCount: 100
      }
    ])
    expect(result.get(WEEKLY_PUT)?.[0].vwap).toBe(bsVwap('put', 29, 0.2475))
    expect(result.get(WEEKLY_PUT)?.[0].tradeCount).toBe(100)
  })

  it('reads the fixture from WHEELBASE_FAKE_IV_SERIES at construction', async () => {
    process.env.WHEELBASE_FAKE_IV_SERIES = JSON.stringify({
      AAPL: { price: 200.4, sessions: { [SESSION]: 0.2475 } }
    })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL],
      start: SESSION
    })

    expect(result.get(WEEKLY_CALL)).toHaveLength(1)
  })

  it('serves only fixture sessions within [start, end]', async () => {
    setFakeIvSeries({
      AAPL: {
        price: 200.4,
        sessions: { '2026-03-10': 0.2, '2026-03-11': 0.21, [SESSION]: 0.2475 }
      }
    })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL],
      start: '2026-03-11',
      end: '2026-03-11'
    })

    expect(result.get(WEEKLY_CALL)?.map((bar) => bar.date)).toEqual(['2026-03-11'])
  })

  it('returns no bar for a session absent from the fixture', async () => {
    setFakeIvSeries({ AAPL: { price: 200.4, sessions: { [SESSION]: 0.2475 } } })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL],
      start: '2026-03-13'
    })

    expect(result.has(WEEKLY_CALL)).toBe(false)
  })

  it('omits a symbol whose ticker is not in the fixture', async () => {
    setFakeIvSeries({ AAPL: { price: 200.4, sessions: { [SESSION]: 0.2475 } } })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: ['MSFT260410C00400000', WEEKLY_CALL],
      start: SESSION
    })

    expect(result.has('MSFT260410C00400000')).toBe(false)
    expect(result.has(WEEKLY_CALL)).toBe(true)
  })

  it('serves no bar for a session on or after expiration', async () => {
    setFakeIvSeries({ AAPL: { price: 200.4, sessions: { '2026-04-10': 0.2475 } } })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL],
      start: '2026-04-10'
    })

    expect(result.has(WEEKLY_CALL)).toBe(false)
  })

  it('gives an untraded leg no bar while its sibling still trades', async () => {
    setFakeIvSeries({
      AAPL: {
        price: 200.4,
        sessions: { [SESSION]: { iv: 0.2475, untraded: [{ strike: 200.5, type: 'call' }] } }
      }
    })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL, WEEKLY_PUT],
      start: SESSION
    })

    expect(result.has(WEEKLY_CALL)).toBe(false)
    expect(result.has(WEEKLY_PUT)).toBe(true)
  })

  it('weeklyTradeCount 0 leaves only third-Friday expirations (including holiday-shifted)', async () => {
    setFakeIvSeries({
      AAPL: { price: 200.4, sessions: { [SESSION]: { iv: 0.2475, weeklyTradeCount: 0 } } }
    })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL, MONTHLY_CALL, HOLIDAY_MONTHLY_CALL],
      start: SESSION
    })

    expect(result.has(WEEKLY_CALL)).toBe(false)
    expect(result.get(MONTHLY_CALL)?.[0].tradeCount).toBe(100)
    expect(result.get(HOLIDAY_MONTHLY_CALL)?.[0].tradeCount).toBe(100)
  })

  it('applies a series-level weeklyTradeCount to weeklies only', async () => {
    setFakeIvSeries({
      AAPL: { price: 200.4, tradeCount: 40, weeklyTradeCount: 3, sessions: { [SESSION]: 0.25 } }
    })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL, MONTHLY_CALL],
      start: SESSION
    })

    expect(result.get(WEEKLY_CALL)?.[0].tradeCount).toBe(3)
    expect(result.get(MONTHLY_CALL)?.[0].tradeCount).toBe(40)
  })

  it('tradeCount 0 yields nothing for that session', async () => {
    setFakeIvSeries({
      AAPL: {
        price: 200.4,
        sessions: { '2026-03-11': 0.25, [SESSION]: { iv: 0.2475, tradeCount: 0 } }
      }
    })

    const result = await new FakeMarketDataProvider().getOptionDailyBars({
      symbols: [WEEKLY_CALL, MONTHLY_CALL],
      start: '2026-03-11'
    })

    expect(result.get(WEEKLY_CALL)?.map((bar) => bar.date)).toEqual(['2026-03-11'])
    expect(result.get(MONTHLY_CALL)?.map((bar) => bar.date)).toEqual(['2026-03-11'])
  })

  it('records each request and counts them', async () => {
    setFakeIvSeries({ AAPL: { price: 200.4, sessions: { [SESSION]: 0.2475 } } })
    const provider = new FakeMarketDataProvider()

    await provider.getOptionDailyBars({ symbols: [WEEKLY_CALL], start: SESSION })
    await provider.getStockDailyBars({ symbol: 'AAPL', start: '2026-03-01', end: SESSION })

    expect(dailyBarRequests()).toEqual([
      { kind: 'option', underlying: 'AAPL', start: SESSION, end: null },
      { kind: 'stock', underlying: 'AAPL', start: '2026-03-01', end: SESSION }
    ])
    expect(dailyBarRequestCount()).toBe(2)
  })

  it('setFakeIvSeries resets the request log', async () => {
    setFakeIvSeries({ AAPL: { price: 200.4, sessions: { [SESSION]: 0.2475 } } })
    await new FakeMarketDataProvider().getStockDailyBars({ symbol: 'AAPL', start: SESSION })

    setFakeIvSeries({})

    expect(dailyBarRequests()).toEqual([])
    expect(dailyBarRequestCount()).toBe(0)
  })

  it('failWith throws a MarketDataError for that ticker only', async () => {
    setFakeIvSeries({
      AAPL: { price: 200.4, failWith: 'network_error', sessions: { [SESSION]: 0.2475 } },
      MSFT: { price: 400, sessions: { [SESSION]: 0.3 } }
    })
    const provider = new FakeMarketDataProvider()

    const thrown = await provider
      .getOptionDailyBars({ symbols: [WEEKLY_CALL], start: SESSION })
      .catch((e: unknown) => e)
    const msft = await provider.getOptionDailyBars({
      symbols: ['MSFT260410C00400000'],
      start: SESSION
    })

    expect(thrown).toBeInstanceOf(MarketDataError)
    expect((thrown as MarketDataError).code).toBe('network_error')
    expect(msft.has('MSFT260410C00400000')).toBe(true)
  })

  it('latencyMs delays the response', async () => {
    vi.useFakeTimers()
    setFakeIvSeries({ AAPL: { price: 200.4, latencyMs: 50, sessions: { [SESSION]: 0.2475 } } })
    let settled = false

    const pending = new FakeMarketDataProvider()
      .getOptionDailyBars({ symbols: [WEEKLY_CALL], start: SESSION })
      .then((result) => {
        settled = true
        return result
      })
    await vi.advanceTimersByTimeAsync(49)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(settled).toBe(true)
    expect((await pending).has(WEEKLY_CALL)).toBe(true)
  })

  it('FAKE_MARKET_DATA_ERROR fails both bar methods', async () => {
    process.env.FAKE_MARKET_DATA_ERROR = 'auth_failed'
    const provider = new FakeMarketDataProvider()

    await expect(
      provider.getOptionDailyBars({ symbols: [WEEKLY_CALL], start: SESSION })
    ).rejects.toMatchObject({ code: 'auth_failed' })
    await expect(
      provider.getStockDailyBars({ symbol: 'AAPL', start: SESSION })
    ).rejects.toMatchObject({ code: 'auth_failed' })
  })

  it('getStockDailyBars returns one bar per fixture session at the series price', async () => {
    setFakeIvSeries({
      AAPL: { price: 200.4, sessions: { [SESSION]: 0.2475, '2026-03-11': 0.25 } }
    })

    const bars = await new FakeMarketDataProvider().getStockDailyBars({
      symbol: 'AAPL',
      start: '2026-03-01'
    })

    expect(bars).toEqual([
      {
        date: '2026-03-11',
        vwap: '200.4000',
        close: '200.4000',
        volume: 1_000_000,
        tradeCount: 10_000
      },
      { date: SESSION, vwap: '200.4000', close: '200.4000', volume: 1_000_000, tradeCount: 10_000 }
    ])
  })

  it('getStockDailyBars returns [] for an unfixtured ticker', async () => {
    expect(
      await new FakeMarketDataProvider().getStockDailyBars({ symbol: 'ZZZ', start: SESSION })
    ).toEqual([])
  })
})
