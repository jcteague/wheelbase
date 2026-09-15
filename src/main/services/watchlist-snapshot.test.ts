// [US-96] watchlist:snapshot service — composes the watchlist, the day's quotes, the
// freshness-assessed IVR reading and the earnings calendar into one bench row per entry.
// Every boundary here is allowed to fail without costing the trader the other rows, so
// most of this file is the degradation contract in `contracts/watchlist-snapshot.md`.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from 'date-fns'
import type Database from 'better-sqlite3'
import type { MarketDataProvider, StockQuote } from '../integrations/market-data-provider'
import { DEFAULT_SCREENING_CRITERIA, type EarningsLookup } from '../core/screener'
import { logger } from '../logger'
import { makeTestDb, seedIvr, seedTradingCalendar, weekdayCalendarFetcher } from '../test-utils'
import { getEarningsCalendar } from './earnings-dates'
import { getAssessedIvrByUnderlying } from './ivr-snapshots'
import { buildWatchlistSnapshot } from './watchlist-snapshot'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// The IVR read path stays real so the seeded DB drives the assessment; the spy exists
// only so the `lastEarnings` handed to it can be asserted.
vi.mock('./ivr-snapshots', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ivr-snapshots')>()
  return { ...actual, getAssessedIvrByUnderlying: vi.fn(actual.getAssessedIvrByUnderlying) }
})

// The earnings *store* is stubbed so each test can state a ticker's verdict directly;
// `earnings-dates.test.ts` covers the store itself.
vi.mock('./earnings-dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./earnings-dates')>()
  return { ...actual, getEarningsCalendar: vi.fn() }
})

// 11:30 ET on a Thursday — the session is open, so the most recent completed session
// is Wednesday 2026-07-22.
const CURRENT_DATE = new Date('2026-07-23T15:30:00Z')
const QUOTE_TIMESTAMP = '2026-07-23T15:29:00Z'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: the calendar answers and holds nothing for anyone.
  vi.mocked(getEarningsCalendar).mockImplementation(
    async (_db, tickers) =>
      new Map(tickers.map((ticker) => [ticker, { next: { status: 'none' as const }, last: null }]))
  )
})

/** The calendar's answer per ticker for the run under test. */
function mockEarnings(byTicker: Record<string, EarningsLookup>): void {
  vi.mocked(getEarningsCalendar).mockImplementation(
    async (_db, tickers) =>
      new Map(
        tickers.map((ticker) => [
          ticker,
          { next: byTicker[ticker] ?? { status: 'none' as const }, last: null }
        ])
      )
  )
}

/** A DB with the exchange calendar already cached and reaching far enough ahead that no
 *  refresh is due — the steady state every snapshot runs in. */
function makeSnapshotDb(): Database.Database {
  const db = makeTestDb()
  seedTradingCalendar(db, '2026-05-01', '2027-12-31')
  return db
}

type EntrySeed = {
  ticker: string
  addedAt: string
  ownBelowPrice?: string | null
  ivrTrigger?: number | null
  postEarningsOnly?: boolean
}

/** Watchlist rows written directly so `added_at` — and therefore the row order the
 *  contract pins — is stated by the test rather than left to insertion timing. */
