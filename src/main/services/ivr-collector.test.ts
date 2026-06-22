import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrokerProvider, MarketStatus } from '../integrations/broker-provider'
import type { IVRResult } from '../integrations/barchart-ivr-scraper'
import { logger } from '../logger'
import { makeTestDb } from '../test-utils'
import { collectIVRSnapshots } from './ivr-collector'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

type TestClock = {
  now: () => Date
  sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>
}

function makeBroker(status: MarketStatus): BrokerProvider {
  return {
    getAccountInfo: vi.fn(),
    getActivities: vi.fn(),
    getMarketStatus: vi.fn().mockResolvedValue(status)
  } as unknown as BrokerProvider
}

function makeClock(now = '2026-05-29T21:30:00.000Z'): TestClock {
  return {
    now: () => new Date(now),
    sleep: vi.fn().mockResolvedValue(undefined)
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

describe('collectIVRSnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early and logs skip when BrokerProvider reports a non-trading day', async () => {
    const db = makeTestDb()
    const brokerProvider = makeBroker(CLOSED_WEEKEND_STATUS)
    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>()

    const result = await collectIVRSnapshots({
      db,
      brokerProvider,
      logger,
      fetchIvr,
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

  it('selects distinct active-position tickers only and spaces requests by at least 1 second', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-spy-1', ticker: 'SPY' })
    insertPosition(db, { id: 'pos-spy-2', ticker: 'spy' })
    insertPosition(db, { id: 'pos-aapl-1', ticker: 'AAPL' })
    insertPosition(db, { id: 'pos-closed', ticker: 'TSLA', status: 'CLOSED' })

    const clock = makeClock()
    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue({
      status: 'not_available',
      error: { code: 'TICKER_NOT_COVERED', message: 'missing' }
    })

    await collectIVRSnapshots({
      db,
      brokerProvider: makeBroker(REGULAR_MARKET_STATUS),
      logger,
      fetchIvr,
      clock
    })

    expect(fetchIvr.mock.calls.map(([ticker]) => ticker)).toEqual(['AAPL', 'SPY'])
    expect(clock.sleep).toHaveBeenCalledTimes(1)
    expect(clock.sleep).toHaveBeenCalledWith(1000)
  })

  it('persists a successful Barchart snapshot as decimal strings', async () => {
    const db = makeTestDb()
    insertPosition(db, { id: 'pos-spy', ticker: 'SPY' })

    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue({
      status: 'ok',
      data: {
        ticker: 'SPY',
        ivr: 42.5,
        ivp: 50.0,
        iv30: 0.18,
        observedAt: '2026-05-29T21:05:00.000Z',
        source: 'barchart'
      }
    })

    await collectIVRSnapshots({
      db,
      brokerProvider: makeBroker(REGULAR_MARKET_STATUS),
      logger,
      fetchIvr,
      clock: makeClock()
    })

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

    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue({
      status: 'ok',
      data: {
        ticker: 'SPY',
        ivr: 42.5,
        ivp: 50.0,
        iv30: 0.18,
        observedAt: '2026-05-29T21:05:00.000Z',
        source: 'barchart'
      }
    })

    await collectIVRSnapshots({
      db,
      brokerProvider: makeBroker(REGULAR_MARKET_STATUS),
      logger,
      fetchIvr,
      clock: makeClock()
    })

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

    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue({
      status: 'ok',
      data: {
        ticker: 'SPY',
        ivr: 42.5,
        observedAt: '2026-05-29T23:30:00-02:00',
        source: 'barchart'
      }
    })

    await collectIVRSnapshots({
      db,
      brokerProvider: makeBroker(REGULAR_MARKET_STATUS),
      logger,
      fetchIvr,
      clock: makeClock()
    })

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

    const fetchIvr = vi.fn<(_: string) => Promise<IVRResult>>().mockResolvedValue({
      status: 'not_available',
      error: {
        code: 'TICKER_NOT_COVERED',
        message: 'Barchart has no options data for SPY'
      }
    })

    const result = await collectIVRSnapshots({
      db,
      brokerProvider: makeBroker(REGULAR_MARKET_STATUS),
      logger,
      fetchIvr,
      clock: makeClock()
    })

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

        return {
          status: 'ok',
          data: {
            ticker: 'SPY',
            ivr: 55.5,
            observedAt: '2026-05-29T21:06:00.000Z',
            source: 'barchart'
          }
        }
      })

    const result = await collectIVRSnapshots({
      db,
      brokerProvider: makeBroker(REGULAR_MARKET_STATUS),
      logger,
      fetchIvr,
      clock: makeClock()
    })

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
