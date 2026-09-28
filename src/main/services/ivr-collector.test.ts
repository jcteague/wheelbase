// [US-44/US-100/US-121] The `ivr-collect` batch: every collection target (open positions ∪
// watchlist) brought up to date through `collectIvHistory`, one ticker's failure isolated from
// the rest, and the in-memory run state kept in step so the bench can say why a rank is absent.
import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { TradingCalendar } from '../core/trading-calendar'
import {
  FakeMarketDataProvider,
  dailyBarRequestCount,
  setFakeIvSeries,
  type FakeIvSeries
} from '../integrations/fake-market-data'
import { MarketDataError } from '../integrations/market-data-provider'
import { logger } from '../logger'
import {
  makeTestDb,
  makeTradingCalendar,
  seedIv30Series,
  seedTradingCalendar,
  seedWatchlist
} from '../test-utils'
import { collectIvHistory } from './iv-history'
import { createIvRunState } from './iv-run-state'
import { collectIVRSnapshots } from './ivr-collector'
import { removeWatchlistEntry } from './watchlist'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// The real service runs by default; the spy lets a test pin call order or program an outcome.
vi.mock('./iv-history', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./iv-history')>()
  return { ...actual, collectIvHistory: vi.fn(actual.collectIvHistory) }
})

/** Friday 2026-09-25 17:30 ET — after the close, so Friday is the newest completed session. */
const FRIDAY_EVENING = new Date('2026-09-25T21:30:00.000Z')
/** Saturday 2026-09-26 11:00 ET. */
const SATURDAY = new Date('2026-09-26T15:00:00.000Z')
/** Thanksgiving 2026-11-26 (a closure) at 17:30 ET; Wednesday is the newest completed session. */
const THANKSGIVING_EVENING = new Date('2026-11-26T22:30:00.000Z')

const CALENDAR_FIRST_DAY = '2025-06-01'
const CALENDAR_LAST_DAY = '2027-12-31'
const CLOSURES = ['2026-11-26']
const CALENDAR = makeTradingCalendar(CALENDAR_FIRST_DAY, CALENDAR_LAST_DAY, { closures: CLOSURES })

/** A DB whose exchange calendar is cached far enough back and ahead that no refresh is due —
 *  the state a scheduled run normally finds. */
function makeCollectorDb(): Database.Database {
  const db = makeTestDb()
  seedTradingCalendar(db, CALENDAR_FIRST_DAY, CALENDAR_LAST_DAY, { closures: CLOSURES })
  return db
}

/** The 253 sessions (window + anchor) a run at `now` requires. */
function requiredSessions(calendar: TradingCalendar, now: Date): string[] {
  return calendar.sessions
    .filter((session) => new Date(session.closeAt) <= now)
    .map((session) => session.date)
    .slice(-253)
}

/** Seeds every required session except the newest `missing`, and programs the fake to serve
 *  bars for exactly those — so a run collects only a handful of sessions. */
function seedAllBut(
  db: Database.Database,
  ticker: string,
  missing: number,
  now = FRIDAY_EVENING
): { sessions: string[] } {
  const required = requiredSessions(CALENDAR, now)
  const seeded = required.slice(0, required.length - missing)
  seedIv30Series(
    db,
    ticker,
    seeded.map((session) => [session, '0.2500'])
  )
  return { sessions: required.slice(required.length - missing) }
}

function series(sessions: string[], extra: Partial<FakeIvSeries> = {}): FakeIvSeries {
  return {
    price: 100,
    sessions: Object.fromEntries(sessions.map((session) => [session, 0.26])),
    ...extra
  }
}

function insertPosition(
  db: Database.Database,
  input: { id: string; ticker: string; status?: 'ACTIVE' | 'CLOSED' }
): void {
  const status = input.status ?? 'ACTIVE'
  const phase = status === 'CLOSED' ? 'COMPLETED' : 'CSP_OPEN'
  const closedDate = status === 'CLOSED' ? '2026-05-28' : null

  db.prepare(
    `INSERT INTO positions (
      id, ticker, strategy_type, status, phase, opened_date, closed_date, created_at, updated_at
    ) VALUES (
      ?, ?, 'WHEEL', ?, ?, '2026-05-01', ?, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'
    )`
  ).run(input.id, input.ticker, status, phase, closedDate)
}

/** Insert a watchlist row verbatim — `seedWatchlist` normalises casing, and the
 *  union's de-duplication has to hold for a row that was never normalised. */
function insertWatchlistTickerRaw(db: Database.Database, ticker: string): void {
  db.prepare(`INSERT INTO watchlist (ticker, added_at) VALUES (?, '2026-05-01T00:00:00.000Z')`).run(
    ticker
  )
}

