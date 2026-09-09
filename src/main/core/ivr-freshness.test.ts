import { describe, expect, it } from 'vitest'

import type { IvRank } from './screener'
import { makeTradingCalendar } from '../test-utils'
import {
  AGING_MAX_AGE,
  FRESH_MAX_AGE,
  STALE_MAX_AGE,
  assessIvRank,
  isUsableState,
  tierForAge,
  type IvRankAssessment
} from './ivr-freshness'

const now = new Date('2026-09-23T14:00:00.000Z')
// Labor Day 2026 closes the 7th, which is what makes the 11-session case land past the
// stale boundary rather than on it.
const calendar = makeTradingCalendar('2026-08-24', '2026-09-24', { closures: ['2026-09-07'] })
const reading = (observedAt: string, value = '38.0'): IvRank => ({ value, observedAt })

const assess = (
  observedAt: string,
  lastEarnings: string | null | undefined = undefined,
  value = '38.0'
): IvRankAssessment => assessIvRank(reading(observedAt, value), { now, calendar, lastEarnings })

describe('IVR freshness', () => {
  it.each([
    ['2026-09-22T21:00:00.000Z', 0, 'fresh', true],
    ['2026-09-21T21:00:00.000Z', 1, 'fresh', true],
    ['2026-09-18T21:00:00.000Z', 2, 'aging', true],
    ['2026-09-17T21:00:00.000Z', 3, 'aging', true],
    ['2026-09-16T21:00:00.000Z', 4, 'stale', false],
    ['2026-09-14T21:00:00.000Z', 6, 'stale', false],
    ['2026-09-08T21:00:00.000Z', 10, 'stale', false],
    ['2026-09-04T21:00:00.000Z', 11, null, null]
  ])('assesses %s as age %s / %s', (observedAt, age, state, usable) => {
    const assessment = assess(observedAt as string)
    if (state === null) {
      expect(assessment).toEqual({ status: 'expired' })
    } else {
      expect(assessment).toMatchObject({
        status: 'assessed',
        reading: { ageTradingDays: age, state }
      })
      expect(isUsableState(state as never)).toBe(usable)
    }
  })

  it('keeps the tier boundaries explicit', () => {
    expect(FRESH_MAX_AGE).toBe(1)
    expect(AGING_MAX_AGE).toBe(3)
    expect(STALE_MAX_AGE).toBe(10)
    expect(tierForAge(0)).toBe('fresh')
    expect(tierForAge(1)).toBe('fresh')
    expect(tierForAge(2)).toBe('aging')
    expect(tierForAge(3)).toBe('aging')
    expect(tierForAge(4)).toBe('stale')
    expect(tierForAge(10)).toBe('stale')
    expect(tierForAge(11)).toBe('expired')
  })

  it('lets a later known print override time freshness, but not a prior print', () => {
    expect(assess('2026-09-22T21:00:00.000Z', '2026-09-23', '62.0')).toMatchObject({
      reading: { state: 'predates_earnings', ageTradingDays: 0 }
    })
    expect(isUsableState('predates_earnings')).toBe(false)

    expect(assess('2026-09-22T21:00:00.000Z', '2026-09-15', '62.0')).toMatchObject({
      reading: { state: 'fresh' }
    })
  })

  it('retains earnings invalidation even when the time tier is expired', () => {
    expect(assess('2026-09-04T21:00:00.000Z', '2026-09-08', '62.0')).toMatchObject({
      reading: { state: 'predates_earnings', ageTradingDays: 11 }
    })
  })

  it('uses time tiers alone for absent, invalid, same-session, and future earnings knowledge', () => {
    for (const lastEarnings of [null, undefined, 'not-a-date', '2026-09-24', '2026-09-22']) {
      expect(assess('2026-09-22T21:00:00.000Z', lastEarnings)).toMatchObject({
        reading: { state: 'fresh' }
      })
    }
  })

  it('preserves a zero reading without mutating the input', () => {
    const original = reading('2026-09-22T21:00:00.000Z', '0')
    const copy = { ...original }

    expect(assessIvRank(original, { now, calendar, lastEarnings: null })).toMatchObject({
      reading: { value: '0' }
    })
    expect(original).toEqual(copy)
  })

  it('separates an unreadable reading from one that merely aged out', () => {
    // Corrupt or impossible input — the operator should hear about these.
    expect(assess('invalid')).toEqual({ status: 'unreadable' })
    expect(assess('2026-09-23T15:00:00.000Z')).toEqual({ status: 'unreadable' })
    expect(
      assessIvRank(
        { value: 'not-a-number', observedAt: '2026-09-22T21:00:00.000Z' },
        {
          now,
          calendar,
          lastEarnings: null
        }
      )
    ).toEqual({ status: 'unreadable' })
    // Older than the calendar can reach: also unknown, and also worth saying so.
    expect(assess('2024-12-31T21:00:00.000Z')).toEqual({ status: 'unreadable' })
    // Simply too old — an ordinary outcome, not a degradation.
    expect(assess('2026-09-04T21:00:00.000Z')).toEqual({ status: 'expired' })
  })
})
