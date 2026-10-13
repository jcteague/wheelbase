// [US-105] leapsRollCoverage — the Roll LEAPS sheet's coverage ruler: today, the open short, the
// current LEAPS and the replacement on one axis; blocked when the replacement no longer covers
// the short.
import { describe, expect, it } from 'vitest'
import { leapsRollCoverage } from './pmcc-roll-coverage'

const TODAY = '2027-07-09'
const SHORT_EXP = '2027-07-16'
const LEAPS_EXP = '2027-09-17'

const coverage = (
  replacementExpiration: string,
  overrides: { openShortExpiration?: string | null; currentExpiration?: string } = {}
): ReturnType<typeof leapsRollCoverage> =>
  leapsRollCoverage({
    today: TODAY,
    currentExpiration: LEAPS_EXP,
    openShortExpiration: SHORT_EXP,
    replacementExpiration,
    ...overrides
  })

describe('leapsRollCoverage — marks', () => {
  it('lists today, the open short, the current LEAPS and the undecided replacement', () => {
    expect(coverage('').marks).toEqual([
      { key: 'today', date: TODAY, label: 'Today', value: TODAY, tone: 'muted' },
      {
        key: 'short',
        date: SHORT_EXP,
        label: 'Open short call',
        value: '2027-07-16 · 7 DTE',
        tone: 'secondary'
      },
      {
        key: 'current',
        date: LEAPS_EXP,
        label: 'Current LEAPS (selling)',
        value: '2027-09-17 · 70 DTE',
        tone: 'green'
      },
      {
        key: 'replacement',
        date: null,
        label: 'Replacement LEAPS (buying)',
        value: 'not entered',
        tone: 'accent'
      }
    ])
  })

  it('dates the replacement once its expiration is complete', () => {
    expect(coverage('2028-01-21').marks[3]).toEqual({
      key: 'replacement',
      date: '2028-01-21',
      label: 'Replacement LEAPS (buying)',
      value: '2028-01-21 · 196 DTE',
      tone: 'accent'
    })
  })

  it('ignores a partially typed expiration', () => {
    const result = coverage('2028-01')
    expect(result.marks[3]).toMatchObject({ date: null, value: 'not entered' })
    expect(result.fillTo).toBe(LEAPS_EXP)
  })

  it('with no short open, lists the short undated as none', () => {
    expect(coverage('', { openShortExpiration: null }).marks[1]).toEqual({
      key: 'short',
      date: null,
      label: 'Open short call',
      value: 'none',
      tone: 'secondary'
    })
  })
})

describe('leapsRollCoverage — fill and blocked', () => {
  it('fills to the current LEAPS until a replacement is entered, then to the replacement', () => {
    expect(coverage('').fillTo).toBe(LEAPS_EXP)
    expect(coverage('2028-01-21').fillTo).toBe('2028-01-21')
  })

  it('is blocked when the replacement expires on the short call', () => {
    expect(coverage(SHORT_EXP).blocked).toBe(true)
  })

  it('is blocked when the replacement expires before the short call', () => {
    expect(coverage('2027-07-12').blocked).toBe(true)
  })

  it('is not blocked one day past the short call, nor before a replacement is entered', () => {
    expect(coverage('2027-07-17').blocked).toBe(false)
    expect(coverage('').blocked).toBe(false)
  })

  it('is never blocked with no short open', () => {
    expect(coverage('2027-07-12', { openShortExpiration: null }).blocked).toBe(false)
  })
})

describe('leapsRollCoverage — note', () => {
  it('inside 90 days, names the decay window and the short that needs cover', () => {
    expect(coverage('').note).toBe(
      'Current LEAPS expires in 70 days — inside the window where its time value starts to decay fast. The open short call needs cover past 2027-07-16.'
    )
  })

  it('at exactly 90 days still names the window', () => {
    expect(coverage('', { currentExpiration: '2027-10-07' }).note).toContain(
      'expires in 90 days — inside the window'
    )
  })

  it('past 90 days drops the window clause', () => {
    expect(coverage('', { currentExpiration: '2027-10-08' }).note).toBe(
      'Current LEAPS expires in 91 days. The open short call needs cover past 2027-07-16.'
    )
  })

  it('with no short open, drops the cover clause', () => {
    expect(coverage('', { openShortExpiration: null }).note).toBe(
      'Current LEAPS expires in 70 days — inside the window where its time value starts to decay fast.'
    )
  })

  it('a replacement past the short states its DTE and the margin over the short', () => {
    expect(coverage('2028-01-21').note).toBe(
      'Replacement LEAPS at 196 DTE, 189 days past the short call.'
    )
  })

  it('a replacement with no short open states only its DTE', () => {
    expect(coverage('2027-07-12', { openShortExpiration: null }).note).toBe(
      'Replacement LEAPS at 3 DTE.'
    )
  })

  it('a blocked replacement says the short call goes naked', () => {
    expect(coverage(SHORT_EXP).note).toBe(
      'The replacement LEAPS expires on or before the short call. Past this point the short call is naked.'
    )
  })
})
