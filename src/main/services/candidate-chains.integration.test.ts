// [US-64] AC integration — real pullWatchlistChains against an in-memory watchlist
// (migration 012) driven by a scripted MarketDataProvider. One it() per acceptance
// criterion; names mirror the Gherkin scenarios. The US-110 contract-type block runs
// through FakeMarketDataProvider instead, so the window and type filters are real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeMarketDataProvider } from '../integrations/fake-market-data'
import {
  MarketDataError,
  type OptionChainFilter,
  type OptionChainQuote,
  type MarketDataProvider
} from '../integrations/market-data-provider'
import { logger } from '../logger'
import { makeTestDb, seedWatchlist } from '../test-utils'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// The screener refreshes "today" = 2026-07-23; default 30–45 DTE window resolves to
// expirations in [2026-08-22, 2026-09-06]. 2026-09-05 sits inside that window.
const CURRENT_DATE = new Date(2026, 6, 23)

function putQuote(overrides: Partial<OptionChainQuote> = {}): OptionChainQuote {
  return {
    contractId: 'AAPL260905P00190000',
    strike: '190.00',
    expiration: '2026-09-05',
    contractType: 'put',
    bid: '2.11',
    ask: '2.16',
    mid: '2.14', // (2.11 + 2.16) / 2 = 2.135 -> HALF_UP 2dp -> 2.14
    lastTrade: '2.15',
    openInterest: 4211,
    volume: 875,
    greeks: { delta: '-0.3200', gamma: '0.0400', theta: '-0.0500', vega: '0.1200' },
    impliedVolatility: '0.2800',
    timestamp: '2026-07-23T15:30:00Z',
    ...overrides
  }
}

/** Scripts the chain response per underlying so each AC scenario is self-contained. */
function scriptProvider(
  script: (filter: OptionChainFilter) => Promise<OptionChainQuote[]> | OptionChainQuote[]
): MarketDataProvider {
  return {
    getOptionChainSnapshot: vi.fn(async (filter: OptionChainFilter) => script(filter))
  } as unknown as MarketDataProvider
}

function byTicker(tickers: TickerChainResult[], ticker: string): TickerChainResult {
  const found = tickers.find((t) => t.ticker === ticker)
  if (!found) throw new Error(`no result for ${ticker}`)
  return found
}

describe('US-64 pullWatchlistChains — acceptance criteria', () => {
  it('pulls put chains for each watchlist ticker', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT'])
    const provider = scriptProvider((filter) => [
      putQuote({ contractId: `${filter.underlying}260905P00190000` })
    ])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    for (const ticker of ['AAPL', 'MSFT']) {
      const entry = byTicker(result.tickers, ticker)
      expect(entry.status).toBe('ok')
      if (entry.status !== 'ok') continue
      const [strike] = entry.strikes
      // Each in-window strike carries bid, ask, mark, delta, open interest, volume.
      expect(strike.bid).toBe('2.11')
      expect(strike.ask).toBe('2.16')
      expect(strike.mark).toBe('2.14') // (bid + ask) / 2 HALF_UP 2dp
      expect(strike.delta).toBe('-0.3200')
      expect(strike.openInterest).toBe(4211)
      expect(strike.volume).toBe(875)
      // And each strike carries the quote timestamp from the provider.
      expect(strike.timestamp).toBe('2026-07-23T15:30:00Z')
    }
  })

  it('a single ticker failing does not suppress the others', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT', 'XYZ'])
    const provider = scriptProvider((filter) => {
      if (filter.underlying === 'XYZ') throw new MarketDataError('not_found', 'HTTP 404')
      return [putQuote({ contractId: `${filter.underlying}260905P00190000` })]
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(byTicker(result.tickers, 'AAPL').status).toBe('ok')
    expect(byTicker(result.tickers, 'MSFT').status).toBe('ok')
    expect(byTicker(result.tickers, 'XYZ')).toEqual({ ticker: 'XYZ', status: 'data_unavailable' })
    // The engine logs the XYZ failure at debug level.
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'XYZ' }),
      expect.any(String)
    )
  })

  it('whole-provider outage is distinguished from zero results', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT', 'XYZ'])
    const provider = scriptProvider(() => {
      throw new MarketDataError('network_error', 'market data unreachable')
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    // Reports "market data unavailable", NOT an empty-but-ok "no candidates" shape.
    expect(result.status).toBe('provider_unavailable')
    expect(result.tickers.every((t) => t.status === 'data_unavailable')).toBe(true)
    expect(result).not.toEqual({ status: 'ok', tickers: [] })
  })

  it('a ticker with no listed options is skipped, not failed', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['XYZ'])
    const provider = scriptProvider(() => [])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    // XYZ marked "no options listed" and remains present (still on the watchlist).
    expect(byTicker(result.tickers, 'XYZ')).toEqual({ ticker: 'XYZ', status: 'no_options_listed' })
  })

  it('zero-bid and one-sided strikes are dropped', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    const provider = scriptProvider(() => [
      putQuote({ contractId: 'AAPL260905P00190000', bid: '2.11', ask: '2.16' }),
      putQuote({ contractId: 'AAPL260905P00185000', bid: '0.00', ask: '0.15' })
    ])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    const aapl = byTicker(result.tickers, 'AAPL')
    expect(aapl.status).toBe('ok')
    if (aapl.status === 'ok') {
      const ids = aapl.strikes.map((s) => s.contractId)
      expect(ids).toContain('AAPL260905P00190000')
      expect(ids).not.toContain('AAPL260905P00185000') // no reliable mark
    }
  })
})

