// [US-65/US-121] ivr-snapshots — the IV-rank read path: the stored IV30 series assessed for
// freshness, or — when there is no publishable reading — the display-only reason it is absent.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import {
  makeTestDb,
  makeTradingCalendar,
  seedIv30Series,
  seedRankedIv30Series
} from '../test-utils'
import { logger } from '../logger'
import { createIvRunState, type IvRunState } from './iv-run-state'
import { readIvMetricsByUnderlying } from './iv-history-read'
import { absenceFor, lookupOf, readIvRankLookup } from './ivr-snapshots'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('./iv-history-read', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./iv-history-read')>()
  return { ...actual, readIvMetricsByUnderlying: vi.fn(actual.readIvMetricsByUnderlying) }
})

/** Wednesday 2026-09-23 10:00 ET — Tuesday 09-22 is the newest completed session. */
const NOW = new Date('2026-09-23T14:00:00.000Z')
const CALENDAR = makeTradingCalendar('2025-06-01', '2026-12-31')

beforeEach(() => {
  vi.clearAllMocks()
})

function lookup(
  db: Database.Database,
  tickers: string[],
  opts: { runState?: IvRunState; lastEarnings?: Map<string, string | null | undefined> } = {}
): ReturnType<typeof readIvRankLookup> {
  return readIvRankLookup(db, tickers, {
    now: NOW,
    calendar: CALENDAR,
    lastEarnings: opts.lastEarnings ?? new Map(),
    runState: opts.runState ?? createIvRunState()
  })
}

/** 150 window sessions with a reading, plus the anchor — below the 200-session gate. */
function seedSparseSeries(db: Database.Database, ticker: string): void {
  const sessions = CALENDAR.sessions.map((s) => s.date).filter((d) => d <= '2026-09-22')
  seedIv30Series(
    db,
    ticker,
    sessions.slice(-151).map((session) => [session, '0.2500'])
  )
}

describe('absenceFor', () => {
  it.each([
    ['pending', { status: 'insufficient', coverage: 150 }, { reason: 'pending' }],
    ['no_market_data', { status: 'none' }, { reason: 'no_market_data' }],
    ['failed', { status: 'insufficient', coverage: 150 }, { reason: 'failed' }],
    [
      undefined,
      { status: 'insufficient', coverage: 150 },
      { reason: 'insufficient_history', coverage: 150, window: 252, required: 200 }
    ],
    [undefined, { status: 'none' }, { reason: 'not_collected' }]
  ] as const)('(%s, %o) → %o', (runStatus, read, expected) => {
    expect(absenceFor(runStatus, read)).toEqual(expected)
  })
})

describe('lookupOf', () => {
  it('answers for a ticker the read never saw as not_collected, whatever its case', () => {
    const db = makeTestDb()
    const runState = createIvRunState()
    runState.markPending('KO')
    const lookups = lookup(db, ['KO'], { runState })

    expect(lookupOf(lookups, 'ko')).toEqual({ reading: null, absence: { reason: 'pending' } })
    expect(lookupOf(lookups, 'XYZ')).toEqual({
      reading: null,
      absence: { reason: 'not_collected' }
    })
  })
})

describe('readIvRankLookup', () => {
  it('reports not_collected for a ticker with no readings and no run', () => {
    const db = makeTestDb()

    expect(lookup(db, ['KO']).get('KO')).toEqual({
      reading: null,
      absence: { reason: 'not_collected' }
    })
  })

  it('publishes an assessed reading carrying percentile and range', () => {
    const db = makeTestDb()
    seedRankedIv30Series(db, 'KO', CALENDAR, '2026-09-22', 58)

    expect(lookup(db, ['ko']).get('KO')).toEqual({
      reading: {
        value: '58',
        percentile: '100',
        low: '0.2000',
        high: '0.3000',
        observedAt: '2026-09-22T20:00:00.000Z',
        ageTradingDays: 0,
        state: 'fresh'
      },
      absence: null
    })
  })

  it('lets a published reading win over a pending run', () => {
    const db = makeTestDb()
    seedRankedIv30Series(db, 'KO', CALENDAR, '2026-09-22', 58)
    const runState = createIvRunState()
    runState.markPending('KO')

    const result = lookup(db, ['KO'], { runState }).get('KO')

    expect(result?.reading).toMatchObject({ value: '58' })
    expect(result?.absence).toBeNull()
  })

  it('reports insufficient_history with the coverage of a sparse window', () => {
    const db = makeTestDb()
    seedSparseSeries(db, 'KO')

    expect(lookup(db, ['KO']).get('KO')).toEqual({
      reading: null,
      absence: { reason: 'insufficient_history', coverage: 150, window: 252, required: 200 }
    })
  })

  it('reports the run status ahead of a sparse window', () => {
    const db = makeTestDb()
    seedSparseSeries(db, 'KO')
    const runState = createIvRunState()
    runState.settle('KO', { status: 'failed' })

    expect(lookup(db, ['KO'], { runState }).get('KO')?.absence).toEqual({ reason: 'failed' })
  })

  it('looks the run state up by upper-cased ticker', () => {
    const db = makeTestDb()
    const runState = createIvRunState()
    runState.markPending('MSFT')

    expect(lookup(db, ['msft'], { runState }).get('MSFT')?.absence).toEqual({
      reason: 'pending'
    })
  })

  it('assesses against the supplied earnings knowledge', () => {
    const db = makeTestDb()
    seedRankedIv30Series(db, 'KO', CALENDAR, '2026-09-18', 58)

    const result = lookup(db, ['KO'], { lastEarnings: new Map([['KO', '2026-09-21']]) })

    expect(result.get('KO')?.reading).toMatchObject({ state: 'predates_earnings' })
  })

  it('logs an unreadable assessment and reports not_collected', () => {
    const db = makeTestDb()
    // The anchor's close (Wednesday 16:00 ET) is after NOW, so the reading cannot be assessed.
    seedRankedIv30Series(db, 'KO', CALENDAR, '2026-09-23', 58)

    expect(lookup(db, ['KO']).get('KO')).toEqual({
      reading: null,
      absence: { reason: 'not_collected' }
    })
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: 'KO' }),
      'ivr_assessment_unreadable_snapshot'
    )
  })

  // IV rank is display-only and never a hard filter, so losing the whole read must cost
  // the caller its IV-rank column and nothing else — not the screen, and not the bench.
  it('degrades a failed series read to not_collected for everyone instead of throwing', () => {
    const db = makeTestDb()
    vi.mocked(readIvMetricsByUnderlying).mockImplementationOnce(() => {
      throw new Error('database disk image is malformed')
    })

    const result = lookup(db, ['KO', 'AAPL'])

    expect([...result.entries()]).toEqual([
      ['KO', { reading: null, absence: { reason: 'not_collected' } }],
      ['AAPL', { reading: null, absence: { reason: 'not_collected' } }]
    ])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tickers: ['KO', 'AAPL'] }),
      'ivr_assessment_snapshot_read_failed'
    )
  })

  it('returns an empty map for no tickers', () => {
    expect(lookup(makeTestDb(), [])).toEqual(new Map())
  })
})
