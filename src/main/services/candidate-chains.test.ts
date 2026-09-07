// [US-64] candidate-chains service — pullWatchlistChains orchestration + failure isolation
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MarketDataError,
  type OptionChainFilter,
  type OptionChainQuote,
  type MarketDataProvider
} from '../integrations/market-data-provider'
import { logger } from '../logger'
import { makeTestDb, seedWatchlist } from '../test-utils'
import {
  CHAIN_FETCH_CONCURRENCY,
  pullWatchlistChains,
  type TickerChainResult
} from './candidate-chains'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function putQuote(overrides: Partial<OptionChainQuote> = {}): OptionChainQuote {
  return {
    contractId: 'AAPL260905P00190000',
    strike: '190.00',
    expiration: '2026-09-05',
    contractType: 'put',
    bid: '2.10',
    ask: '2.20',
    mid: '2.15',
    lastTrade: '2.18',
    openInterest: 1234,
    volume: 567,
    greeks: { delta: '-0.32', gamma: '0.04', theta: '-0.05', vega: '0.12' },
    impliedVolatility: '0.28',
    timestamp: '2026-07-26T15:30:00Z',
    ...overrides
  }
}

/** Provider whose chain response is scripted per underlying ticker. */
function makeProvider(
  perTicker: (filter: OptionChainFilter) => Promise<OptionChainQuote[]> | OptionChainQuote[]
): { provider: MarketDataProvider; getOptionChainSnapshot: ReturnType<typeof vi.fn> } {
  const getOptionChainSnapshot = vi.fn(async (filter: OptionChainFilter) => perTicker(filter))
  return {
    provider: { getOptionChainSnapshot } as unknown as MarketDataProvider,
    getOptionChainSnapshot
  }
}

function byTicker(results: TickerChainResult[], ticker: string): TickerChainResult {
  const found = results.find((r) => r.ticker === ticker)
  if (!found) throw new Error(`no result for ${ticker}`)
  return found
}

const CURRENT_DATE = new Date(2026, 6, 23) // default 30–45 window → 2026-08-22 .. 2026-09-06

