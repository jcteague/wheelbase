// [US-98] trading-calendar-store — the cached exchange calendar behind IVR freshness.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { getTradingSession } from '../core/trading-calendar'
import type { BrokerProvider, MarketCalendarDay } from '../integrations/broker-provider'
import { makeTestDb, seedTradingCalendar } from '../test-utils'
import { logger } from '../logger'
import { readTradingCalendar, refreshTradingCalendar } from './trading-calendar-store'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const NOW = new Date('2026-09-23T14:00:00.000Z')

function brokerReturning(days: MarketCalendarDay[]): BrokerProvider {
  return {
    getAccountInfo: vi.fn(),
    getActivities: vi.fn(),
    getMarketStatus: vi.fn(),
    getMarketCalendar: vi.fn().mockResolvedValue(days)
  } as unknown as BrokerProvider
}

function storedRow(db: Database.Database, date: string): { close_at: string | null } | undefined {
  return db.prepare('SELECT close_at FROM trading_session WHERE date = ?').get(date) as
    | { close_at: string | null }
    | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readTradingCalendar', () => {
  it('reads sessions and treats a stored day with no session as closed', () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2026-09-25', { closures: ['2026-09-07'] })

    const calendar = readTradingCalendar(db, NOW)

    expect(getTradingSession(calendar, '2026-09-08').status).toBe('open')
    expect(getTradingSession(calendar, '2026-09-07')).toEqual({ status: 'closed' })
    expect(getTradingSession(calendar, '2026-09-05')).toEqual({ status: 'closed' })
  })

  it('reports a day it never fetched as unavailable rather than closed', () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2026-09-25')

    // Inside the read window but outside what was ever stored.
    expect(getTradingSession(readTradingCalendar(db, NOW), '2026-08-31')).toEqual({
      status: 'unavailable'
    })
  })

  it('knows nothing, and says so, when the calendar has never been fetched', () => {
    const db = makeTestDb()

    expect(readTradingCalendar(db, NOW).sessions).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ today: '2026-09-23' }),
      expect.stringContaining('never been fetched')
    )
  })

  it('warns and reports nothing when stored coverage has run out before today', () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-06-01', '2026-06-30')

    expect(readTradingCalendar(db, NOW).sessions).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ today: '2026-09-23' }),
      expect.stringContaining('does not cover today')
    )
  })

  it('warns while coverage is merely running low, before freshness stops working', () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2026-10-05')

    expect(readTradingCalendar(db, NOW).sessions.length).toBeGreaterThan(0)
    expect(logger.warn).toHaveBeenCalledWith(
      { lastDay: '2026-10-05' },
      expect.stringContaining('nearly exhausted')
    )
  })

  it('bounds the loaded window so an ancient snapshot cannot widen the scan', () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2025-01-01', '2026-12-31')

    const calendar = readTradingCalendar(db, NOW)

    expect(calendar.firstDay).toBe('2026-08-09')
    expect(calendar.lastDay).toBe('2026-09-25')
    expect(calendar.sessions.length).toBeLessThan(40)
  })

  it('degrades to knowing nothing when the read itself fails', () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2026-09-25')
    vi.spyOn(db, 'prepare').mockImplementation(() => {
      throw new Error('database is locked')
    })

    expect(readTradingCalendar(db, NOW).sessions).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'trading_calendar_read_failed'
    )
  })
})

describe('refreshTradingCalendar', () => {
  it('writes a row for every day, recording closures as a null close', async () => {
    const db = makeTestDb()
    const broker = brokerReturning([
      { date: '2026-09-22', close: '16:00' },
      { date: '2026-09-23', close: '13:00' }
    ])

    const result = await refreshTradingCalendar(db, broker, NOW)

    expect(result.status).toBe('refreshed')
    expect(storedRow(db, '2026-09-22')?.close_at).toBe('2026-09-22T20:00:00.000Z')
    // An early close is just an earlier instant — nothing derives 16:00.
    expect(storedRow(db, '2026-09-23')?.close_at).toBe('2026-09-23T17:00:00.000Z')
    expect(storedRow(db, '2026-09-24')?.close_at).toBeNull()
  })

  it('requests a window around now and reads back through the core engine', async () => {
    const db = makeTestDb()
    const broker = brokerReturning([{ date: '2026-09-22', close: '16:00' }])

    await refreshTradingCalendar(db, broker, NOW)

    expect(broker.getMarketCalendar).toHaveBeenCalledWith({
      start: '2026-05-26',
      end: '2027-10-28'
    })
    expect(getTradingSession(readTradingCalendar(db, NOW), '2026-09-22')).toMatchObject({
      status: 'open',
      session: { closeAt: '2026-09-22T20:00:00.000Z' }
    })
  })

  it('leaves the cache untouched and reports failure when the broker is down', async () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2027-09-25')
    const broker = brokerReturning([])
    vi.mocked(broker.getMarketCalendar).mockRejectedValue(new Error('network error'))

    expect(await refreshTradingCalendar(db, broker, NOW, { force: true })).toEqual({
      status: 'failed'
    })
    expect(storedRow(db, '2026-09-22')?.close_at).toBe('2026-09-22T20:00:00.000Z')
  })

  it('skips the fetch while stored coverage still reaches far enough ahead', async () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2027-11-01')
    const broker = brokerReturning([])

    expect(await refreshTradingCalendar(db, broker, NOW)).toEqual({ status: 'skipped' })
    expect(broker.getMarketCalendar).not.toHaveBeenCalled()
  })

  it('drops a published session it cannot parse instead of writing a bad instant', async () => {
    const db = makeTestDb()
    const broker = brokerReturning([
      { date: '2026-09-22', close: 'not-a-time' },
      { date: '2026-09-23', close: '16:00' }
    ])

    await refreshTradingCalendar(db, broker, NOW)

    expect(storedRow(db, '2026-09-22')?.close_at).toBeNull()
    expect(storedRow(db, '2026-09-23')?.close_at).toBe('2026-09-23T20:00:00.000Z')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ day: { date: '2026-09-22', close: 'not-a-time' } }),
      'trading_calendar_unparseable_session'
    )
  })
})
