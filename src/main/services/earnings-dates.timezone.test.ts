// [US-98] The earnings store's day comparisons must use the same Eastern basis the feed
// buckets its dates on.
//
// TZ is forced to UTC for this file because that is where the two bases diverge: for
// the last few hours of every Eastern day, a UTC host's local date is already tomorrow.
// A store that compared a stored 'YYYY-MM-DD' against a host-local midnight therefore
// judged the current Eastern day's print "already past" every evening, rejected the
// fresh read that had just been written, and dropped the last-print knowledge with it —
// so IVR freshness lost its earnings check for the rest of the day, every earnings day.
process.env.TZ = 'UTC'

import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EarningsCalendarRead } from '../integrations/finnhub-earnings'
import { makeTestDb } from '../test-utils'
import { getEarningsCalendar, type EarningsCalendarFetcher } from './earnings-dates'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// 22:00 Eastern on 2026-09-08 — already 2026-09-09 in UTC, which is the whole point.
const EASTERN_EVENING = new Date('2026-09-09T02:00:00.000Z')
const HORIZON = new Date('2026-10-28T02:00:00.000Z')

function stubFetch(read: Record<string, EarningsCalendarRead>): EarningsCalendarFetcher {
  return vi.fn(async () => read)
}

function seedRow(
  db: Database.Database,
  row: { ticker: string; next: string | null; last?: string | null; checkedAt: string }
): void {
  db.prepare(
    `INSERT INTO earnings_date (ticker, next_earnings, last_earnings, checked_through, checked_at, source)
     VALUES (?, ?, ?, '2026-10-28', ?, 'finnhub')`
  ).run(row.ticker, row.next, row.last ?? null, row.checkedAt)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('earnings store day comparisons on a host ahead of Eastern time', () => {
  it('confirms the host really is ahead of Eastern for this instant', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC')
    expect(EASTERN_EVENING.toISOString().slice(0, 10)).toBe('2026-09-09')
  })

  it('honours a fresh read whose print is today in Eastern time', async () => {
    const db = makeTestDb()
    const fetch = stubFetch({
      AAPL: { status: 'read', next: '2026-09-08', last: '2026-06-09' }
    })

    const result = await getEarningsCalendar(db, ['AAPL'], {
      horizon: HORIZON,
      now: EASTERN_EVENING,
      fetch
    })

    expect(result.get('AAPL')).toEqual({
      next: { status: 'found', date: '2026-09-08' },
      last: '2026-06-09'
    })
  })

  it('serves a stored print dated today rather than demoting it to unavailable', async () => {
    const db = makeTestDb()
    seedRow(db, { ticker: 'KO', next: '2026-09-08', checkedAt: '2026-09-09T00:00:00.000Z' })
    const fetch = stubFetch({})

    const result = await getEarningsCalendar(db, ['KO'], {
      horizon: HORIZON,
      now: EASTERN_EVENING,
      fetch
    })

    expect(fetch).not.toHaveBeenCalled()
    expect(result.get('KO')?.next).toEqual({ status: 'found', date: '2026-09-08' })
  })
})

describe('last-print knowledge the store already holds', () => {
  // The stale-high case US-98 exists to prevent: the print happened, the collector's
  // print-day run failed, and the refetch floor blocks a refresh that would re-learn it.
  it('surfaces a passed next_earnings as the last print when no refresh runs', async () => {
    const db = makeTestDb()
    const morningAfter = new Date('2026-09-09T13:35:00.000Z')
    seedRow(db, { ticker: 'KO', next: '2026-09-08', checkedAt: '2026-09-09T02:00:00.000Z' })
    const fetch = stubFetch({})

    const result = await getEarningsCalendar(db, ['KO'], {
      horizon: HORIZON,
      now: morningAfter,
      fetch
    })

    expect(fetch).not.toHaveBeenCalled()
    // It can no longer answer the *next*-print question, and says so...
    expect(result.get('KO')?.next).toEqual({ status: 'unavailable' })
    // ...but the print it recorded is still knowledge the freshness engine needs.
    expect(result.get('KO')?.last).toBe('2026-09-08')
  })

  it('prefers whichever of the stored last and passed next print is more recent', async () => {
    const db = makeTestDb()
    const morningAfter = new Date('2026-09-09T13:35:00.000Z')
    seedRow(db, {
      ticker: 'KO',
      next: '2026-09-08',
      last: '2026-06-09',
      checkedAt: '2026-09-09T02:00:00.000Z'
    })

    const result = await getEarningsCalendar(db, ['KO'], {
      horizon: HORIZON,
      now: morningAfter,
      fetch: stubFetch({})
    })

    expect(result.get('KO')?.last).toBe('2026-09-08')
  })

  it('still discards stored history when a refresh was attempted and failed', async () => {
    const db = makeTestDb()
    const weekLater = new Date('2026-09-16T13:35:00.000Z')
    seedRow(db, {
      ticker: 'KO',
      next: '2026-09-08',
      last: '2026-06-09',
      checkedAt: '2026-09-09T02:00:00.000Z'
    })

    const result = await getEarningsCalendar(db, ['KO'], {
      horizon: HORIZON,
      now: weekLater,
      fetch: stubFetch({ KO: { status: 'unavailable' } })
    })

    expect(result.get('KO')?.last).toBeUndefined()
  })
})
