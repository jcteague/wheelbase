// [US-100] The single-ticker collection path a watchlist add or a new position fires.
//
// Every test here pins a guarantee the callers depend on but cannot observe: `collect`
// is detached with `void`, so a rejection would become an unhandled rejection and the
// add it was fired from would look broken for a reason the trader could not see.
import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IVRResult } from '../integrations/barchart-ivr-scraper'
import type { MarketCalendarSource } from '../integrations/market-data-provider'
import { logger } from '../logger'
import {
  makeTestDb,
  seedTradingCalendar,
  seedWatchlist,
  weekdayCalendarFetcher
} from '../test-utils'
import { createIvrOnDemand, type IvrOnDemand } from './ivr-on-demand'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

/** Friday 2026-05-29 21:30Z — after the 20:00Z close, so Friday is the current session. */
const FRIDAY_EVENING = '2026-05-29T21:30:00.000Z'
const FRIDAY_CLOSE = '2026-05-29T20:00:00.000Z'
const THURSDAY_CLOSE = '2026-05-28T20:00:00.000Z'
/** Sunday — no session of its own, so the reading still belongs to Friday. */
const SUNDAY = '2026-05-31T15:00:00.000Z'

function makeDb(): Database.Database {
  const db = makeTestDb()
  seedTradingCalendar(db, '2026-01-01', '2026-12-31')
  return db
}

function okResult(ticker: string, ivr = 40.0, observedAt = FRIDAY_EVENING): IVRResult {
  return { status: 'ok', data: { ticker, ivr, observedAt, source: 'barchart' } }
}

function insertSnapshot(
  db: Database.Database,
  ticker: string,
  observedAt: string,
  ivr = '30.1'
): void {
  db.prepare(
    `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, ivp, iv30, source)
     VALUES (?, ?, ?, NULL, NULL, 'barchart')`
  ).run(ticker, observedAt, ivr)
}

function listSnapshots(
  db: Database.Database
): Array<{ underlying: string; observed_at: string; ivr: string }> {
  return db
    .prepare(
      `SELECT underlying, observed_at, ivr FROM ivr_snapshot ORDER BY underlying, observed_at`
    )
    .all() as Array<{ underlying: string; observed_at: string; ivr: string }>
}

/** Serves the same weekday calendar the seeded cache holds, so the refresh
 *  `ensureTradingCalendar` performs rewrites it with identical content rather than
 *  emptying it. */
function stubProvider(): () => MarketCalendarSource {
  return () => ({ getMarketCalendar: weekdayCalendarFetcher() })
}

type PortHarness = {
  port: IvrOnDemand
  fetchIvr: ReturnType<typeof vi.fn>
  onCollected: ReturnType<typeof vi.fn>
}