function readingCount(db: Database.Database, ticker: string): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM iv30_reading WHERE underlying = ?')
    .get(ticker) as { count: number }
  return row.count
}

function collectedTickers(): string[] {
  return vi.mocked(collectIvHistory).mock.calls.map(([input]) => input.ticker)
}

function runCollector(
  db: Database.Database,
  opts: {
    now?: Date
    signal?: AbortSignal
    provider?: FakeMarketDataProvider
    runState?: ReturnType<typeof createIvRunState>
    onCompleted?: () => void
  } = {}
): ReturnType<typeof collectIVRSnapshots> {
  const now = opts.now ?? FRIDAY_EVENING
  return collectIVRSnapshots({
    db,
    logger,
    clock: { now: () => now },
    marketDataProvider: opts.provider ?? new FakeMarketDataProvider(),
    runState: opts.runState ?? createIvRunState(),
    signal: opts.signal,
    onCompleted: opts.onCompleted
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setFakeIvSeries({})
})

describe('collectIVRSnapshots — outcomes', () => {
  it('isolates a network_error on the second of three tickers and persists the other two', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO', 'MSFT'])
    const aapl = seedAllBut(db, 'AAPL', 2)
    const ko = seedAllBut(db, 'KO', 2)
    const msft = seedAllBut(db, 'MSFT', 2)
    setFakeIvSeries({
      AAPL: series(aapl.sessions),
      KO: series(ko.sessions, { failWith: 'network_error' }),
      MSFT: series(msft.sessions)
    })

    const result = await runCollector(db)

    expect(result).toEqual({ successCount: 2, errorCount: 1, skippedCount: 0, skippedReason: null })
    expect(readingCount(db, 'AAPL')).toBe(253)
    expect(readingCount(db, 'MSFT')).toBe(253)
    expect(readingCount(db, 'KO')).toBe(251)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO', err: expect.any(MarketDataError) }),
      expect.any(String)
    )
  })

  it('skips the run as market_data_unavailable when the first ticker reports no_market_data', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO', 'MSFT'])
    seedAllBut(db, 'AAPL', 2)
    const provider = new FakeMarketDataProvider()
    vi.spyOn(provider, 'getStockDailyBars').mockRejectedValue(
      new MarketDataError('auth_failed', 'no market-data credentials')
    )
    const runState = createIvRunState()

    const result = await runCollector(db, { provider, runState })

    expect(result).toEqual({
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: 'market_data_unavailable'
    })
    expect(collectedTickers()).toEqual(['AAPL'])
    expect(
      vi
        .mocked(logger.info)
        .mock.calls.filter(([, msg]) => msg === 'ivr_collection_skipped_no_market_data')
    ).toHaveLength(1)
    expect(['AAPL', 'KO', 'MSFT'].map((ticker) => runState.get(ticker))).toEqual([
      'no_market_data',
      'no_market_data',
      'no_market_data'
    ])
  })

  it('skips the run as market_data_unavailable when a fresh install cannot fetch the calendar for want of credentials', async () => {
    // No cached calendar: without credentials the calendar fetch is the first call to fail.
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'KO'])
    const provider = new FakeMarketDataProvider()
    vi.spyOn(provider, 'getMarketCalendar').mockRejectedValue(
      new MarketDataError('auth_failed', 'no market-data credentials')
    )
    const runState = createIvRunState()
    const onCompleted = vi.fn()

    const result = await runCollector(db, { provider, runState, onCompleted })

    expect(result).toEqual({
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: 'market_data_unavailable'
    })
    expect(collectIvHistory).not.toHaveBeenCalled()
    expect(['AAPL', 'KO'].map((ticker) => runState.get(ticker))).toEqual([
      'no_market_data',
      'no_market_data'
    ])
    expect(onCompleted).toHaveBeenCalledOnce()
  })

  it('counts a ticker whose series is already complete as skipped (up to date)', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['KO'])
    seedAllBut(db, 'KO', 0)

    const result = await runCollector(db)

    expect(result).toEqual({ successCount: 0, errorCount: 0, skippedCount: 1, skippedReason: null })
    expect(dailyBarRequestCount()).toBe(0)
  })

  it('makes no bar request on a Saturday when every series is complete through Friday', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO'])
    seedAllBut(db, 'AAPL', 0, SATURDAY)
    seedAllBut(db, 'KO', 0, SATURDAY)

    const result = await runCollector(db, { now: SATURDAY })

    expect(result).toEqual({ successCount: 0, errorCount: 0, skippedCount: 2, skippedReason: null })
    expect(dailyBarRequestCount()).toBe(0)
  })

  it('makes no bar request on a recognised holiday when every series is complete', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['KO'])
    seedAllBut(db, 'KO', 0, THANKSGIVING_EVENING)

    const result = await runCollector(db, { now: THANKSGIVING_EVENING })

    expect(result).toEqual({ successCount: 0, errorCount: 0, skippedCount: 1, skippedReason: null })
    expect(dailyBarRequestCount()).toBe(0)
  })

  it('isolates an unexpected throw from one ticker as a failed ticker and continues', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO'])
    seedAllBut(db, 'KO', 0)
    vi.mocked(collectIvHistory).mockRejectedValueOnce(new Error('engine blew up'))

    const result = await runCollector(db)

    expect(result).toEqual({ successCount: 0, errorCount: 1, skippedCount: 1, skippedReason: null })
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL', err: expect.any(Error) }),
      expect.any(String)
    )
  })

  it('rethrows a DB failure instead of downgrading a systemic fault to a per-ticker error', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO'])
    db.exec('DROP TABLE iv30_reading')

    await expect(runCollector(db)).rejects.toThrow(/iv30_reading/)
    expect(collectedTickers()).toEqual(['AAPL'])
  })

  it('accepts no trigger argument', () => {
    type Input = Parameters<typeof collectIVRSnapshots>[0]
    expectTypeOf<Input>().not.toHaveProperty('trigger')
    expectTypeOf<Input>().not.toHaveProperty('fetchIvr')
  })
})

