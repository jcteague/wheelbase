// [US-65] screener service — orchestration across the chain pull, the IVR join, the
// optional quote fetch and the pure engine, with every boundary isolated.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarketDataProvider, StockQuote } from '../integrations/market-data-provider'
import type { CandidateStrike } from '../core/candidate-chain'
import { DEFAULT_SCREENING_CRITERIA, type ScreeningCriteria } from '../core/screener'
import { logger } from '../logger'
import { makeTestDb, seedIvr } from '../test-utils'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'
import { getLatestIvrByUnderlying } from './ivr-snapshots'
import { screenWatchlistCandidates } from './screener'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('./candidate-chains', () => ({ pullWatchlistChains: vi.fn() }))

// The read path stays real so a seeded DB drives the join; individual tests swap in
// a throwing implementation to exercise the degrade-to-empty path.
vi.mock('./ivr-snapshots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ivr-snapshots')>()
  return { ...actual, getLatestIvrByUnderlying: vi.fn(actual.getLatestIvrByUnderlying) }
})

beforeEach(() => {
  vi.clearAllMocks()
})

// 2026-07-23; the strikes below expire 2026-08-29, i.e. 37 DTE.
const CURRENT_DATE = new Date(2026, 6, 23)
const EXPIRATION = '2026-08-29'
const TIMESTAMP = '2026-07-23T15:30:00Z'

/** A strike that survives every default filter unless an override breaks it. */
function strike(overrides: Partial<CandidateStrike> = {}): CandidateStrike {
  return {
    contractId: 'AAPL260829P00180000',
    strike: '180.0000',
    expiration: EXPIRATION,
    bid: '2.65',
    ask: '2.75',
    mark: '2.70',
    delta: '-0.2800',
    openInterest: 1500,
    volume: 800,
    timestamp: TIMESTAMP,
    ...overrides
  }
}

/** AAPL: yieldPerDelta 0.5285 (mark 2.70 / strike 180, 37 DTE, 0.28 delta). */
const AAPL_OK: TickerChainResult = { ticker: 'AAPL', status: 'ok', strikes: [strike()] }

/** KO: yieldPerDelta 0.7892 — ranks above AAPL. */
const KO_OK: TickerChainResult = {
  ticker: 'KO',
  status: 'ok',
  strikes: [
    strike({
      contractId: 'KO260829P00060000',
      strike: '60.0000',
      bid: '1.18',
      ask: '1.22',
      mark: '1.20',
      delta: '-0.2500'
    })
  ]
}

function mockChains(result: {
  status: 'ok' | 'provider_unavailable'
  tickers: TickerChainResult[]
}): void {
  vi.mocked(pullWatchlistChains).mockResolvedValue(result)
}

function stockQuote(price: string): StockQuote {
  return {
    price,
    bid: price,
    ask: price,
    change: '0.00',
    changePercent: '0.00',
    prevClose: price,
    volume: 1_000_000,
    timestamp: TIMESTAMP
  }
}

function makeProvider(
  quotes: (tickers: string[]) => Map<string, StockQuote> | Promise<Map<string, StockQuote>> = () =>
    new Map()
): { provider: MarketDataProvider; getStockQuotes: ReturnType<typeof vi.fn> } {
  const getStockQuotes = vi.fn(async (tickers: string[]) => quotes(tickers))
  return { provider: { getStockQuotes } as unknown as MarketDataProvider, getStockQuotes }
}

function criteriaWith(overrides: Partial<ScreeningCriteria>): ScreeningCriteria {
  return { ...DEFAULT_SCREENING_CRITERIA, ...overrides }
}

