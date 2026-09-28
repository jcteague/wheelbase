// [US-121] Calculate IV30 from option prices — expiration and strike selection
import { addDays, eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { buildOccSymbol } from './option-symbol'
import {
  MIN_DTE,
  STRIKE_INCREMENTS,
  TARGET_DTE,
  daysToExpiry,
  monthlyCandidates,
  planSessionProbe,
  selectExpirationPair,
  strikeCandidates,
  weeklyCandidates
} from './iv30-selection'

const HOLIDAYS_2026 = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03', // Good Friday
  '2026-05-25',
  '2026-06-19',
  '2026-07-03', // Independence Day observed (Friday)
  '2026-09-07',
  '2026-11-26',
  '2026-12-25'
])

/** Weekday sessions from 2026-01-02 through 2026-12-31, minus NYSE holidays. */
const SESSIONS_2026: readonly string[] = eachDayOfInterval({
  start: parseISO('2026-01-02'),
  end: parseISO('2026-12-31')
})
  .filter((d) => !isWeekend(d))
  .map((d) => format(d, 'yyyy-MM-dd'))
  .filter((d) => !HOLIDAYS_2026.has(d))

const plus = (session: string, days: number): string =>
  format(addDays(parseISO(session), days), 'yyyy-MM-dd')

describe('constants', () => {
  it('targets 30 DTE with a 7 DTE floor and the four strike increments', () => {
    expect(TARGET_DTE).toBe(30)
    expect(MIN_DTE).toBe(7)
    expect(STRIKE_INCREMENTS).toEqual([0.5, 1, 2.5, 5])
  })
})

describe('daysToExpiry', () => {
  it('counts calendar days from session to expiration', () => {
    expect(daysToExpiry('2026-03-12', '2026-04-11')).toBe(30)
  })

  it('is unaffected by the DST change inside the interval', () => {
    expect(daysToExpiry('2026-03-06', '2026-04-05')).toBe(30)
  })

  it('is zero on the same day', () => {
    expect(daysToExpiry('2026-03-12', '2026-03-12')).toBe(0)
  })
})

describe('selectExpirationPair — scenario outline: expirations too near expiry are excluded', () => {
  const session = '2026-03-12'
  const rows: Array<[number[], number, number | null]> = [
    [[3, 31], 31, null],
    [[6, 34], 34, null],
    [[7, 35], 7, 35],
    [[9, 37], 9, 37],
    [[14, 45], 14, 45]
  ]

  it.each(rows)('candidates at %j → near +%i, far %s', (offsets, near, far) => {
    const candidates = offsets.map((o) => plus(session, o))
    expect(selectExpirationPair(session, candidates)).toEqual({
      near: plus(session, near),
      far: far === null ? null : plus(session, far)
    })
  })
})

describe('selectExpirationPair', () => {
  const session = '2026-03-12'
  const at = (...offsets: number[]): string[] => offsets.map((o) => plus(session, o))

  it('uses an expiration at exactly 30 DTE alone', () => {
    expect(selectExpirationPair(session, at(23, 30, 37))).toEqual({
      near: plus(session, 30),
      far: null
    })
  })

  it('brackets 30 DTE with the largest ≤ 30 and the smallest > 30', () => {
    expect(selectExpirationPair(session, at(24, 31))).toEqual({
      near: plus(session, 24),
      far: plus(session, 31)
    })
  })

  it('picks the tightest bracket among many candidates, regardless of input order', () => {
    expect(selectExpirationPair(session, at(38, 10, 31, 17, 24))).toEqual({
      near: plus(session, 24),
      far: plus(session, 31)
    })
  })

  it('uses the nearest expiration alone when every candidate is beyond 30 DTE', () => {
    expect(selectExpirationPair(session, at(45, 31, 38))).toEqual({
      near: plus(session, 31),
      far: null
    })
  })

  it('uses the nearest expiration alone when every usable candidate is under 30 DTE', () => {
    expect(selectExpirationPair(session, at(8, 15, 22))).toEqual({
      near: plus(session, 22),
      far: null
    })
  })

  it('returns null when every candidate is under 7 DTE', () => {
    expect(selectExpirationPair(session, at(1, 3, 6))).toBeNull()
  })

  it('returns null for no candidates', () => {
    expect(selectExpirationPair(session, [])).toBeNull()
  })
})