describe('collectIVRSnapshots — run state', () => {
  it('marks each ticker pending before its turn and settles it after', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['KO'])
    seedAllBut(db, 'KO', 0)
    const runState = createIvRunState()
    const markPending = vi.spyOn(runState, 'markPending')
    const settle = vi.spyOn(runState, 'settle')

    await runCollector(db, { runState })

    const collectOrder = vi.mocked(collectIvHistory).mock.invocationCallOrder[0]
    expect(markPending).toHaveBeenCalledWith('KO')
    expect(settle).toHaveBeenCalledWith('KO', { status: 'up_to_date' })
    expect(markPending.mock.invocationCallOrder[0]).toBeLessThan(collectOrder)
    expect(settle.mock.invocationCallOrder[0]).toBeGreaterThan(collectOrder)
  })

  it('leaves a failed ticker reading failed and clears the collected and up-to-date ones', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO', 'MSFT'])
    const aapl = seedAllBut(db, 'AAPL', 1)
    const ko = seedAllBut(db, 'KO', 1)
    seedAllBut(db, 'MSFT', 0)
    setFakeIvSeries({
      AAPL: series(aapl.sessions),
      KO: series(ko.sessions, { failWith: 'network_error' })
    })
    const runState = createIvRunState()

    await runCollector(db, { runState })

    expect(runState.get('AAPL')).toBeUndefined()
    expect(runState.get('KO')).toBe('failed')
    expect(runState.get('MSFT')).toBeUndefined()
    expect(vi.mocked(logger.debug)).toHaveBeenCalledWith(
      { ticker: 'KO', status: 'failed' },
      'iv_run_state_settled'
    )
  })
})

describe('collectIVRSnapshots — completion notification', () => {
  // The bench does not poll, so a run tells it to refetch — once. Each refetch re-runs the
  // screener (a chain pull per ticker), so a push per ticker would stampede the rate limit
  // the batch's own bar requests share.
  it('notifies once, after every ticker has settled', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO', 'MSFT'])
    const aapl = seedAllBut(db, 'AAPL', 1)
    const ko = seedAllBut(db, 'KO', 1)
    seedAllBut(db, 'MSFT', 0)
    setFakeIvSeries({
      AAPL: series(aapl.sessions),
      KO: series(ko.sessions, { failWith: 'network_error' })
    })
    const runState = createIvRunState()
    const statesAtNotify: Array<Array<string | undefined>> = []
    const onCompleted = vi.fn(() =>
      statesAtNotify.push(['AAPL', 'KO', 'MSFT'].map((ticker) => runState.get(ticker)))
    )

    await runCollector(db, { runState, onCompleted })

    expect(statesAtNotify).toEqual([[undefined, 'failed', undefined]])
  })

  it('notifies once when a ticker reports no market data and the run stops', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO', 'MSFT'])
    seedAllBut(db, 'AAPL', 2)
    const provider = new FakeMarketDataProvider()
    vi.spyOn(provider, 'getStockDailyBars').mockRejectedValue(
      new MarketDataError('auth_failed', 'no market-data credentials')
    )
    const onCompleted = vi.fn()

    await runCollector(db, { provider, onCompleted })

    expect(onCompleted).toHaveBeenCalledOnce()
  })

  it('notifies once when the run is aborted between tickers', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO'])
    const controller = new AbortController()
    controller.abort()
    const onCompleted = vi.fn()

    await runCollector(db, { signal: controller.signal, onCompleted })

    expect(onCompleted).toHaveBeenCalledOnce()
  })

  it('still notifies when a systemic DB failure is rethrown', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL'])
    seedAllBut(db, 'AAPL', 1)
    db.exec('DROP TABLE iv30_reading')
    const onCompleted = vi.fn()

    await expect(runCollector(db, { onCompleted })).rejects.toThrow()

    expect(onCompleted).toHaveBeenCalledOnce()
  })
})