describe('screenWatchlistCandidates', () => {
  it('pulls chains with the DTE window derived from the criteria and the supplied currentDate', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [] })

    await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ dteMin: 20, dteMax: 40 }),
      currentDate: CURRENT_DATE
    })

    expect(pullWatchlistChains).toHaveBeenCalledWith(provider, db, {
      window: { min: 20, max: 40 },
      currentDate: CURRENT_DATE
    })
  })

  it('falls back to the default criteria when none are supplied', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [] })

    await screenWatchlistCandidates(() => provider, db, { currentDate: CURRENT_DATE })

    expect(pullWatchlistChains).toHaveBeenCalledWith(provider, db, {
      window: { min: DEFAULT_SCREENING_CRITERIA.dteMin, max: DEFAULT_SCREENING_CRITERIA.dteMax },
      currentDate: CURRENT_DATE
    })
  })

  it('short-circuits a provider outage without touching the IVR read or the quote fetch', async () => {
    const db = makeTestDb()
    const { provider, getStockQuotes } = makeProvider()
    mockChains({
      status: 'provider_unavailable',
      tickers: [{ ticker: 'AAPL', status: 'data_unavailable' }]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ maxUnderlyingPrice: '500' }),
      currentDate: CURRENT_DATE
    })

    expect(result).toEqual({
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })
    expect(getStockQuotes).not.toHaveBeenCalled()
    expect(getLatestIvrByUnderlying).not.toHaveBeenCalled()
  })

  it('ranks one row per ticker in yield-per-delta order', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.status).toBe('ok')
    expect(result.ranked.map((c) => c.ticker)).toEqual(['KO', 'AAPL'])
    expect(result.ranked.map((c) => c.yieldPerDelta)).toEqual(['0.7892', '0.5285'])
    expect(result.excluded).toEqual([])
  })

  it('joins the latest IVR reading onto each ranked candidate', async () => {
    const db = makeTestDb()
    seedIvr(db, [
      ['AAPL', '2026-07-20T12:00:00Z', '31.5'],
      ['AAPL', '2026-07-23T12:00:00Z', '44.0']
    ])
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [AAPL_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(getLatestIvrByUnderlying).toHaveBeenCalledWith(db, ['AAPL'])
    expect(result.ranked[0].ivRank).toEqual({ value: '44.0', observedAt: '2026-07-23T12:00:00Z' })
  })

  it('still ranks a ticker with no IVR snapshot, carrying a null IV rank', async () => {
    const db = makeTestDb()
    seedIvr(db, [['AAPL', '2026-07-23T12:00:00Z', '44.0']])
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked.map((c) => c.ticker)).toEqual(['KO', 'AAPL'])
    expect(result.ranked[0].ivRank).toBeNull()
    expect(result.ranked[0].yieldPerDelta).toBe('0.7892')
  })

  it('degrades a failing IVR read to an empty map, warns, and still ranks every candidate', async () => {
    const db = makeTestDb()
    seedIvr(db, [['AAPL', '2026-07-23T12:00:00Z', '44.0']])
    vi.mocked(getLatestIvrByUnderlying).mockImplementationOnce(() => {
      throw new Error('ivr_snapshot read failed')
    })
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked.map((c) => c.ticker)).toEqual(['KO', 'AAPL'])
    expect(result.ranked.every((c) => c.ivRank === null)).toBe(true)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('skips the quote fetch entirely when the price ceiling is disabled', async () => {
    const db = makeTestDb()
    const { provider, getStockQuotes } = makeProvider()
    mockChains({ status: 'ok', tickers: [AAPL_OK] })

    await screenWatchlistCandidates(() => provider, db, { currentDate: CURRENT_DATE })

    expect(DEFAULT_SCREENING_CRITERIA.maxUnderlyingPrice).toBeNull()
    expect(getStockQuotes).not.toHaveBeenCalled()
  })

  it('fetches underlying quotes and excludes a ticker above the price ceiling', async () => {
    const db = makeTestDb()
    const { provider, getStockQuotes } = makeProvider(
      () => new Map([['AAPL', stockQuote('412.00')]])
    )
    mockChains({ status: 'ok', tickers: [AAPL_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ maxUnderlyingPrice: '75' }),
      currentDate: CURRENT_DATE
    })

    expect(getStockQuotes).toHaveBeenCalledWith(['AAPL'])
    expect(result.ranked).toEqual([])
    expect(result.excluded).toEqual([
      {
        ticker: 'AAPL',
        code: 'price_ceiling',
        reason: 'underlying $412.00 above $75.00 ceiling'
      }
    ])
  })

  it('degrades a failing quote fetch to an empty map, warns, and does not fire the ceiling', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider(() => {
      throw new Error('quotes unavailable')
    })
    mockChains({ status: 'ok', tickers: [AAPL_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ maxUnderlyingPrice: '75' }),
      currentDate: CURRENT_DATE
    })

    expect(result.ranked.map((c) => c.ticker)).toEqual(['AAPL'])
    expect(result.excluded).toEqual([])
    expect(logger.warn).toHaveBeenCalled()
  })

  it('maps a ticker with no listed options into the excluded list', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [{ ticker: 'XYZ', status: 'no_options_listed' }] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    // The chain query is DTE-window-bounded, so the reason must say the window came
    // up empty — not that the ticker lists no options at all.
    expect(result.excluded).toEqual([
      { ticker: 'XYZ', code: 'no_options_listed', reason: 'no puts quoted in the 30–45 DTE window' }
    ])
  })

  it('words the no-options reason with the criteria DTE window actually screened', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [{ ticker: 'XYZ', status: 'no_options_listed' }] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ dteMin: 20, dteMax: 40 }),
      currentDate: CURRENT_DATE
    })

    expect(result.excluded[0].reason).toBe('no puts quoted in the 20–40 DTE window')
  })

  it('maps a ticker whose data could not be fetched into the excluded list', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [{ ticker: 'XYZ', status: 'data_unavailable' }] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.excluded).toEqual([
      { ticker: 'XYZ', code: 'data_unavailable', reason: 'market data unavailable' }
    ])
  })

  it('contributes one excluded row carrying the representative reason when a ticker has no survivor', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({
      status: 'ok',
      tickers: [
        {
          ticker: 'AMD',
          status: 'ok',
          strikes: [
            strike({ contractId: 'AMD260829P00150000', delta: '-0.4200' }),
            strike({ contractId: 'AMD260829P00140000', delta: '-0.5000' })
          ]
        }
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.ranked).toEqual([])
    expect(result.excluded).toEqual([
      { ticker: 'AMD', code: 'delta_band', reason: 'delta 0.42 outside 0.20–0.30' }
    ])
  })

  it('keeps the excluded list in watchlist order', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({
      status: 'ok',
      tickers: [
        { ticker: 'XYZ', status: 'no_options_listed' },
        AAPL_OK,
        { ticker: 'ZZZ', status: 'data_unavailable' }
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.excluded.map((e) => e.ticker)).toEqual(['XYZ', 'ZZZ'])
  })

  it('drops only the malformed strike, logging at warn, and still screens the ticker’s other strikes', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({
      status: 'ok',
      tickers: [
        {
          ticker: 'AAPL',
          status: 'ok',
          strikes: [
            // A non-numeric quote field would blow up the engine's Decimal math —
            // it must cost this strike, not the ticker's qualifying candidate.
            strike({ contractId: 'AAPL260829P00185000', bid: 'not-a-number' }),
            strike()
          ]
        }
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.status).toBe('ok')
    expect(result.ranked.map((c) => c.contractId)).toEqual(['AAPL260829P00180000'])
    expect(result.excluded).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL', contractId: 'AAPL260829P00185000' }),
      'screener_malformed_strike_dropped'
    )
  })

  it('marks a ticker unavailable — never dropping it from both lists — when every strike is malformed', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({
      status: 'ok',
      tickers: [
        {
          ticker: 'BOOM',
          status: 'ok',
          strikes: [strike({ contractId: 'BOOM260829P00180000', bid: 'not-a-number' })]
        },
        AAPL_OK
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.status).toBe('ok')
    expect(result.ranked.map((c) => c.ticker)).toEqual(['AAPL'])
    expect(result.excluded).toEqual([
      { ticker: 'BOOM', code: 'data_unavailable', reason: 'market data unavailable' }
    ])
  })

  it('reports provider_unavailable when the provider cannot be constructed (no API key yet)', async () => {
    const db = makeTestDb()

    const result = await screenWatchlistCandidates(
      () => {
        throw new Error('Market data provider not configured')
      },
      db,
      { currentDate: CURRENT_DATE }
    )

    expect(result).toEqual({
      status: 'provider_unavailable',
      ranked: [],
      excluded: [],
      quoteTimestamp: null
    })
    expect(pullWatchlistChains).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('loses the price ceiling only for the ticker whose quote fetch failed, not the whole screen', async () => {
    const db = makeTestDb()
    const { provider, getStockQuotes } = makeProvider((tickers) => {
      if (tickers.includes('KO')) throw new Error('rate limited')
      return new Map([['AAPL', stockQuote('412.00')]])
    })
    mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ maxUnderlyingPrice: '75' }),
      currentDate: CURRENT_DATE
    })

    // Each ticker is fetched on its own, so KO's failure cannot reject AAPL's quote.
    expect(getStockQuotes).toHaveBeenCalledWith(['AAPL'])
    expect(getStockQuotes).toHaveBeenCalledWith(['KO'])
    // AAPL's $412 quote arrived and breaches the $75 ceiling; KO ranks unpriced.
    expect(result.ranked.map((c) => c.ticker)).toEqual(['KO'])
    expect(result.excluded).toEqual([
      { ticker: 'AAPL', code: 'price_ceiling', reason: 'underlying $412.00 above $75.00 ceiling' }
    ])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO' }),
      'screener_quote_fetch_failed'
    )
  })

  it('reports the newest quote timestamp across the ranked candidates', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({
      status: 'ok',
      tickers: [
        { ticker: 'AAPL', status: 'ok', strikes: [strike({ timestamp: '2026-07-23T15:30:00Z' })] },
        {
          ticker: 'KO',
          status: 'ok',
          strikes: [
            strike({
              contractId: 'KO260829P00060000',
              strike: '60.0000',
              bid: '1.18',
              ask: '1.22',
              mark: '1.20',
              delta: '-0.2500',
              timestamp: '2026-07-23T15:34:00Z'
            })
          ]
        }
      ]
    })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.quoteTimestamp).toBe('2026-07-23T15:34:00Z')
  })

  it('reports a null quote timestamp when nothing ranks', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [{ ticker: 'XYZ', status: 'no_options_listed' }] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(result.quoteTimestamp).toBeNull()
  })

  it('logs a single completion summary', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({
      status: 'ok',
      tickers: [AAPL_OK, KO_OK, { ticker: 'XYZ', status: 'no_options_listed' }]
    })

    await screenWatchlistCandidates(() => provider, db, { currentDate: CURRENT_DATE })

    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      { status: 'ok', rankedCount: 2, excludedCount: 1 },
      expect.any(String)
    )
  })
})
