// [US-65] screener service — orchestration across the chain pull, the IVR join, the
// optional quote fetch and the pure engine, with every boundary isolated.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from 'date-fns'
import type { MarketDataProvider, StockQuote } from '../integrations/market-data-provider'
import type { CandidateStrike } from '../core/candidate-chain'
import {
  DEFAULT_SCREENING_CRITERIA,
  type EarningsLookup,
  type ScreeningCriteria
} from '../core/screener'
import { fetchNextEarnings } from '../integrations/finnhub-earnings'
import { logger } from '../logger'
import { makeTestDb, seedIvr } from '../test-utils'
import { pullWatchlistChains, type TickerChainResult } from './candidate-chains'
import { getEarnings } from './earnings-dates'
import { getLatestIvrByUnderlying } from './ivr-snapshots'
import { screenWatchlistCandidates } from './screener'
import { saveScreeningCriteria } from './screening-criteria'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('./candidate-chains', () => ({ pullWatchlistChains: vi.fn() }))

// [US-70] The Finnhub HTTP boundary is the only thing stubbed, so the store's
// read-through, its write-back, and the migration's schema are all exercised for real
// — which is what lets the "second run issues no fetch" assertion mean anything.
vi.mock('../integrations/finnhub-earnings', () => ({ fetchNextEarnings: vi.fn() }))

// The read path stays real so a seeded DB drives the join; individual tests swap in
// a throwing implementation to exercise the degrade-to-empty path.
vi.mock('./ivr-snapshots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ivr-snapshots')>()
  return { ...actual, getLatestIvrByUnderlying: vi.fn(actual.getLatestIvrByUnderlying) }
})

vi.mock('./earnings-dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./earnings-dates')>()
  return { ...actual, getEarnings: vi.fn(actual.getEarnings) }
})

beforeEach(() => {
  vi.clearAllMocks()
  // Default: the calendar answers, and holds nothing for anyone. Tests that care
  // override per ticker.
  vi.mocked(fetchNextEarnings).mockImplementation(async (tickers) =>
    Object.fromEntries(
      tickers.map((ticker): [string, EarningsLookup] => [ticker, { status: 'none' }])
    )
  )
})

/** The calendar's answer per ticker, for the run under test. */
function mockEarnings(byTicker: Record<string, EarningsLookup>): void {
  vi.mocked(fetchNextEarnings).mockImplementation(async (tickers) =>
    Object.fromEntries(
      tickers.map((ticker): [string, EarningsLookup] => [
        ticker,
        byTicker[ticker] ?? { status: 'none' }
      ])
    )
  )
}

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

/** [US-67] Persist criteria the way the sheet does, so the screen picks them up
 *  through the real read path rather than a hand-written app_settings row. */