describe('pullWatchlistChains', () => {
  it('returns ok with no tickers and never calls the provider for an empty watchlist', async () => {
    const db = makeTestDb()
    const { provider, getOptionChainSnapshot } = makeProvider(() => [])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result).toEqual({ status: 'ok', tickers: [] })
    expect(getOptionChainSnapshot).not.toHaveBeenCalled()
  })

  it('produces ok results with filtered strikes and calls the provider with the DTE-derived put filter', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT'])
    const { provider, getOptionChainSnapshot } = makeProvider((filter) => [
      putQuote({ contractId: `${filter.underlying}260905P00190000` })
    ])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    expect(byTicker(result.tickers, 'AAPL')).toMatchObject({ status: 'ok' })
    expect(byTicker(result.tickers, 'MSFT')).toMatchObject({ status: 'ok' })
    const aapl = byTicker(result.tickers, 'AAPL')
    expect(aapl.status === 'ok' && aapl.strikes.length).toBe(1)

    expect(getOptionChainSnapshot).toHaveBeenCalledWith({
      underlying: 'AAPL',
      expirationFrom: '2026-08-22',
      expirationTo: '2026-09-06',
      type: 'put'
    })
  })

  it('isolates a single ticker not_found failure (others ok, overall ok, logged at debug)', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT', 'XYZ'])
    const { provider } = makeProvider((filter) => {
      if (filter.underlying === 'XYZ') throw new MarketDataError('not_found', 'HTTP 404')
      return [putQuote({ contractId: `${filter.underlying}260905P00190000` })]
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    expect(byTicker(result.tickers, 'AAPL')).toMatchObject({ status: 'ok' })
    expect(byTicker(result.tickers, 'MSFT')).toMatchObject({ status: 'ok' })
    expect(byTicker(result.tickers, 'XYZ')).toEqual({ ticker: 'XYZ', status: 'data_unavailable' })
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'XYZ' }),
      expect.any(String)
    )
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('reports provider_unavailable when every ticker fails with a provider-level error (logged at warn)', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT'])
    const { provider } = makeProvider(() => {
      throw new MarketDataError('network_error', 'unreachable')
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('provider_unavailable')
    expect(byTicker(result.tickers, 'AAPL')).toEqual({ ticker: 'AAPL', status: 'data_unavailable' })
    expect(byTicker(result.tickers, 'MSFT')).toEqual({ ticker: 'MSFT', status: 'data_unavailable' })
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL' }),
      expect.any(String)
    )
  })

  // [US-99] With no Alpaca credentials saved, every chain pull raises auth_failed. That has
  // to roll up to the screener's outage card rather than an empty result set.
  it('reports provider_unavailable when every ticker fails with auth_failed', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT'])
    const { provider } = makeProvider(() => {
      throw new MarketDataError('auth_failed', 'Alpaca credentials not configured')
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('provider_unavailable')
    expect(result.tickers.every((t) => t.status === 'data_unavailable')).toBe(true)
  })

  it('reports provider_unavailable even when one ticker fails at ticker level (delisted 404)', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT', 'XYZ'])
    const { provider } = makeProvider((filter) => {
      // XYZ is delisted; the rest are down because the provider is down.
      if (filter.underlying === 'XYZ') throw new MarketDataError('not_found', 'HTTP 404')
      throw new MarketDataError('network_error', 'unreachable')
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('provider_unavailable')
  })

  it('stays overall ok when a ticker answers with an empty chain (provider proven reachable)', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'MSFT', 'XYZ'])
    const { provider } = makeProvider((filter) => {
      if (filter.underlying === 'XYZ') return []
      throw new MarketDataError('network_error', 'unreachable')
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    expect(byTicker(result.tickers, 'XYZ')).toEqual({ ticker: 'XYZ', status: 'no_options_listed' })
  })

  it('stays overall ok when every ticker returns not_found (provider reachable)', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'XYZ'])
    const { provider } = makeProvider(() => {
      throw new MarketDataError('not_found', 'HTTP 404')
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    expect(byTicker(result.tickers, 'AAPL')).toMatchObject({ status: 'data_unavailable' })
    expect(byTicker(result.tickers, 'XYZ')).toMatchObject({ status: 'data_unavailable' })
  })

  it('marks a ticker with an empty chain as no_options_listed and keeps it in the result', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['XYZ'])
    const { provider } = makeProvider(() => [])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    expect(byTicker(result.tickers, 'XYZ')).toEqual({ ticker: 'XYZ', status: 'no_options_listed' })
  })

  it('marks a ticker whose quotes are all untradeable as no_options_listed, never ok-with-no-strikes', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['XYZ'])
    // Two quotes, both one-sided — toCandidateStrikes filters every one of them.
    const { provider } = makeProvider(() => [
      putQuote({ contractId: 'A', bid: '0.00', ask: '0.15' }),
      putQuote({ contractId: 'B', bid: '1.00', ask: '0.00' })
    ])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    expect(byTicker(result.tickers, 'XYZ')).toEqual({ ticker: 'XYZ', status: 'no_options_listed' })
  })

  it('isolates a non-MarketDataError throw as data_unavailable (logged at error, batch continues)', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'BOOM'])
    const { provider } = makeProvider((filter) => {
      if (filter.underlying === 'BOOM') throw new TypeError('unexpected boom')
      return [putQuote({ contractId: `${filter.underlying}260905P00190000` })]
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.status).toBe('ok')
    expect(byTicker(result.tickers, 'AAPL')).toMatchObject({ status: 'ok' })
    expect(byTicker(result.tickers, 'BOOM')).toEqual({ ticker: 'BOOM', status: 'data_unavailable' })
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'BOOM' }),
      expect.any(String)
    )
  })

  it('honors window and currentDate overrides from opts (default window is 30–45)', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    const { provider, getOptionChainSnapshot } = makeProvider(() => [putQuote()])

    await pullWatchlistChains(provider, db, {
      currentDate: CURRENT_DATE,
      window: { min: 10, max: 20 }
    })

    expect(getOptionChainSnapshot).toHaveBeenCalledWith({
      underlying: 'AAPL',
      expirationFrom: '2026-08-02',
      expirationTo: '2026-08-12',
      type: 'put'
    })
  })

  it('caps in-flight chain requests so a large watchlist cannot self-inflict rate limiting', async () => {
    const db = makeTestDb()
    const tickers = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META', 'GOOG', 'AMZN', 'NFLX', 'INTC']
    seedWatchlist(db, tickers)
    let inFlight = 0
    let peakInFlight = 0
    const { provider } = makeProvider(async () => {
      inFlight += 1
      peakInFlight = Math.max(peakInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight -= 1
      return [putQuote()]
    })

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(result.tickers).toHaveLength(tickers.length)
    expect(peakInFlight).toBeLessThanOrEqual(CHAIN_FETCH_CONCURRENCY)
    expect(peakInFlight).toBeGreaterThan(1) // still concurrent, just bounded
  })

  it('logs an INFO summary of the completed batch', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'XYZ'])
    const { provider } = makeProvider((filter) => {
      if (filter.underlying === 'XYZ') throw new MarketDataError('not_found', 'HTTP 404')
      return [putQuote()]
    })

    await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        tickerCount: 2,
        okCount: 1,
        unavailableCount: 1
      }),
      expect.any(String)
    )
  })

  it('drops zero-bid / one-sided strikes from ok results', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL'])
    const { provider } = makeProvider(() => [
      putQuote({ contractId: 'AAPL260905P00190000', bid: '2.10', ask: '2.20' }),
      putQuote({ contractId: 'AAPL260905P00185000', bid: '0.00', ask: '0.15' })
    ])

    const result = await pullWatchlistChains(provider, db, { currentDate: CURRENT_DATE })

    const aapl = byTicker(result.tickers, 'AAPL')
    expect(aapl.status).toBe('ok')
    if (aapl.status === 'ok') {
      expect(aapl.strikes.map((s) => s.contractId)).toEqual(['AAPL260905P00190000'])
    }
  })
})
