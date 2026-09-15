// [US-98] trading-calendar-store — the cached exchange calendar behind IVR freshness.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { getTradingSession } from '../core/trading-calendar'
import type { MarketCalendarDay, MarketCalendarSource } from '../integrations/market-data-provider'
import { makeTestDb, seedTradingCalendar } from '../test-utils'
import { logger } from '../logger'
import {
  ensureTradingCalendar,
  readTradingCalendar,
  refreshTradingCalendar
} from './trading-calendar-store'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const NOW = new Date('2026-09-23T14:00:00.000Z')

function providerReturning(days: MarketCalendarDay[]): MarketCalendarSource {
  return { getMarketCalendar: vi.fn().mockResolvedValue(days) }
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
    const provider = providerReturning([
      { date: '2026-09-22', close: '16:00' },
      { date: '2026-09-23', close: '13:00' }
    ])

    const result = await refreshTradingCalendar(db, provider, NOW)

    expect(result.status).toBe('refreshed')
    expect(storedRow(db, '2026-09-22')?.close_at).toBe('2026-09-22T20:00:00.000Z')
    // An early close is just an earlier instant — nothing derives 16:00.
    expect(storedRow(db, '2026-09-23')?.close_at).toBe('2026-09-23T17:00:00.000Z')
    expect(storedRow(db, '2026-09-24')?.close_at).toBeNull()
  })

  it('requests a window around now and reads back through the core engine', async () => {
    const db = makeTestDb()
    const provider = providerReturning([{ date: '2026-09-22', close: '16:00' }])

    await refreshTradingCalendar(db, provider, NOW)

    expect(provider.getMarketCalendar).toHaveBeenCalledWith({
      start: '2026-05-26',
      end: '2027-10-28'
    })
    expect(getTradingSession(readTradingCalendar(db, NOW), '2026-09-22')).toMatchObject({
      status: 'open',
      session: { closeAt: '2026-09-22T20:00:00.000Z' }
    })
  })

  it('leaves the cache untouched and reports failure when the provider is down', async () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2027-09-25')
    const provider = providerReturning([])
    vi.mocked(provider.getMarketCalendar).mockRejectedValue(new Error('network error'))

    expect(await refreshTradingCalendar(db, provider, NOW, { force: true })).toEqual({
      status: 'failed'
    })
    expect(storedRow(db, '2026-09-22')?.close_at).toBe('2026-09-22T20:00:00.000Z')
  })

  it('skips the fetch while stored coverage still reaches far enough ahead', async () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2027-11-01')
    const provider = providerReturning([])

    expect(await refreshTradingCalendar(db, provider, NOW)).toEqual({ status: 'skipped' })
    expect(provider.getMarketCalendar).not.toHaveBeenCalled()
  })

  it('drops a published session it cannot parse instead of writing a bad instant', async () => {
    const db = makeTestDb()
    const provider = providerReturning([
      { date: '2026-09-22', close: 'not-a-time' },
      { date: '2026-09-23', close: '16:00' }
    ])

    await refreshTradingCalendar(db, provider, NOW)

    expect(storedRow(db, '2026-09-22')?.close_at).toBeNull()
    expect(storedRow(db, '2026-09-23')?.close_at).toBe('2026-09-23T20:00:00.000Z')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ day: { date: '2026-09-22', close: 'not-a-time' } }),
      'trading_calendar_unparseable_session'
    )
  })
})

// [US-116] ensureTradingCalendar — the write path the bench calls on the read it serves,
// so a fresh install does not wait for the nightly collection.
describe('ensureTradingCalendar', () => {
  it('fetches once and stores the full refresh window when the calendar is empty', async () => {
    const db = makeTestDb()
    const provider = providerReturning([{ date: '2026-09-22', close: '16:00' }])

    await ensureTradingCalendar(db, () => provider, NOW)

    expect(provider.getMarketCalendar).toHaveBeenCalledTimes(1)
    expect(provider.getMarketCalendar).toHaveBeenCalledWith({
      start: '2026-05-26',
      end: '2027-10-28'
    })
    expect(storedRow(db, '2026-05-26')).toBeDefined()
    expect(storedRow(db, '2027-10-28')).toBeDefined()
    expect(storedRow(db, '2026-09-22')?.close_at).toBe('2026-09-22T20:00:00.000Z')
  })

  it('does not fetch while stored coverage still reaches far enough ahead', async () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2027-11-01')
    const provider = providerReturning([])

    await ensureTradingCalendar(db, () => provider, NOW)

    expect(provider.getMarketCalendar).not.toHaveBeenCalled()
  })

  it('shares one in-flight fetch between concurrent callers', async () => {
    const db = makeTestDb()
    let release: (days: MarketCalendarDay[]) => void = () => {}
    const pending = new Promise<MarketCalendarDay[]>((resolve) => {
      release = resolve
    })
    const provider: MarketCalendarSource = { getMarketCalendar: vi.fn().mockReturnValue(pending) }

    const first = ensureTradingCalendar(db, () => provider, NOW)
    const second = ensureTradingCalendar(db, () => provider, NOW)
    release([{ date: '2026-09-22', close: '16:00' }])
    await Promise.all([first, second])

    expect(provider.getMarketCalendar).toHaveBeenCalledTimes(1)
  })

  it('is free to fetch again once the previous attempt has settled', async () => {
    const db = makeTestDb()
    const provider = providerReturning([])
    vi.mocked(provider.getMarketCalendar).mockRejectedValue(new Error('network error'))

    await ensureTradingCalendar(db, () => provider, NOW)
    await ensureTradingCalendar(db, () => provider, NOW)

    expect(provider.getMarketCalendar).toHaveBeenCalledTimes(2)
  })

  it('resolves and warns when the provider cannot be constructed', async () => {
    const db = makeTestDb()

    await expect(
      ensureTradingCalendar(
        db,
        () => {
          throw new Error('Alpaca credentials not configured')
        },
        NOW
      )
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      'trading_calendar_provider_unavailable'
    )
  })

  it('resolves, warns and leaves stored rows untouched when the fetch fails', async () => {
    const db = makeTestDb()
    seedTradingCalendar(db, '2026-09-01', '2026-09-25')
    const provider = providerReturning([])
    vi.mocked(provider.getMarketCalendar).mockRejectedValue(new Error('network error'))

    await expect(ensureTradingCalendar(db, () => provider, NOW)).resolves.toBeUndefined()

    expect(storedRow(db, '2026-09-22')?.close_at).toBe('2026-09-22T20:00:00.000Z')
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      'trading_calendar_refresh_failed'
    )
  })
})