function makePort(
  db: Database.Database,
  opts: {
    fetchIvr?: (ticker: string) => Promise<IVRResult>
    now?: string
    getProvider?: () => MarketCalendarSource
    onCollected?: (ticker: string) => void
  } = {}
): PortHarness {
  const fetchIvr = vi.fn(opts.fetchIvr ?? (async (t: string) => okResult(t)))
  const onCollected = vi.fn(opts.onCollected)
  const port = createIvrOnDemand({
    db,
    logger,
    getProvider: opts.getProvider ?? stubProvider(),
    fetchIvr,
    clock: { now: () => new Date(opts.now ?? FRIDAY_EVENING) },
    onCollected
  })
  return { port, fetchIvr, onCollected }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createIvrOnDemand', () => {
  it('collects a ticker that has never been read, stamped at the session close', async () => {
    const db = makeDb()
    const { port, fetchIvr, onCollected } = makePort(db)

    await port.collect('aapl')

    expect(fetchIvr).toHaveBeenCalledTimes(1)
    expect(fetchIvr).toHaveBeenCalledWith('AAPL')
    expect(listSnapshots(db)).toEqual([
      { underlying: 'AAPL', observed_at: FRIDAY_CLOSE, ivr: '40.0' }
    ])
    expect(onCollected).toHaveBeenCalledWith('AAPL')
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL' }),
      'ivr_on_demand_collected'
    )
  })

  it('never touches the batch targets', async () => {
    const db = makeDb()
    seedWatchlist(db, ['KO'])
    db.prepare(
      `INSERT INTO positions (id, ticker, strategy_type, status, phase, opened_date, created_at, updated_at)
       VALUES ('p1', 'MSFT', 'WHEEL', 'ACTIVE', 'CSP_OPEN', '2026-05-01', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')`
    ).run()
    const { port, fetchIvr } = makePort(db)

    await port.collect('AAPL')

    expect(fetchIvr.mock.calls.flat()).toEqual(['AAPL'])
  })

  it('does not refetch a ticker already read for the current trading day', async () => {
    const db = makeDb()
    insertSnapshot(db, 'AAPL', FRIDAY_CLOSE, '33.3')
    // Sunday: the current trading day is still Friday, so Friday's row counts as today's.
    const { port, fetchIvr, onCollected } = makePort(db, { now: SUNDAY })

    await port.collect('AAPL')

    expect(fetchIvr).not.toHaveBeenCalled()
    expect(listSnapshots(db)).toEqual([
      { underlying: 'AAPL', observed_at: FRIDAY_CLOSE, ivr: '33.3' }
    ])
    expect(onCollected).not.toHaveBeenCalled()
    expect(vi.mocked(logger.debug)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL' }),
      'ivr_on_demand_already_collected'
    )
  })

  it('refetches when the only reading belongs to the previous session', async () => {
    const db = makeDb()
    insertSnapshot(db, 'AAPL', THURSDAY_CLOSE, '33.3')
    const { port, fetchIvr } = makePort(db)

    await port.collect('AAPL')

    expect(fetchIvr).toHaveBeenCalledWith('AAPL')
    expect(listSnapshots(db).map((r) => r.observed_at)).toEqual([THURSDAY_CLOSE, FRIDAY_CLOSE])
  })

  it('falls back to ET-date equality when no calendar is available', async () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-05-29T18:00:00.000Z', '33.3')
    const throwingProvider = (): MarketCalendarSource => {
      throw new Error('no market-data credentials')
    }
    const { port, fetchIvr } = makePort(db, { getProvider: throwingProvider })

    await port.collect('AAPL')

    // Same ET day as the Friday-evening clock, so it still counts as collected.
    expect(fetchIvr).not.toHaveBeenCalled()
  })

  it('collects and stores unstamped when no calendar is available and the reading is older', async () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-05-28T18:00:00.000Z', '33.3')
    const throwingProvider = (): MarketCalendarSource => {
      throw new Error('no market-data credentials')
    }
    const { port, fetchIvr } = makePort(db, { getProvider: throwingProvider })

    await port.collect('AAPL')

    expect(fetchIvr).toHaveBeenCalledWith('AAPL')
    expect(listSnapshots(db).map((r) => r.observed_at)).toEqual([
      '2026-05-28T18:00:00.000Z',
      FRIDAY_EVENING
    ])
  })

  it('resolves and warns when the fetch throws', async () => {
    const db = makeDb()
    const { port, fetchIvr, onCollected } = makePort(db, {
      fetchIvr: async () => {
        throw new Error('boom')
      }
    })

    await expect(port.collect('AAPL')).resolves.toBeUndefined()

    expect(fetchIvr).toHaveBeenCalled()
    expect(listSnapshots(db)).toEqual([])
    expect(onCollected).not.toHaveBeenCalled()
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL', err: expect.any(Error) }),
      expect.stringContaining('IVR collection threw for ticker')
    )
  })

  it('resolves and warns when the scraper reports a network error', async () => {
    const db = makeDb()
    const { port, onCollected } = makePort(db, {
      fetchIvr: async () => ({
        status: 'network_error',
        error: { code: 'NETWORK_FAILURE', message: 'unreachable' }
      })
    })

    await expect(port.collect('AAPL')).resolves.toBeUndefined()

    expect(listSnapshots(db)).toEqual([])
    expect(onCollected).not.toHaveBeenCalled()
    expect(vi.mocked(logger.warn)).toHaveBeenCalled()
  })

  it('resolves and logs at info when Barchart does not cover the ticker', async () => {
    const db = makeDb()
    const { port, onCollected } = makePort(db, {
      fetchIvr: async () => ({
        status: 'not_available',
        error: { code: 'TICKER_NOT_COVERED', message: 'no coverage' }
      })
    })

    await expect(port.collect('XYZ')).resolves.toBeUndefined()

    expect(listSnapshots(db)).toEqual([])
    expect(onCollected).not.toHaveBeenCalled()
    expect(vi.mocked(logger.info)).toHaveBeenCalledWith({ ticker: 'XYZ' }, expect.any(String))
  })

  it('resolves and logs an error when the write fails', async () => {
    const db = makeDb()
    const { port, onCollected } = makePort(db)
    db.exec('DROP TABLE ivr_snapshot')

    await expect(port.collect('AAPL')).resolves.toBeUndefined()

    expect(onCollected).not.toHaveBeenCalled()
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'AAPL', err: expect.any(Error) }),
      'ivr_on_demand_failed'
    )
  })

  it('fetches the calendar before resolving the stamp on a fresh install', async () => {
    // No seeded calendar: without awaiting ensureTradingCalendar the reading would be
    // written at the raw fetch instant and render as unassessable on the bench.
    const db = makeTestDb()
    const getMarketCalendar = vi.fn().mockResolvedValue([
      { date: '2026-05-28', close: '16:00' },
      { date: '2026-05-29', close: '16:00' }
    ])
    const { port } = makePort(db, { getProvider: () => ({ getMarketCalendar }) })

    await port.collect('AAPL')

    expect(getMarketCalendar).toHaveBeenCalled()
    expect(listSnapshots(db).map((r) => r.observed_at)).toEqual([FRIDAY_CLOSE])
  })

  it('uses the wall clock when no clock is injected', async () => {
    // No calendar and no clock: the stamp falls back to the fetch instant, so the
    // assertion does not depend on what today happens to be.
    const db = makeTestDb()
    const fetchIvr = vi.fn(async () => okResult('AAPL'))

    await createIvrOnDemand({
      db,
      logger,
      getProvider: () => {
        throw new Error('no market-data credentials')
      },
      fetchIvr
    }).collect('AAPL')

    expect(fetchIvr).toHaveBeenCalledWith('AAPL')
    expect(listSnapshots(db).map((r) => r.observed_at)).toEqual([FRIDAY_EVENING])
  })
})
