// [US-64] candidate-chains service — pullWatchlistChains orchestration + failure isolation
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import {
  MarketDataError,
  type OptionChainFilter,
  type OptionChainQuote,
  type MarketDataProvider
} from '../integrations/market-data-provider'
import { logger } from '../logger'
import { makeTestDb } from '../test-utils'
import { addWatchlistEntry } from './watchlist'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function seedWatchlist(db: Database.Database, tickers: string[]): void {
  for (const ticker of tickers) {
    addWatchlistEntry(db, { ticker, postEarningsOnly: false, coreHolding: false })
  }
}

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

const CURRENT_DATE = new Date('2026-07-23') // default 30–45 window → 2026-08-22 .. 2026-09-06

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