describe('weeklyCandidates', () => {
  it('returns every Friday in [+7, +45], shifting a holiday Friday to the prior session', () => {
    // 2026-04-03 is Good Friday → 2026-04-02 (Thursday)
    expect(weeklyCandidates('2026-03-12', SESSIONS_2026)).toEqual([
      '2026-03-20',
      '2026-03-27',
      '2026-04-02',
      '2026-04-10',
      '2026-04-17',
      '2026-04-24'
    ])
  })

  it('includes a Friday exactly 7 and exactly 45 days out', () => {
    // 2026-03-13 is a Friday: +7 = 2026-03-20, +45 = 2026-04-27 (Mon) — last Friday 2026-04-24
    const fridaySession = '2026-03-13'
    const result = weeklyCandidates(fridaySession, SESSIONS_2026)
    expect(result[0]).toBe('2026-03-20')
    expect(result).toContain('2026-04-24')
    // 2026-03-10 (Tue): +45 = 2026-04-24, a Friday
    expect(weeklyCandidates('2026-03-10', SESSIONS_2026).at(-1)).toBe('2026-04-24')
  })

  it('keeps a shifted Friday that is still at least 7 DTE', () => {
    // 2026-07-03 closed → 2026-07-02, which is exactly 7 DTE from 2026-06-25
    expect(weeklyCandidates('2026-06-25', SESSIONS_2026)[0]).toBe('2026-07-02')
  })

  it('drops a Friday whose shift puts it under 7 DTE', () => {
    // From 2026-06-26, the +7 Friday 2026-07-03 shifts to 2026-07-02 = 6 DTE
    const result = weeklyCandidates('2026-06-26', SESSIONS_2026)
    expect(result).not.toContain('2026-07-02')
    expect(result).not.toContain('2026-07-03')
    expect(result[0]).toBe('2026-07-10')
  })

  it('leaves a Friday beyond the known calendar unshifted (unknown is not a closure)', () => {
    const shortCalendar = SESSIONS_2026.filter((d) => d <= '2026-03-31')
    expect(weeklyCandidates('2026-03-12', shortCalendar)).toEqual([
      '2026-03-20',
      '2026-03-27',
      '2026-04-03',
      '2026-04-10',
      '2026-04-17',
      '2026-04-24'
    ])
  })
})

describe('monthlyCandidates', () => {
  it('returns third Fridays in [+7, +70]', () => {
    // 2026-03-20 is 8 DTE → included; 2026-06-19 is 99 DTE → excluded
    expect(monthlyCandidates('2026-03-12', SESSIONS_2026)).toEqual([
      '2026-03-20',
      '2026-04-17',
      '2026-05-15'
    ])
  })

  it('excludes a third Friday under 7 DTE', () => {
    // From 2026-03-16, 2026-03-20 is 4 DTE
    expect(monthlyCandidates('2026-03-16', SESSIONS_2026)).toEqual(['2026-04-17', '2026-05-15'])
  })

  it('shifts a Good-Friday-style closure to the Thursday', () => {
    const closedApril17 = SESSIONS_2026.filter((d) => d !== '2026-04-17')
    expect(monthlyCandidates('2026-03-12', closedApril17)).toEqual([
      '2026-03-20',
      '2026-04-16',
      '2026-05-15'
    ])
  })
})