// [US-110] The PMCC screener pulls call chains over two DTE windows (LEAPS 180–540,
// short call 20–45). From CURRENT_DATE 2026-07-23: 180–540 → [2027-01-19, 2028-01-14];
// 20–45 → [2026-08-12, 2026-09-06].
describe('US-110 pullWatchlistChains — contract type', () => {
  const SHORT_CALL_35_DTE = 'AAPL260827C00210000' // 2026-08-27 = today + 35
  const LEAPS_CALL_490_DTE = 'AAPL271125C00180000' // 2027-11-25 = today + 490
  const LEAPS_PUT_490_DTE = 'AAPL271125P00180000'

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function stubChainFixture(quotes: OptionChainQuote[]): void {
    vi.stubEnv(
      'WHEELBASE_MOCK_OPTION_SNAPSHOTS',
      JSON.stringify(Object.fromEntries(quotes.map((q) => [q.contractId, q])))
    )
  }

  it('requests the given contract type over the window’s expiration range', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    stubChainFixture([])
    const provider = new FakeMarketDataProvider()
    const chainSpy = vi.spyOn(provider, 'getOptionChainSnapshot')

    await pullWatchlistChains(provider, db, {
      type: 'call',
      window: { min: 180, max: 540 },
      currentDate: CURRENT_DATE
    })

    expect(chainSpy).toHaveBeenCalledExactlyOnceWith({
      underlying: 'AAPL',
      expirationFrom: '2027-01-19',
      expirationTo: '2028-01-14',
      type: 'call'
    })
  })

  it('requests puts when no contract type is given', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    stubChainFixture([])
    const provider = new FakeMarketDataProvider()
    const chainSpy = vi.spyOn(provider, 'getOptionChainSnapshot')

    await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(chainSpy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'put' }))
  })

  it('a 35-DTE and a 490-DTE call each come back only from their own window', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    stubChainFixture([
      putQuote({
        contractId: SHORT_CALL_35_DTE,
        contractType: 'call',
        strike: '210.00',
        expiration: '2026-08-27'
      }),
      putQuote({
        contractId: LEAPS_CALL_490_DTE,
        contractType: 'call',
        strike: '180.00',
        expiration: '2027-11-25'
      }),
      // A put in the LEAPS window proves the call pull filters by type, not just by date.
      putQuote({ contractId: LEAPS_PUT_490_DTE, strike: '180.00', expiration: '2027-11-25' })
    ])
    const provider = new FakeMarketDataProvider()

    const long = await pullWatchlistChains(provider, db, {
      type: 'call',
      window: { min: 180, max: 540 },
      currentDate: CURRENT_DATE
    })
    const short = await pullWatchlistChains(provider, db, {
      type: 'call',
      window: { min: 20, max: 45 },
      currentDate: CURRENT_DATE
    })

    expect(byTicker(long.tickers, 'AAPL')).toEqual({
      ticker: 'AAPL',
      status: 'ok',
      strikes: [expect.objectContaining({ contractId: LEAPS_CALL_490_DTE, strike: '180.00' })]
    })
    expect(byTicker(short.tickers, 'AAPL')).toEqual({
      ticker: 'AAPL',
      status: 'ok',
      strikes: [expect.objectContaining({ contractId: SHORT_CALL_35_DTE, strike: '210.00' })]
    })
  })
})