describe('collectIVRSnapshots — targets', () => {
  it('collects the union of open-position and watchlist tickers, distinct and sorted', async () => {
    const db = makeCollectorDb()
    insertPosition(db, { id: 'pos-spy-1', ticker: 'SPY' })
    insertPosition(db, { id: 'pos-spy-2', ticker: 'spy' })
    insertPosition(db, { id: 'pos-aapl-1', ticker: 'AAPL' })
    insertPosition(db, { id: 'pos-closed', ticker: 'TSLA', status: 'CLOSED' })
    seedWatchlist(db, ['KO', 'XYZ'])
    insertWatchlistTickerRaw(db, 'aapl')

    await runCollector(db)

    expect(collectedTickers()).toEqual(['AAPL', 'KO', 'SPY', 'XYZ'])
  })

  it('collects a watchlist ticker whose only position is CLOSED, and never a closed ticker off the watchlist', async () => {
    const db = makeCollectorDb()
    insertPosition(db, { id: 'pos-ko-closed', ticker: 'KO', status: 'CLOSED' })
    seedWatchlist(db, ['KO'])
    insertPosition(db, { id: 'pos-tsla-closed', ticker: 'TSLA', status: 'CLOSED' })

    await runCollector(db)

    expect(collectedTickers()).toEqual(['KO'])
  })

  it('stops collecting a ticker removed from the watchlist and keeps its stored series', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['KO'])
    const ko = seedAllBut(db, 'KO', 1)
    setFakeIvSeries({ KO: series(ko.sessions) })

    await runCollector(db)
    expect(collectedTickers()).toEqual(['KO'])

    removeWatchlistEntry(db, 'KO')
    vi.mocked(collectIvHistory).mockClear()
    await runCollector(db)

    expect(collectIvHistory).not.toHaveBeenCalled()
    expect(readingCount(db, 'KO')).toBe(253)
  })

  it('stops at the next ticker boundary when the abort signal fires mid-run', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['AAPL', 'KO', 'MSFT'])
    const controller = new AbortController()
    vi.mocked(collectIvHistory).mockImplementationOnce(async () => {
      controller.abort()
      return { status: 'collected', readings: 1, gaps: 0 }
    })

    const result = await runCollector(db, { signal: controller.signal })

    expect(collectedTickers()).toEqual(['AAPL'])
    expect(result.successCount).toBe(1)
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ successCount: 1 }),
      expect.stringContaining('aborted')
    )
  })
})

describe('collectIVRSnapshots — calendar refresh', () => {
  it('refreshes the cached calendar from the market-data provider before reading it', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['KO'])
    const provider = new FakeMarketDataProvider()
    const getMarketCalendar = vi.spyOn(provider, 'getMarketCalendar')

    // No calendar cached at all: without the refresh the run could not place `now`.
    await runCollector(db, { provider })

    expect(getMarketCalendar).toHaveBeenCalled()
    expect(vi.mocked(collectIvHistory).mock.calls[0][0].calendar.sessions.length).toBeGreaterThan(
      253
    )
  })

  it('still runs on the cached calendar when the calendar fetch fails', async () => {
    const db = makeCollectorDb()
    seedWatchlist(db, ['KO'])
    seedAllBut(db, 'KO', 0)
    const provider = new FakeMarketDataProvider()
    vi.spyOn(provider, 'getMarketCalendar').mockRejectedValue(new Error('network error'))

    const result = await runCollector(db, { provider })

    expect(result.skippedCount).toBe(1)
  })

  it('refreshes the calendar on a run once its lookahead has run short', async () => {
    const db = makeTestDb()
    seedTradingCalendar(db, CALENDAR_FIRST_DAY, '2027-06-20')
    seedWatchlist(db, ['KO'])
    const provider = new FakeMarketDataProvider()
    const getMarketCalendar = vi.spyOn(provider, 'getMarketCalendar')

    await runCollector(db, { provider })

    expect(getMarketCalendar).toHaveBeenCalled()
  })
})
