import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrokerProvider, MarketStatus } from '../integrations/broker-provider'
import type { IVRResult } from '../integrations/barchart-ivr-scraper'
import { logger } from '../logger'
import { makeTestDb, seedWatchlist } from '../test-utils'
import { removeWatchlistEntry } from './watchlist'
import { collectIVRSnapshots } from './ivr-collector'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

type TestClock = {
  now: () => Date
}

type FetchIvr = ReturnType<typeof vi.fn<(ticker: string) => Promise<IVRResult>>>

function makeBroker(status: MarketStatus): BrokerProvider {
  return {
    getAccountInfo: vi.fn(),
    getActivities: vi.fn(),
    getMarketStatus: vi.fn().mockResolvedValue(status)
  } as unknown as BrokerProvider
}

function makeClock(now = '2026-05-29T21:30:00.000Z'): TestClock {
  return {
    now: () => new Date(now)
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

function listSnapshots(db: Database.Database): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT underlying, observed_at, ivr, ivp, iv30, source
       FROM ivr_snapshot
       ORDER BY underlying, observed_at`
    )
    .all() as Array<Record<string, unknown>>
}

const CLOSED_WEEKEND_STATUS: MarketStatus = {
  isOpen: false,
  session: 'closed',
  nextOpen: '2026-06-01T13:30:00.000Z',
  nextClose: '2026-06-01T20:00:00.000Z'
}

const REGULAR_MARKET_STATUS: MarketStatus = {
  isOpen: true,
  session: 'regular',
  nextOpen: '2026-05-29T13:30:00.000Z',
  nextClose: '2026-05-29T20:00:00.000Z'
}

const NOT_AVAILABLE_RESULT: IVRResult = {
  status: 'not_available',
  error: { code: 'TICKER_NOT_COVERED', message: 'missing' }
}

function okResult(
  ticker: string,
  overrides: { ivr?: number; ivp?: number; iv30?: number; observedAt?: string } = {}
): Extract<IVRResult, { status: 'ok' }> {
  return {
    status: 'ok',
    data: {
      ticker,
      ivr: 40.0,
      observedAt: '2026-05-29T21:05:00.000Z',
      source: 'barchart',
      ...overrides
    }
  }
}

/** Run the collector with the defaults every test shares — a regular-session broker
 *  and a fixed clock — varying only what the scenario is about. */
function runCollector(
  db: Database.Database,
  fetchIvr: FetchIvr,
  opts: {
    brokerProvider?: BrokerProvider | null
    clock?: TestClock
    signal?: AbortSignal
  } = {}
): ReturnType<typeof collectIVRSnapshots> {
  return collectIVRSnapshots({
    db,
    brokerProvider: opts.brokerProvider ?? makeBroker(REGULAR_MARKET_STATUS),
    logger,
    fetchIvr,
    clock: opts.clock ?? makeClock(),
    signal: opts.signal
  })
}

describe('collectIVRSnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early and logs skip when BrokerProvider reports a non-trading day', async () => {
    const db = makeTestDb()
    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>()

    const result = await runCollector(db, fetchIvr, {
      brokerProvider: makeBroker(CLOSED_WEEKEND_STATUS),
      clock: makeClock('2026-05-30T15:00:00.000Z')
    })

    expect(fetchIvr).not.toHaveBeenCalled()
    expect(result).toEqual({
      successCount: 0,
      errorCount: 0,
      skippedCount: 0,
      skippedReason: 'market_closed'
    })
    expect(vi.mocked(logger.info)).toHaveBeenCalled()
  })

  it('assumes a trading day and still collects when getMarketStatus rejects', async () => {
    // Boundary I/O must degrade + log rather than reject the whole run (CLAUDE.md
    // batch-job rule): a broker clock outage must not suppress the entire batch.
    const db = makeTestDb()
    seedWatchlist(db, ['KO'])

    const brokerProvider = {
      getAccountInfo: vi.fn(),
      getActivities: vi.fn(),
      getMarketStatus: vi.fn().mockRejectedValue(new Error('alpaca 503'))
    } as unknown as BrokerProvider
    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue(okResult('KO'))

    const result = await runCollector(db, fetchIvr, { brokerProvider })

    expect(fetchIvr).toHaveBeenCalledWith('KO')
    expect(result.successCount).toBe(1)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining('assuming trading day')
    )
  })

  it('assumes a trading day and still collects when no broker is configured', async () => {
    // The watchlist-only trader has no Alpaca credentials at all; Barchart needs none.
    const db = makeTestDb()
    seedWatchlist(db, ['KO'])
    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue(okResult('KO'))

    const result = await runCollector(db, fetchIvr, { brokerProvider: null })

    expect(fetchIvr).toHaveBeenCalledWith('KO')
    expect(result.successCount).toBe(1)
  })

  it('collects the union of open-position and watchlist tickers, distinct and sorted', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-spy-1', ticker: 'SPY' })
    insertPosition(db, { id: 'pos-spy-2', ticker: 'spy' })
    insertPosition(db, { id: 'pos-aapl-1', ticker: 'AAPL' })
    insertPosition(db, { id: 'pos-closed', ticker: 'TSLA', status: 'CLOSED' })
    seedWatchlist(db, ['KO', 'XYZ'])
    insertWatchlistTickerRaw(db, 'aapl')

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockResolvedValue(NOT_AVAILABLE_RESULT)

    await runCollector(db, fetchIvr)

    expect(fetchIvr.mock.calls.map(([ticker]) => ticker)).toEqual(['AAPL', 'KO', 'SPY', 'XYZ'])
  })

  it('collects a watchlist ticker whose only position is CLOSED, and never a closed ticker off the watchlist', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-ko-closed', ticker: 'KO', status: 'CLOSED' })
    seedWatchlist(db, ['KO'])
    // The discriminating row: CLOSED and NOT watchlisted. A plain
    // `positions UNION watchlist` (without the status filter) would collect it.
    insertPosition(db, { id: 'pos-tsla-closed', ticker: 'TSLA', status: 'CLOSED' })

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockResolvedValue(NOT_AVAILABLE_RESULT)

    await runCollector(db, fetchIvr)

    expect(fetchIvr.mock.calls.map(([ticker]) => ticker)).toEqual(['KO'])
  })

  it('fetches a ticker that is both held and watchlisted exactly once and writes one row', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-aapl', ticker: 'AAPL' })
    seedWatchlist(db, ['AAPL'])

    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue(okResult('AAPL'))

    const result = await runCollector(db, fetchIvr)

    expect(fetchIvr).toHaveBeenCalledTimes(1)
    expect(fetchIvr).toHaveBeenCalledWith('AAPL')
    expect(result.successCount).toBe(1)
    expect(listSnapshots(db)).toHaveLength(1)
  })

  it('stops collecting a ticker removed from the watchlist and keeps its prior snapshot', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['KO'])

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockResolvedValue(okResult('KO', { ivr: 38.0, observedAt: '2026-05-28T21:00:00.000Z' }))

    await runCollector(db, fetchIvr)
    expect(fetchIvr).toHaveBeenCalledWith('KO')

    removeWatchlistEntry(db, 'KO')
    fetchIvr.mockClear()
    await runCollector(db, fetchIvr)

    // Never fetched again, and the reading taken while it was still watchlisted stays
    // readable — dropping a ticker stops collection, it does not erase history.
    expect(fetchIvr).not.toHaveBeenCalled()
    expect(listSnapshots(db)).toEqual([
      {
        underlying: 'KO',
        observed_at: '2026-05-28T21:00:00.000Z',
        ivr: '38.0',
        ivp: null,
        iv30: null,
        source: 'barchart'
      }
    ])
  })

  it('counts an uncovered watchlist ticker as skipped and still succeeds for the others', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-msft', ticker: 'MSFT' })
    seedWatchlist(db, ['KO', 'XYZ'])

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockImplementation(async (ticker) =>
        ticker === 'XYZ' ? NOT_AVAILABLE_RESULT : okResult(ticker)
      )

    const result = await runCollector(db, fetchIvr)

    expect(result).toEqual({
      successCount: 2,
      errorCount: 0,
      skippedCount: 1,
      skippedReason: null
    })
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'XYZ' }),
      expect.stringContaining('ticker not covered by Barchart IVR')
    )
  })

  it('isolates a network_error on one watchlist ticker from the rest of the batch', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-msft', ticker: 'MSFT' })
    seedWatchlist(db, ['KO', 'AAPL', 'XYZ'])

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockImplementation(async (ticker) => {
        if (ticker === 'KO') {
          return {
            status: 'network_error',
            error: { code: 'NETWORK_FAILURE', message: 'socket hang up' }
          }
        }

        return okResult(ticker)
      })

    const result = await runCollector(db, fetchIvr)

    expect(fetchIvr.mock.calls.map(([ticker]) => ticker)).toEqual(['AAPL', 'KO', 'MSFT', 'XYZ'])
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO' }),
      expect.stringContaining('IVR collection failed for ticker')
    )
    expect(result).toEqual({
      successCount: 3,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    })
  })

  it('isolates a thrown fetch failure so the rest of the batch is still attempted', async () => {
    // The scraper does not return every failure as a status — `fetchIVR` parses the
    // response body outside a try, so a non-JSON body (interstitial, captcha, HTML
    // error) rejects. Without per-ticker isolation that rejection aborts the run and
    // loses every ticker after the bad one.
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-msft', ticker: 'MSFT' })
    seedWatchlist(db, ['KO', 'AAPL'])

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockImplementation(async (ticker) => {
        if (ticker === 'KO') throw new Error('Unexpected token < in JSON at position 0')
        return okResult(ticker)
      })

    const result = await runCollector(db, fetchIvr)

    expect(fetchIvr.mock.calls.map(([ticker]) => ticker)).toEqual(['AAPL', 'KO', 'MSFT'])
    expect(result).toEqual({
      successCount: 2,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    })
    // `err`, not `error` — pino serializes a thrown Error only under a configured key.
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO', err: expect.any(Error) }),
      expect.stringContaining('IVR collection threw for ticker')
    )
  })

  it('rethrows a persist failure instead of downgrading a systemic DB fault to per-ticker warns', async () => {
    // Fetch failures are per-ticker and isolated; a persistSnapshot throw is systemic
    // (read-only DB, bad migration) and must abort the run as a run-level failure, not
    // resolve as "completed with N errors".
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'KO'])
    db.exec('DROP TABLE ivr_snapshot')

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockImplementation(async (ticker) => okResult(ticker))

    await expect(runCollector(db, fetchIvr)).rejects.toThrow(/ivr_snapshot/)
    // Aborted on the first persist — the second ticker was never fetched.
    expect(fetchIvr).toHaveBeenCalledTimes(1)
  })

  it('stops at the next ticker boundary when the abort signal fires mid-run', async () => {
    const db = makeTestDb()
    seedWatchlist(db, ['AAPL', 'KO', 'MSFT'])

    const controller = new AbortController()
    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockImplementation(async (ticker) => {
        controller.abort()
        return okResult(ticker)
      })

    const result = await runCollector(db, fetchIvr, { signal: controller.signal })

    // AAPL was in flight when abort fired; KO and MSFT are never attempted.
    expect(fetchIvr.mock.calls.map(([ticker]) => ticker)).toEqual(['AAPL'])
    expect(result.successCount).toBe(1)
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ successCount: 1 }),
      expect.stringContaining('aborted')
    )
  })

  it('persists a successful Barchart snapshot as decimal strings', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-spy', ticker: 'SPY' })

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockResolvedValue(okResult('SPY', { ivr: 42.5, ivp: 50.0, iv30: 0.18 }))

    await runCollector(db, fetchIvr)

    expect(listSnapshots(db)).toEqual([
      {
        underlying: 'SPY',
        observed_at: '2026-05-29T21:05:00.000Z',
        ivr: '42.5',
        ivp: '50.0',
        iv30: '0.18',
        source: 'barchart'
      }
    ])
  })

  it('re-running on the same UTC calendar day deletes the older row before inserting the fresh row', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-spy', ticker: 'SPY' })

    db.prepare(
      `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, ivp, iv30, source)
       VALUES ('SPY', '2026-05-29T20:00:00.000Z', '30.1', '45.0', '0.22', 'barchart')`
    ).run()

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockResolvedValue(okResult('SPY', { ivr: 42.5, ivp: 50.0, iv30: 0.18 }))

    await runCollector(db, fetchIvr)

    expect(listSnapshots(db)).toEqual([
      {
        underlying: 'SPY',
        observed_at: '2026-05-29T21:05:00.000Z',
        ivr: '42.5',
        ivp: '50.0',
        iv30: '0.18',
        source: 'barchart'
      }
    ])
  })

  it('uses the UTC calendar day instead of slicing the timestamp string when overwriting', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-spy', ticker: 'SPY' })

    db.prepare(
      `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, ivp, iv30, source)
       VALUES ('SPY', '2026-05-30T01:00:00.000Z', '30.1', '45.0', '0.22', 'barchart')`
    ).run()

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockResolvedValue(okResult('SPY', { ivr: 42.5, observedAt: '2026-05-29T23:30:00-02:00' }))

    await runCollector(db, fetchIvr)

    expect(listSnapshots(db)).toEqual([
      {
        underlying: 'SPY',
        observed_at: '2026-05-29T23:30:00-02:00',
        ivr: '42.5',
        ivp: null,
        iv30: null,
        source: 'barchart'
      }
    ])
  })

  it('does not persist not_available results and logs the uncovered symbol at INFO', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-spy', ticker: 'SPY' })

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockResolvedValue(NOT_AVAILABLE_RESULT)

    const result = await runCollector(db, fetchIvr)

    expect(listSnapshots(db)).toEqual([])
    expect(result).toEqual({
      successCount: 0,
      errorCount: 0,
      skippedCount: 1,
      skippedReason: null
    })
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'SPY' }),
      expect.stringContaining('ticker not covered by Barchart IVR')
    )
  })

  it('logs parse_error and continues to the next ticker without aborting the batch', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-aapl', ticker: 'AAPL' })
    insertPosition(db, { id: 'pos-spy', ticker: 'SPY' })

    const fetchIvr = vi
      .fn<(_: string) => Promise<IVRResult>>()
      .mockImplementation(async (ticker) => {
        if (ticker === 'AAPL') {
          return {
            status: 'parse_error',
            error: {
              code: 'PARSE_FAILED',
              message: 'Expected impliedVolatilityRank1y in Barchart response',
              rawSnippet: '{"raw":{}}'
            }
          }
        }

        return okResult('SPY', { ivr: 55.5, observedAt: '2026-05-29T21:06:00.000Z' })
      })

    const result = await runCollector(db, fetchIvr)

    expect(result).toEqual({
      successCount: 1,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    })
    expect(listSnapshots(db)).toEqual([
      {
        underlying: 'SPY',
        observed_at: '2026-05-29T21:06:00.000Z',
        ivr: '55.5',
        ivp: null,
        iv30: null,
        source: 'barchart'
      }
    ])
    expect(vi.mocked(logger.warn)).toHaveBeenCalled()
  })
})