describe('strikeCandidates', () => {
  it('floors and ceils at each increment, deduplicated, nearest first', () => {
    expect(strikeCandidates(200.4)).toEqual([200.5, 200, 201, 202.5, 205])
  })

  it('collapses to one strike when the price sits on every grid', () => {
    expect(strikeCandidates(200)).toEqual([200])
  })

  it('orders a low-priced underlying by distance', () => {
    expect(strikeCandidates(37.3)).toEqual([37.5, 37, 38, 35, 40])
  })
})

describe('planSessionProbe', () => {
  const plan = planSessionProbe({
    underlying: 'AAPL',
    session: '2026-03-12',
    underlyingPrice: 200.4,
    sessions: SESSIONS_2026
  })

  const expectedSymbols = (pair: { near: string; far: string | null }): string[] =>
    [pair.near, pair.far]
      .filter((e): e is string => e !== null)
      .flatMap((expiration) =>
        strikeCandidates(200.4).flatMap((strike) =>
          (['CALL', 'PUT'] as const).map((instrumentType) =>
            buildOccSymbol({ ticker: 'AAPL', expiration, strike, instrumentType })
          )
        )
      )

  it('echoes the session', () => {
    expect(plan.session).toBe('2026-03-12')
  })

  // The engine walks these strikes for the underlying, so it never has to re-derive either.
  it('carries the underlying and its strikes nearest-first', () => {
    expect(plan.underlying).toBe('AAPL')
    expect(plan.strikes).toEqual([200.5, 200, 201, 202.5, 205])
  })

  it('selects the weekly pair bracketing 30 DTE', () => {
    expect(plan.weekly?.pair).toEqual({ near: '2026-04-10', far: '2026-04-17' })
  })

  it('selects the monthly pair bracketing 30 DTE', () => {
    expect(plan.monthly?.pair).toEqual({ near: '2026-03-20', far: '2026-04-17' })
  })

  it('builds C and P OCC symbols for every strike × expiration in each tier', () => {
    expect(new Set(plan.weekly?.symbols)).toEqual(
      new Set(expectedSymbols({ near: '2026-04-10', far: '2026-04-17' }))
    )
    expect(new Set(plan.monthly?.symbols)).toEqual(
      new Set(expectedSymbols({ near: '2026-03-20', far: '2026-04-17' }))
    )
    expect(plan.weekly?.symbols).toContain('AAPL260410C00200500')
    expect(plan.weekly?.symbols).toContain('AAPL260417P00205000')
  })

  it('deduplicates the symbol list', () => {
    expect(plan.weekly?.symbols).toHaveLength(20)
    expect(plan.monthly?.symbols).toHaveLength(20)
  })

  it('deduplicates when strikes collapse to one', () => {
    const flat = planSessionProbe({
      underlying: 'AAPL',
      session: '2026-03-12',
      underlyingPrice: 200,
      sessions: SESSIONS_2026
    })
    expect(flat.weekly?.symbols).toEqual([
      'AAPL260410C00200000',
      'AAPL260410P00200000',
      'AAPL260417C00200000',
      'AAPL260417P00200000'
    ])
  })

  it('builds symbols for the lone expiration of an exactly-30-DTE pair', () => {
    // 2026-03-11 + 30 = 2026-04-10 (Friday)
    const exact = planSessionProbe({
      underlying: 'AAPL',
      session: '2026-03-11',
      underlyingPrice: 200,
      sessions: SESSIONS_2026
    })
    expect(exact.weekly?.pair).toEqual({ near: '2026-04-10', far: null })
    expect(exact.weekly?.symbols).toEqual(['AAPL260410C00200000', 'AAPL260410P00200000'])
  })

  it('is null for a tier with no pair', () => {
    // A calendar that is closed for every day between the session and a sentinel beyond +70
    // shifts every Friday back to the session itself (0 DTE), leaving no candidates.
    const closed = planSessionProbe({
      underlying: 'AAPL',
      session: '2026-03-12',
      underlyingPrice: 200.4,
      sessions: ['2026-03-12', '2026-06-30']
    })
    expect(closed.weekly).toBeNull()
    expect(closed.monthly).toBeNull()
  })
})
