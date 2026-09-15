import { describe, expect, it } from 'vitest'

import {
  EMPTY_TRADING_CALENDAR,
  countCompletedSessionsAfter,
  etDateOf,
  etInstantAt,
  getMostRecentCompletedSession,
  getTradingSession,
  isIsoDay,
  observationWindowOf,
  type TradingCalendar,
  type TradingSession
} from './trading-calendar'

const atEt = (date: string, time: string): Date => new Date(etInstantAt(date, time)!)

/** Builds a calendar the way the store does: a coverage window plus the sessions the
 *  exchange held inside it. Days listed in `closures` get no session. */
function calendarOf(
  firstDay: string,
  lastDay: string,
  sessions: Array<[string, string]>
): TradingCalendar {
  return {
    firstDay,
    lastDay,
    sessions: sessions.map(([date, close]) => ({ date, closeAt: etInstantAt(date, close)! }))
  }
}

// A Thanksgiving week: Wed full session, Thu closed, Fri 13:00 early close.
const THANKSGIVING = calendarOf('2026-11-23', '2026-11-30', [
  ['2026-11-23', '16:00'],
  ['2026-11-24', '16:00'],
  ['2026-11-25', '16:00'],
  ['2026-11-27', '13:00'],
  ['2026-11-30', '16:00']
])

const WEEKEND = calendarOf('2026-06-08', '2026-06-19', [
  ['2026-06-11', '16:00'],
  ['2026-06-12', '16:00'],
  ['2026-06-15', '16:00'],
  ['2026-06-16', '16:00']
])

describe('trading calendar', () => {
  it('counts only completed closes across a weekend', () => {
    const friday = getMostRecentCompletedSession(WEEKEND, atEt('2026-06-12', '16:00'))
    expect(friday?.date).toBe('2026-06-12')

    expect(countCompletedSessionsAfter(WEEKEND, friday!, atEt('2026-06-15', '15:59'))).toBe(0)
    expect(countCompletedSessionsAfter(WEEKEND, friday!, atEt('2026-06-15', '16:00'))).toBe(1)
  })

  it('honours a published early close rather than assuming 16:00', () => {
    const wednesday = getMostRecentCompletedSession(THANKSGIVING, atEt('2026-11-25', '16:00'))

    expect(countCompletedSessionsAfter(THANKSGIVING, wednesday!, atEt('2026-11-27', '12:59'))).toBe(
      0
    )
    expect(countCompletedSessionsAfter(THANKSGIVING, wednesday!, atEt('2026-11-27', '13:00'))).toBe(
      1
    )
    expect(getMostRecentCompletedSession(THANKSGIVING, atEt('2026-11-27', '14:00'))?.date).toBe(
      '2026-11-27'
    )
  })

  it('reads a day with no session as closed, and a day off the window as unavailable', () => {
    expect(getTradingSession(THANKSGIVING, '2026-11-26')).toEqual({ status: 'closed' })
    expect(getTradingSession(THANKSGIVING, '2026-11-25').status).toBe('open')
    expect(getTradingSession(THANKSGIVING, '2026-12-01')).toEqual({ status: 'unavailable' })
    expect(getTradingSession(THANKSGIVING, '2026-11-22')).toEqual({ status: 'unavailable' })
    expect(getTradingSession(THANKSGIVING, '2026-02-30')).toEqual({ status: 'unavailable' })
  })

  it('knows nothing before the calendar has been fetched', () => {
    expect(getTradingSession(EMPTY_TRADING_CALENDAR, '2026-11-25')).toEqual({
      status: 'unavailable'
    })
    expect(getMostRecentCompletedSession(EMPTY_TRADING_CALENDAR, new Date())).toBeNull()
  })

  it('refuses to age a reading against a moment outside the window', () => {
    const wednesday = getMostRecentCompletedSession(THANKSGIVING, atEt('2026-11-25', '16:00'))!

    // `now` past coverage is the calendar-exhausted case: unknown, never "0 days old".
    expect(countCompletedSessionsAfter(THANKSGIVING, wednesday, atEt('2026-12-02', '16:00'))).toBe(
      null
    )
    // A session the calendar does not hold cannot anchor a count either.
    expect(
      countCompletedSessionsAfter(
        THANKSGIVING,
        { date: '2026-11-26', closeAt: '2026-11-26T21:00:00.000Z' },
        atEt('2026-11-27', '16:00')
      )
    ).toBeNull()
    // A close that has not happened yet.
    expect(countCompletedSessionsAfter(THANKSGIVING, wednesday, atEt('2026-11-25', '15:00'))).toBe(
      null
    )
    expect(getMostRecentCompletedSession(THANKSGIVING, new Date('invalid'))).toBeNull()
  })

  it('pins ET conversion across the daylight-saving boundary', () => {
    expect(etDateOf(new Date('2026-09-15T02:30:00Z'))).toBe('2026-09-14')
    expect(etInstantAt('2026-03-06', '16:00')).toBe('2026-03-06T21:00:00.000Z')
    expect(etInstantAt('2026-03-09', '16:00')).toBe('2026-03-09T20:00:00.000Z')
  })

  it('rejects input that is not a real day or time', () => {
    expect(isIsoDay('2026-02-30')).toBe(false)
    expect(isIsoDay('2026-2-3')).toBe(false)
    expect(isIsoDay('2026-02-28')).toBe(true)
    expect(etInstantAt('2026-02-30', '16:00')).toBeNull()
    expect(etInstantAt('2026-03-06', '24:00')).toBeNull()
    expect(etInstantAt('2026-03-06', '9:30')).toBeNull()
    expect(etDateOf(new Date('invalid'))).toBe('')
  })
})

describe('observationWindowOf', () => {
  it('spans from a session close to the next session close', () => {
    const friday = getTradingSession(WEEKEND, '2026-06-12')
    expect(friday.status).toBe('open')

    expect(observationWindowOf(WEEKEND, (friday as { session: TradingSession }).session)).toEqual({
      from: etInstantAt('2026-06-12', '16:00'),
      to: etInstantAt('2026-06-15', '16:00')
    })
  })

  it('skips a mid-week closure when finding the next close', () => {
    const wednesday = getTradingSession(THANKSGIVING, '2026-11-25')

    expect(
      observationWindowOf(THANKSGIVING, (wednesday as { session: TradingSession }).session)
    ).toEqual({
      from: etInstantAt('2026-11-25', '16:00'),
      to: etInstantAt('2026-11-27', '13:00')
    })
  })

  it('leaves the window open-ended for the last session in the calendar', () => {
    const last = getTradingSession(WEEKEND, '2026-06-16')

    expect(observationWindowOf(WEEKEND, (last as { session: TradingSession }).session)).toEqual({
      from: etInstantAt('2026-06-16', '16:00'),
      to: null
    })
  })

  it('returns null for a day the calendar does not hold a session for', () => {
    const saturday: TradingSession = {
      date: '2026-06-13',
      closeAt: etInstantAt('2026-06-13', '16:00')!
    }
    const outside: TradingSession = {
      date: '2026-07-01',
      closeAt: etInstantAt('2026-07-01', '16:00')!
    }

    expect(observationWindowOf(WEEKEND, saturday)).toBeNull()
    expect(observationWindowOf(WEEKEND, outside)).toBeNull()
    expect(observationWindowOf(EMPTY_TRADING_CALENDAR, saturday)).toBeNull()
  })
})
