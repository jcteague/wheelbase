import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import type { TradingCalendar } from '../core/trading-calendar'
import { makeTestDb, makeTradingCalendar, seedIv30Series } from '../test-utils'
import { readIvMetricsByUnderlying, type IvMetricsRead } from './iv-history-read'

const TICKER = 'AAPL'
// Friday 2026-09-25 17:00 ET — after that day's close.
const FRIDAY_EVENING = new Date('2026-09-25T21:00:00Z')
/** A short calendar (September sessions only): fewer than 252 sessions precede any anchor. */
const SHORT_CALENDAR = makeTradingCalendar('2026-09-01', '2026-12-31')
/** Enough history for a full 252-session window behind 2026-09-25. */
const LONG_CALENDAR = makeTradingCalendar('2025-06-01', '2026-12-31')

function completedSessions(calendar: TradingCalendar, now: Date): string[] {
  return calendar.sessions.filter((s) => new Date(s.closeAt) <= now).map((s) => s.date)
}

describe('iv-history read path', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeTestDb()
  })

  describe('readIvMetricsByUnderlying', () => {
    // Anchor on FRIDAY 2026-09-25; the window is the 252 LONG_CALENDAR sessions before it.
    const anchorAt = (anchor: string): { window: string[]; anchorClose: string } => {
      const dates = LONG_CALENDAR.sessions.map((s) => s.date)
      const index = dates.indexOf(anchor)
      return {
        window: dates.slice(index - 252, index),
        anchorClose: LONG_CALENDAR.sessions[index].closeAt
      }
    }

    /** 1 × 0.18, 1 × 0.45, 62 × 0.20, 188 × 0.30 — 63 of 252 below 0.2475 → percentile 25. */
    const windowValues = (window: string[]): Array<[string, string]> =>
      window.map((session, i) => [
        session,
        i === 0 ? '0.1800' : i === 1 ? '0.4500' : i < 64 ? '0.2000' : '0.3000'
      ])

    it('reads rank, percentile, range and the anchor close from a full window', () => {
      const { window, anchorClose } = anchorAt('2026-09-25')
      seedIv30Series(db, TICKER, [...windowValues(window), ['2026-09-25', '0.2475']])

      const result = readIvMetricsByUnderlying(db, ['aapl'], LONG_CALENDAR)

      expect(result.get('AAPL')).toEqual<IvMetricsRead>({
        status: 'reading',
        reading: {
          value: '25',
          percentile: '25',
          low: '0.1800',
          high: '0.4500',
          observedAt: anchorClose
        }
      })
    })

    it('reports a flat window as a null rank with percentile and range', () => {
      const { window } = anchorAt('2026-09-25')
      seedIv30Series(db, TICKER, [
        ...window.map((s): [string, string] => [s, '0.3000']),
        ['2026-09-25', '0.3000']
      ])

      const read = readIvMetricsByUnderlying(db, [TICKER], LONG_CALENDAR).get(TICKER)

      expect(read).toMatchObject({ status: 'reading', reading: { value: null, low: '0.3000' } })
    })

    it('150 window readings → insufficient, coverage 150', () => {
      const { window } = anchorAt('2026-09-25')
      seedIv30Series(db, TICKER, [...windowValues(window).slice(-150), ['2026-09-25', '0.2475']])

      expect(readIvMetricsByUnderlying(db, [TICKER], LONG_CALENDAR).get(TICKER)).toEqual({
        status: 'insufficient',
        coverage: 150
      })
    })

    it('60 window readings → insufficient, coverage 60', () => {
      const { window } = anchorAt('2026-09-25')
      seedIv30Series(db, TICKER, [...windowValues(window).slice(-60), ['2026-09-25', '0.2475']])

      expect(readIvMetricsByUnderlying(db, [TICKER], LONG_CALENDAR).get(TICKER)).toEqual({
        status: 'insufficient',
        coverage: 60
      })
    })

    it('a ticker with no rows → none', () => {
      seedIv30Series(db, 'MSFT', [['2026-09-25', '0.3000']])
      expect(readIvMetricsByUnderlying(db, [TICKER], LONG_CALENDAR).get(TICKER)).toEqual({
        status: 'none'
      })
    })

    // A backfill that found no tradeable pair on any session still collected the history —
    // its coverage is zero, which the card must say rather than "never collected".
    it('a ticker with only gap rows → insufficient, coverage 0', () => {
      const insertGap = db.prepare(
        `INSERT INTO iv30_gap (underlying, session, method, reason, attempted_at)
         VALUES (?, ?, 'daily_vwap', 'no_tradeable_pair', '2026-09-25T21:00:00.000Z')`
      )
      insertGap.run(TICKER, '2026-09-23')
      insertGap.run(TICKER, '2026-09-24')

      expect(readIvMetricsByUnderlying(db, [TICKER], LONG_CALENDAR).get(TICKER)).toEqual({
        status: 'insufficient',
        coverage: 0
      })
    })

    it('a stale anchor keeps its own close and its own 252-session window', () => {
      // Anchor three sessions before the newest; a spike just outside its window must not count.
      const { window, anchorClose } = anchorAt('2026-09-22')
      const dates = LONG_CALENDAR.sessions.map((s) => s.date)
      const beforeWindow = dates[dates.indexOf(window[0]) - 1]
      seedIv30Series(db, TICKER, [
        [beforeWindow, '0.9000'],
        ...windowValues(window),
        ['2026-09-22', '0.2475']
      ])

      const read = readIvMetricsByUnderlying(db, [TICKER], LONG_CALENDAR).get(TICKER)

      expect(read).toEqual({
        status: 'reading',
        reading: {
          value: '25',
          percentile: '25',
          low: '0.1800',
          high: '0.4500',
          observedAt: anchorClose
        }
      })
    })

    it('judges coverage against 252 when the calendar holds fewer sessions before the anchor', () => {
      // SHORT_CALENDAR starts 2026-09-01: only ~18 sessions precede the anchor.
      const sessions = completedSessions(SHORT_CALENDAR, FRIDAY_EVENING)
      seedIv30Series(
        db,
        TICKER,
        sessions.map((s): [string, string] => [s, '0.3000'])
      )

      expect(readIvMetricsByUnderlying(db, [TICKER], SHORT_CALENDAR).get(TICKER)).toEqual({
        status: 'insufficient',
        coverage: sessions.length - 1
      })
    })

    it('is synchronous and takes no provider', () => {
      expectTypeOf(readIvMetricsByUnderlying).parameters.toEqualTypeOf<
        [Database.Database, string[], TradingCalendar]
      >()
      expectTypeOf(readIvMetricsByUnderlying).returns.toEqualTypeOf<Map<string, IvMetricsRead>>()
    })
  })
})