function persistCriteria(
  db: ReturnType<typeof makeTestDb>,
  overrides: Partial<ScreeningCriteria>
): void {
  // The save payload omits maxSpreadAbsolute; passing the full document is fine —
  // the service supplies that field itself.
  saveScreeningCriteria(db, criteriaWith(overrides))
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

  it('lets a ticker the provider quoted no price for through the ceiling untouched', async () => {
    const db = makeTestDb()
    // The provider answers, but without a row for AAPL — an unknown price, not a high
    // one, so the ceiling cannot judge it and must not drop it.
    const { provider } = makeProvider(() => new Map())
    mockChains({ status: 'ok', tickers: [AAPL_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ maxUnderlyingPrice: '75' }),
      currentDate: CURRENT_DATE
    })

    expect(result.ranked.map((candidate) => candidate.ticker)).toEqual(['AAPL'])
    expect(result.excluded).toEqual([])
  })

  it('defaults currentDate to now when the caller supplies none', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    mockChains({ status: 'ok', tickers: [] })

    await screenWatchlistCandidates(() => provider, db)

    // The DTE window still reaches the chain pull, dated from the real clock rather
    // than an injected instant.
    expect(pullWatchlistChains).toHaveBeenCalledWith(provider, db, {
      window: { min: DEFAULT_SCREENING_CRITERIA.dteMin, max: DEFAULT_SCREENING_CRITERIA.dteMax },
      currentDate: expect.any(Date)
    })
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

  it('isolates a ticker whose stored IV rank is corrupt so the others still rank', async () => {
    const db = makeTestDb()
    const { provider } = makeProvider()
    // `wellFormedStrikes` validates the quote, but not the ticker-level values joined
    // in alongside it. A non-numeric IVR row makes the [US-67] iv_rank_floor filter's
    // Decimal math throw — the backstop the per-ticker catch exists for.
    seedIvr(db, [['AAPL', '2026-07-23T12:00:00Z', 'not-a-number']])
    mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })

    const result = await screenWatchlistCandidates(() => provider, db, {
      criteria: criteriaWith({ minIvRank: '30' }),
      currentDate: CURRENT_DATE
    })

    // The healthy ticker is unaffected; the corrupt one degrades to a row of its own
    // rather than taking the whole run down.
    expect(result.ranked.map((candidate) => candidate.ticker)).toEqual(['KO'])
    expect(result.excluded).toEqual([
      { ticker: 'AAPL', code: 'data_unavailable', reason: 'market data unavailable' }
    ])
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL' }),
      'screen_ticker_failed'
    )
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

  // [US-67] With no explicit criteria the screen must read the trader's saved
  // criteria, not the shipped defaults — this is what makes a save re-screen.
  describe('persisted criteria', () => {
    it('screens against the persisted criteria when none are supplied', async () => {
      const db = makeTestDb()
      persistCriteria(db, { deltaMin: '0.15', deltaMax: '0.20' })
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })

      const result = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(result.ranked).toEqual([])
      expect(result.excluded).toEqual([
        { ticker: 'AAPL', code: 'delta_band', reason: 'delta 0.28 outside 0.15–0.20' }
      ])
    })

    it('still screens against the shipped defaults when nothing has been persisted', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })

      const result = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      // 0.28 delta sits inside the default 0.20–0.30 band.
      expect(result.ranked.map((c) => c.ticker)).toEqual(['AAPL'])
      expect(result.excluded).toEqual([])
    })

    it('lets an explicit opts.criteria override the persisted criteria', async () => {
      const db = makeTestDb()
      persistCriteria(db, { deltaMin: '0.15', deltaMax: '0.20' })
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })

      const result = await screenWatchlistCandidates(() => provider, db, {
        criteria: DEFAULT_SCREENING_CRITERIA,
        currentDate: CURRENT_DATE
      })

      expect(result.ranked.map((c) => c.ticker)).toEqual(['AAPL'])
    })

    it('bounds the chain pull by the persisted DTE window', async () => {
      const db = makeTestDb()
      persistCriteria(db, { dteMin: 40, dteMax: 45 })
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [] })

      await screenWatchlistCandidates(() => provider, db, { currentDate: CURRENT_DATE })

      expect(pullWatchlistChains).toHaveBeenCalledWith(provider, db, {
        window: { min: 40, max: 45 },
        currentDate: CURRENT_DATE
      })
    })
  })

  // [US-70] The earnings verdict reaches the engine through the persisted store, and
  // every way the calendar can fail degrades to a per-candidate caution rather than a
  // suppressed run.
  describe('earnings', () => {
    // CURRENT_DATE is 2026-07-23 and the fixture strikes expire 2026-08-29.
    const IN_WINDOW = '2026-08-10'
    const AFTER_EXPIRY = '2026-09-15'

    it('carries the store’s verdict onto the candidate instead of the old always-null stub', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })
      mockEarnings({ AAPL: { status: 'found', date: AFTER_EXPIRY } })

      const result = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(result.ranked[0].earnings).toEqual({ status: 'clear' })
    })

    it('excludes an in-window candidate in the default exclude mode', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })
      mockEarnings({ AAPL: { status: 'found', date: IN_WINDOW } })

      const result = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(result.ranked).toEqual([])
      expect(result.excluded).toEqual([
        {
          ticker: 'AAPL',
          code: 'earnings_in_window',
          reason: 'earnings 2026-08-10 falls on or before expiry'
        }
      ])
    })

    it('flags rather than excludes an in-window candidate in flag mode', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })
      mockEarnings({ AAPL: { status: 'found', date: IN_WINDOW } })

      const result = await screenWatchlistCandidates(() => provider, db, {
        criteria: criteriaWith({ earningsHandling: 'flag' }),
        currentDate: CURRENT_DATE
      })

      expect(result.ranked[0].earnings).toEqual({
        status: 'flagged',
        date: IN_WINDOW,
        daysBeforeExpiry: 19
      })
      expect(result.excluded).toEqual([])
    })

    it('asks the store for a horizon past the criteria dteMax', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })

      await screenWatchlistCandidates(() => provider, db, { currentDate: CURRENT_DATE })

      const { horizon } = vi.mocked(getEarnings).mock.calls[0][2]
      // Default dteMax is 45, so the calendar must be read past the furthest expiry.
      expect(horizon.getTime()).toBeGreaterThanOrEqual(
        addDays(CURRENT_DATE, DEFAULT_SCREENING_CRITERIA.dteMax).getTime()
      )
    })

    it('widens the horizon with a custom DTE window', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })

      await screenWatchlistCandidates(() => provider, db, {
        criteria: criteriaWith({ dteMin: 50, dteMax: 60 }),
        currentDate: CURRENT_DATE
      })

      const { horizon } = vi.mocked(getEarnings).mock.calls[0][2]
      expect(horizon.getTime()).toBeGreaterThanOrEqual(addDays(CURRENT_DATE, 60).getTime())
    })

    it('issues no second fetch once the date is stored, and screens identically', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK] })
      mockEarnings({ AAPL: { status: 'found', date: AFTER_EXPIRY } })

      const first = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })
      expect(fetchNextEarnings).toHaveBeenCalledTimes(1)

      const second = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(fetchNextEarnings).toHaveBeenCalledTimes(1)
      expect(second).toEqual(first)
    })

    it('leaves every candidate unavailable — and nothing excluded — when the store rejects', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })
      vi.mocked(getEarnings).mockRejectedValueOnce(new Error('database is locked'))

      const result = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(result.status).toBe('ok')
      expect(result.ranked.map((c) => [c.ticker, c.earnings])).toEqual([
        ['KO', { status: 'unavailable' }],
        ['AAPL', { status: 'unavailable' }]
      ])
      expect(result.excluded).toEqual([])
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tickers: ['AAPL', 'KO'] }),
        'screener_earnings_read_failed'
      )
    })

    it('defaults a ticker the store omitted to unavailable', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })
      vi.mocked(getEarnings).mockResolvedValueOnce(
        new Map([['KO', { status: 'found', date: AFTER_EXPIRY }]])
      )

      const result = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(result.ranked.map((c) => [c.ticker, c.earnings.status])).toEqual([
        ['KO', 'clear'],
        ['AAPL', 'unavailable']
      ])
    })

    it('tells an empty calendar apart from an unreadable one in the same run', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })
      mockEarnings({ AAPL: { status: 'unavailable' }, KO: { status: 'none' } })

      const result = await screenWatchlistCandidates(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(result.ranked.map((c) => [c.ticker, c.earnings.status])).toEqual([
        ['KO', 'unknown'],
        ['AAPL', 'unavailable']
      ])
    })

    it('never excludes an unknown or unavailable date, even in exclude mode', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })
      mockEarnings({ AAPL: { status: 'unavailable' }, KO: { status: 'none' } })

      const result = await screenWatchlistCandidates(() => provider, db, {
        criteria: criteriaWith({ earningsHandling: 'exclude' }),
        currentDate: CURRENT_DATE
      })

      expect(result.ranked).toHaveLength(2)
      expect(result.excluded).toEqual([])
    })

    it('asks only for tickers whose chain pull succeeded', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      mockChains({
        status: 'ok',
        tickers: [AAPL_OK, { ticker: 'XYZ', status: 'no_options_listed' }]
      })

      await screenWatchlistCandidates(() => provider, db, { currentDate: CURRENT_DATE })

      expect(vi.mocked(getEarnings).mock.calls[0][1]).toEqual(['AAPL'])
    })

    it('demotes a flagged candidate below a clear one that scores lower', async () => {
      const db = makeTestDb()
      const { provider } = makeProvider()
      // KO outscores AAPL (0.7892 vs 0.5285), so only the tier can invert them.
      mockChains({ status: 'ok', tickers: [AAPL_OK, KO_OK] })
      mockEarnings({
        KO: { status: 'found', date: IN_WINDOW },
        AAPL: { status: 'found', date: AFTER_EXPIRY }
      })

      const result = await screenWatchlistCandidates(() => provider, db, {
        criteria: criteriaWith({ earningsHandling: 'flag' }),
        currentDate: CURRENT_DATE
      })

      expect(result.ranked.map((c) => c.ticker)).toEqual(['AAPL', 'KO'])
    })
  })
})
