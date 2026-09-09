// [US-65] ivr-snapshots — read path for the latest IVR per underlying
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { makeTestDb, makeTradingCalendar } from '../test-utils'
import { logger } from '../logger'
import { getAssessedIvrByUnderlying, getLatestIvrByUnderlying } from './ivr-snapshots'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const NOW = new Date('2026-09-23T14:00:00.000Z')
const CALENDAR = makeTradingCalendar('2026-08-24', '2026-09-24', { closures: ['2026-09-07'] })

beforeEach(() => {
  vi.clearAllMocks()
})

function insertSnapshot(
  db: Database.Database,
  underlying: string,
  observedAt: string,
  ivr: string
): void {
  db.prepare(
    `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, source)
     VALUES (?, ?, ?, 'barchart')`
  ).run(underlying, observedAt, ivr)
}

describe('getLatestIvrByUnderlying', () => {
  it('returns the most recently observed ivr when a ticker has several snapshots', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-03T20:00:00.000Z', '38.0')
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    expect(getLatestIvrByUnderlying(db, ['AAPL'])).toEqual(
      new Map([['AAPL', { value: '44.0', observedAt: '2026-08-05T20:00:00.000Z' }]])
    )
  })

  it('carries the observation time so callers can judge how stale the reading is', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    expect(getLatestIvrByUnderlying(db, ['AAPL']).get('AAPL')?.observedAt).toBe(
      '2026-08-05T20:00:00.000Z'
    )
  })

  it('omits an underlying that has no snapshot rather than mapping it to null or zero', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    const ivrs = getLatestIvrByUnderlying(db, ['AAPL', 'MSFT'])

    expect(ivrs.has('MSFT')).toBe(false)
    expect(ivrs.size).toBe(1)
  })

  it('upper-cases the requested underlying to match how the collector stores it', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'AAPL', '2026-08-05T20:00:00.000Z', '44.0')

    expect(getLatestIvrByUnderlying(db, ['aapl'])).toEqual(
      new Map([['AAPL', { value: '44.0', observedAt: '2026-08-05T20:00:00.000Z' }]])
    )
  })

  it('returns an empty map without preparing a statement when no underlyings are requested', () => {
    const db = makeTestDb()
    const prepare = vi.spyOn(db, 'prepare')

    expect(getLatestIvrByUnderlying(db, [])).toEqual(new Map())
    expect(prepare).not.toHaveBeenCalled()
  })
})

describe('getAssessedIvrByUnderlying', () => {
  it('assesses the latest raw row with supplied clock, calendar and earnings knowledge', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'KO', '2026-09-18T21:00:00.000Z', '58.0')

    expect(
      getAssessedIvrByUnderlying(db, ['KO'], {
        now: NOW,
        calendar: CALENDAR,
        lastEarnings: new Map([['KO', undefined]])
      }).get('KO')
    ).toMatchObject({ state: 'aging', ageTradingDays: 2 })
  })

  it('preserves a zero reading and reports a ticker with no snapshot as unknown', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'KO', '2026-09-22T21:00:00.000Z', '0.0')

    const result = getAssessedIvrByUnderlying(db, ['KO', 'MSFT'], {
      now: NOW,
      calendar: CALENDAR,
      lastEarnings: new Map()
    })

    expect(result.get('KO')).toMatchObject({ value: '0.0', state: 'fresh' })
    expect(result.get('MSFT')).toBeNull()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns rather than silently dropping a row it holds but cannot read', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'KO', '2026-09-22T21:00:00.000Z', 'not-a-number')

    const result = getAssessedIvrByUnderlying(db, ['KO'], {
      now: NOW,
      calendar: CALENDAR,
      lastEarnings: new Map()
    })

    expect(result.get('KO')).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO' }),
      'ivr_assessment_unreadable_snapshot'
    )
  })

  it('treats a reading the calendar cannot reach as unreadable, not as absent', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'KO', '2026-05-01T20:00:00.000Z', '58.0')

    expect(
      getAssessedIvrByUnderlying(db, ['KO'], {
        now: NOW,
        calendar: CALENDAR,
        lastEarnings: new Map()
      }).get('KO')
    ).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO' }),
      'ivr_assessment_unreadable_snapshot'
    )
  })

  it('does not perform any scraper or earnings I/O', () => {
    const db = makeTestDb()
    insertSnapshot(db, 'KO', '2026-09-22T21:00:00.000Z', '58.0')

    expect(
      getAssessedIvrByUnderlying(db, ['KO'], {
        now: NOW,
        calendar: CALENDAR,
        lastEarnings: new Map([['KO', '2026-09-01']])
      }).get('KO')
    ).toMatchObject({ state: 'fresh' })
  })
})
