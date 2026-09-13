import { describe, expect, it } from 'vitest'
import type { ScreenerIvRank } from '../api/screener'
import {
  isUsableIvrState,
  ivrTooltipCopy,
  observedDayLabel,
  observedSessionLabel
} from './ivr-tooltip'

// [US-96] The tooltip is the only place the freshness rules are spelled out, so the
// copy has to say what the reading does — not just how old it is.
const BASE: ScreenerIvRank = {
  value: '38.0',
  observedAt: '2026-08-28T20:00:00.000Z', // Fri Aug 28 2026, 4pm ET
  ageTradingDays: 6,
  state: 'stale'
}

const reading = (over: Partial<ScreenerIvRank>): ScreenerIvRank => ({ ...BASE, ...over })

describe('observedSessionLabel', () => {
  it('names the observed session in Eastern Time', () => {
    expect(observedSessionLabel('2026-08-28T20:00:00.000Z')).toBe('Fri, Aug 28')
  })

  it('keeps a late-UTC close on its Eastern session day', () => {
    expect(observedSessionLabel('2026-09-09T00:30:00.000Z')).toBe('Tue, Sep 8')
  })
})

describe('observedDayLabel', () => {
  it('dates the observed session in Eastern Time, year and all', () => {
    expect(observedDayLabel('2026-08-28T20:00:00.000Z')).toBe('Aug 28, 2026')
  })

  it('keeps a late-UTC close on its Eastern session day', () => {
    expect(observedDayLabel('2026-01-01T02:00:00.000Z')).toBe('Dec 31, 2025')
  })
})

describe('isUsableIvrState', () => {
  it.each([
    ['fresh', true],
    ['aging', true],
    ['stale', false],
    ['expired', false],
    ['predates_earnings', false]
  ] as const)('reports %s as usable=%s', (state, usable) => {
    expect(isUsableIvrState(state)).toBe(usable)
  })
})

describe('ivrTooltipCopy', () => {
  it.each([
    ['fresh', 'Fresh'],
    ['aging', 'Aging'],
    ['stale', 'Stale'],
    ['expired', 'Expired'],
    ['predates_earnings', 'Predates earnings']
  ] as const)('titles the %s tier "%s"', (state, title) => {
    expect(ivrTooltipCopy(reading({ state })).title).toBe(title)
  })

  it('tells a stale reading it is shown but cannot decide a condition', () => {
    const { body } = ivrTooltipCopy(reading({ state: 'stale', ageTradingDays: 6 }))

    expect(body).toContain('6 trading days old')
    expect(body).toContain('Fri, Aug 28')
    expect(body).toContain('cannot satisfy an IV condition')
  })

  it('explains that an expired reading means collection has been failing', () => {
    const { body } = ivrTooltipCopy(reading({ state: 'expired', ageTradingDays: 12 }))

    expect(body).toContain('exp')
    expect(body).toContain('collection has been failing')
  })

  it('says an aging reading still counts', () => {
    expect(ivrTooltipCopy(reading({ state: 'aging', ageTradingDays: 2 })).body).toContain(
      'still counts'
    )
  })

  it('reads a fresh reading as current', () => {
    const { body } = ivrTooltipCopy(reading({ state: 'fresh', ageTradingDays: 0 }))

    expect(body).toContain('IV rank 38')
    expect(body).toContain('Fri, Aug 28')
  })

  it('blames the print rather than the age when a reading predates earnings', () => {
    const { body } = ivrTooltipCopy(reading({ state: 'predates_earnings', ageTradingDays: 1 }))

    expect(body).toContain('earnings')
    expect(body).toContain('regardless of age')
  })

  it('counts a single trading day in the singular', () => {
    const { body } = ivrTooltipCopy(reading({ state: 'aging', ageTradingDays: 1 }))

    expect(body).toContain('1 trading day')
    expect(body).not.toContain('1 trading days')
  })
})