function seedEntries(db: Database.Database, entries: EntrySeed[]): void {
  const insert = db.prepare(
    `INSERT INTO watchlist
       (ticker, notes, own_below_price, ivr_trigger, post_earnings_only, core_holding, added_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  )
  for (const entry of entries) {
    insert.run(
      entry.ticker,
      null,
      entry.ownBelowPrice ?? null,
      entry.ivrTrigger ?? null,
      entry.postEarningsOnly ? 1 : 0,
      entry.addedAt
    )
  }
}

function stockQuote(price: string, prevClose = '100.00'): StockQuote {
  return {
    price,
    bid: price,
    ask: price,
    change: '0.00',
    changePercent: '0.00',
    prevClose,
    volume: 1_000_000,
    timestamp: QUOTE_TIMESTAMP
  }
}

function makeProvider(
  quotes: (tickers: string[]) => Map<string, StockQuote> | Promise<Map<string, StockQuote>> = () =>
    new Map()
): {
  provider: MarketDataProvider
  getStockQuotes: ReturnType<typeof vi.fn>
  getMarketCalendar: ReturnType<typeof vi.fn>
} {
  const getStockQuotes = vi.fn(async (tickers: string[]) => quotes(tickers))
  const getMarketCalendar = weekdayCalendarFetcher()
  return {
    provider: { getStockQuotes, getMarketCalendar } as unknown as MarketDataProvider,
    getStockQuotes,
    getMarketCalendar
  }
}

describe('buildWatchlistSnapshot', () => {
  it('returns one row per watchlist entry in watchlist order', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [
      { ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' },
      { ticker: 'AAPL', addedAt: '2026-07-20T12:00:00.000Z' }
    ])
    const { provider } = makeProvider()

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(snapshot.rows.map((row) => row.entry.ticker)).toEqual(['AAPL', 'KO'])
  })

  it('stamps asOf with the request clock', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])
    const { provider } = makeProvider()

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(snapshot.asOf).toBe(CURRENT_DATE.toISOString())
  })

  it('carries the quote price, previous close and timestamp for each ticker', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])
    const { provider } = makeProvider(() => new Map([['KO', stockQuote('62.00', '61.50')]]))

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(snapshot.rows[0].quote).toEqual({
      price: '62.00',
      prevClose: '61.50',
      timestamp: QUOTE_TIMESTAMP
    })
  })

  it('carries the assessed IV rank, earnings display and gate verdict for each ticker', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [
      {
        ticker: 'KO',
        addedAt: '2026-07-01T12:00:00.000Z',
        ownBelowPrice: '70.0000',
        ivrTrigger: 40
      }
    ])
    seedIvr(db, [['KO', '2026-07-22T20:10:00Z', '58.0']])
    mockEarnings({ KO: { status: 'found', date: '2026-10-15' } })
    const { provider } = makeProvider(() => new Map([['KO', stockQuote('62.00', '61.50')]]))

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(snapshot.rows[0].ivRank).toMatchObject({ value: '58.0', state: 'fresh' })
    expect(snapshot.rows[0].earnings).toEqual({
      kind: 'date',
      date: '2026-10-15',
      daysUntil: 84,
      withinWindow: false
    })
    expect(snapshot.rows[0].verdict).toEqual({
      price: { verdict: 'met', label: null },
      iv: { verdict: 'met', label: null },
      earnings: { verdict: 'none', label: null }
    })
  })

  it('returns no rows and never constructs the provider for an empty watchlist', async () => {
    const db = makeSnapshotDb()
    const { provider } = makeProvider()
    const getProvider = vi.fn(() => provider)

    const snapshot = await buildWatchlistSnapshot(getProvider, db, { currentDate: CURRENT_DATE })

    expect(snapshot).toEqual({ rows: [], asOf: CURRENT_DATE.toISOString() })
    expect(getProvider).not.toHaveBeenCalled()
  })

  describe('when the market-data provider cannot be constructed', () => {
    function unavailableProvider(): () => MarketDataProvider {
      return () => {
        throw new Error('no alpaca credentials')
      }
    }

    it('still resolves with every row, quote null and the price gate unknown', async () => {
      const db = makeSnapshotDb()
      seedEntries(db, [
        { ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z', ownBelowPrice: '70.0000' }
      ])

      const snapshot = await buildWatchlistSnapshot(unavailableProvider(), db, {
        currentDate: CURRENT_DATE
      })

      expect(snapshot.rows).toHaveLength(1)
      expect(snapshot.rows[0].quote).toBeNull()
      expect(snapshot.rows[0].verdict.price).toEqual({
        verdict: 'unknown',
        label: 'Price unavailable'
      })
    })

    it('still assesses the IV rank', async () => {
      const db = makeSnapshotDb()
      seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z', ivrTrigger: 40 }])
      seedIvr(db, [['KO', '2026-07-22T20:10:00Z', '58.0']])

      const snapshot = await buildWatchlistSnapshot(unavailableProvider(), db, {
        currentDate: CURRENT_DATE
      })

      expect(snapshot.rows[0].ivRank).toMatchObject({ value: '58.0', state: 'fresh' })
      expect(snapshot.rows[0].verdict.iv).toEqual({ verdict: 'met', label: null })
    })

    it('warns watchlist_snapshot_provider_unavailable', async () => {
      const db = makeSnapshotDb()
      seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])

      await buildWatchlistSnapshot(unavailableProvider(), db, { currentDate: CURRENT_DATE })

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.anything() }),
        'watchlist_snapshot_provider_unavailable'
      )
    })
  })

  it('nulls only the quote of the ticker whose fetch rejects', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [
      { ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' },
      { ticker: 'AAPL', addedAt: '2026-07-20T12:00:00.000Z' }
    ])
    const { provider } = makeProvider((tickers) => {
      if (tickers.includes('AAPL')) throw new Error('quote fetch failed')
      return new Map([['KO', stockQuote('62.00', '61.50')]])
    })

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    const byTicker = new Map(snapshot.rows.map((row) => [row.entry.ticker, row.quote]))
    expect(byTicker.get('AAPL')).toBeNull()
    expect(byTicker.get('KO')).toMatchObject({ price: '62.00' })
  })

  describe('when the earnings calendar read rejects', () => {
    beforeEach(() => {
      vi.mocked(getEarningsCalendar).mockRejectedValue(new Error('earnings store unreachable'))
    })

    it('reports every earnings display as unknown', async () => {
      const db = makeSnapshotDb()
      seedEntries(db, [
        { ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' },
        { ticker: 'AAPL', addedAt: '2026-07-20T12:00:00.000Z' }
      ])
      const { provider } = makeProvider()

      const snapshot = await buildWatchlistSnapshot(() => provider, db, {
        currentDate: CURRENT_DATE
      })

      expect(snapshot.rows.map((row) => row.earnings)).toEqual([
        { kind: 'unknown' },
        { kind: 'unknown' }
      ])
    })

    it('assesses the IV rank with no last-print knowledge', async () => {
      const db = makeSnapshotDb()
      seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])
      seedIvr(db, [['KO', '2026-07-22T20:10:00Z', '58.0']])
      const { provider } = makeProvider()

      await buildWatchlistSnapshot(() => provider, db, { currentDate: CURRENT_DATE })

      const options = vi.mocked(getAssessedIvrByUnderlying).mock.calls[0][2]
      expect(options.lastEarnings.get('KO')).toBeUndefined()
    })
  })

  // The fifth degradation guarantee in contracts/watchlist-snapshot.md. The read degrades
  // inside `getAssessedIvrByUnderlying`, so this asserts it at the boundary the contract
  // actually names rather than trusting the layer below to keep its promise.
  it('degrades a failed IVR read to unknown for every row without failing the snapshot', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [
      { ticker: 'KO', addedAt: '2026-07-02T12:00:00.000Z', ivrTrigger: 40 },
      { ticker: 'AAPL', addedAt: '2026-07-01T12:00:00.000Z', ivrTrigger: 50 }
    ])
    seedIvr(db, [['KO', '2026-07-22T20:10:00Z', '58.0']])
    const { provider } = makeProvider(
      (tickers) => new Map(tickers.map((ticker) => [ticker, stockQuote('62.00', '61.50')]))
    )
    vi.mocked(getAssessedIvrByUnderlying).mockReturnValueOnce(
      new Map([
        ['KO', null],
        ['AAPL', null]
      ])
    )

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(snapshot.rows.map((r) => r.ivRank)).toEqual([null, null])
    for (const row of snapshot.rows) {
      expect(row.verdict.iv).toEqual({ verdict: 'unknown', label: 'IV unavailable' })
      // Only IV knowledge is lost: the quote and the row itself survive.
      expect(row.quote).not.toBeNull()
    }
  })

  it('reports a stale reading as too old to judge rather than letting it decide', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z', ivrTrigger: 40 }])
    // 7 completed sessions back — inside the stale tier.
    seedIvr(db, [['KO', '2026-07-13T20:10:00Z', '58.0']])
    const { provider } = makeProvider()

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(snapshot.rows[0].ivRank).toMatchObject({ state: 'stale' })
    expect(snapshot.rows[0].verdict.iv.label).toBe('IV too old to judge')
  })

  it('reads the earnings calendar through the DTE window plus a full lookahead buffer', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])
    const { provider } = makeProvider()

    await buildWatchlistSnapshot(() => provider, db, { currentDate: CURRENT_DATE })

    expect(getEarningsCalendar).toHaveBeenCalledWith(
      db,
      ['KO'],
      expect.objectContaining({
        horizon: addDays(CURRENT_DATE, DEFAULT_SCREENING_CRITERIA.dteMax + 45),
        now: CURRENT_DATE
      })
    )
  })

  it('logs watchlist_snapshot_built at info with the row count', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [
      { ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' },
      { ticker: 'AAPL', addedAt: '2026-07-20T12:00:00.000Z' }
    ])
    const { provider } = makeProvider()

    await buildWatchlistSnapshot(() => provider, db, { currentDate: CURRENT_DATE })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 2 }),
      'watchlist_snapshot_built'
    )
  })
})

// [US-116] The bench refreshes the calendar it reads, so a fresh install does not wait
// for the nightly collection before IV rank becomes legible.
describe('buildWatchlistSnapshot — the calendar refresh it rides on', () => {
  it('fetches the calendar once and renders the seeded IV rank on the same open', async () => {
    // An install that has never collected: entries and a reading, but no calendar.
    const db = makeTestDb()
    seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])
    seedIvr(db, [['KO', '2026-07-22T20:10:00Z', '58.0']])
    const { provider, getMarketCalendar } = makeProvider(
      () => new Map([['KO', stockQuote('62.00', '61.50')]])
    )

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(getMarketCalendar).toHaveBeenCalledTimes(1)
    expect(snapshot.rows[0].ivRank).toMatchObject({ value: '58.0', state: 'fresh' })
  })

  it('does not refetch the calendar on a second open once coverage is current', async () => {
    const db = makeSnapshotDb()
    seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])
    const { provider, getMarketCalendar } = makeProvider()

    await buildWatchlistSnapshot(() => provider, db, { currentDate: CURRENT_DATE })
    await buildWatchlistSnapshot(() => provider, db, { currentDate: CURRENT_DATE })

    expect(getMarketCalendar).not.toHaveBeenCalled()
  })

  it('still returns every row when the calendar fetch fails, with IV rank unknown', async () => {
    const db = makeTestDb()
    seedEntries(db, [
      { ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' },
      { ticker: 'AAPL', addedAt: '2026-07-20T12:00:00.000Z' }
    ])
    seedIvr(db, [['KO', '2026-07-22T20:10:00Z', '58.0']])
    const { provider, getMarketCalendar } = makeProvider(
      () =>
        new Map([
          ['KO', stockQuote('62.00', '61.50')],
          ['AAPL', stockQuote('210.00', '208.00')]
        ])
    )
    getMarketCalendar.mockRejectedValue(new Error('calendar unavailable'))

    const snapshot = await buildWatchlistSnapshot(() => provider, db, {
      currentDate: CURRENT_DATE
    })

    expect(snapshot.rows).toHaveLength(2)
    for (const row of snapshot.rows) {
      expect(row.entry.ticker).toBeTruthy()
      expect(row.quote).not.toBeNull()
      expect(row.verdict).toBeTruthy()
      expect(row.ivRank).toBeNull()
    }
  })

  it('logs the built snapshot at info with the full row count despite a calendar failure', async () => {
    const db = makeTestDb()
    seedEntries(db, [{ ticker: 'KO', addedAt: '2026-07-01T12:00:00.000Z' }])
    const { provider, getMarketCalendar } = makeProvider(
      () => new Map([['KO', stockQuote('62.00', '61.50')]])
    )
    getMarketCalendar.mockRejectedValue(new Error('calendar unavailable'))

    await buildWatchlistSnapshot(() => provider, db, { currentDate: CURRENT_DATE })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ rowCount: 1, quotedCount: 1 }),
      'watchlist_snapshot_built'
    )
  })
})
