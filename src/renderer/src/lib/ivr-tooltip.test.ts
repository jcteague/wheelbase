import { describe, expect, it } from 'vitest'
import type { IvRank, IvRankAbsence } from '../api/ivr'
import {
  formatIvRange,
  isUsableIvrState,
  ivrAbsenceNote,
  ivrAbsenceTitle,
  ivrTooltipCopy,
  observedDayLabel,
  observedSessionLabel
} from './ivr-tooltip'

// [US-96] The tooltip is the only place the freshness rules are spelled out, so the
// copy has to say what the reading does — not just how old it is.
const BASE: IvRank = {
  value: '38',
  percentile: '71',
  low: '0.1800',
  high: '0.4500',
  observedAt: '2026-08-28T20:00:00.000Z', // Fri Aug 28 2026, 4pm ET
  ageTradingDays: 6,
  state: 'stale'
}

const reading = (over: Partial<IvRank>): IvRank => ({ ...BASE, ...over })

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

// [US-121] The range and percentile behind the rank travel with every tier, so the trader
// can see what the number was measured against.
describe('ivrTooltipCopy range and percentile', () => {
  it.each(['fresh', 'aging', 'stale', 'expired', 'predates_earnings'] as const)(
    'ends the %s body with the 52-week range and the percentile',
    (state) => {
      const { body } = ivrTooltipCopy(
        reading({ state, value: '25', percentile: '71', low: '0.1800', high: '0.4500' })
      )

      expect(body.endsWith('52-wk IV 0.1800–0.4500 · IV percentile 71')).toBe(true)
    }
  )

  it('reads a flat window as n/a rather than a number', () => {
    const { body } = ivrTooltipCopy(reading({ state: 'fresh', value: null }))

    expect(body).toContain('IV rank n/a')
  })
})

describe('formatIvRange', () => {
  it('joins the low and high with an en dash', () => {
    expect(formatIvRange('0.1800', '0.4500')).toBe('0.1800–0.4500')
  })
})

describe('ivrAbsenceTitle', () => {
  it.each<[IvRankAbsence, string]>([
    [{ reason: 'pending' }, 'Computing IV history'],
    [
      { reason: 'insufficient_history', coverage: 150, window: 252, required: 200 },
      'IV history covers 150 of the last 252 sessions; rank needs 200'
    ],
    [{ reason: 'no_market_data' }, 'IV rank needs Alpaca market-data credentials'],
    [{ reason: 'failed' }, 'Last IV history run failed'],
    [{ reason: 'not_collected' }, 'No IV rank collected']
  ])('titles %o as "%s"', (absence, title) => {
    expect(ivrAbsenceTitle(absence)).toBe(title)
  })
})

describe('ivrAbsenceNote', () => {
  const CONDITION = '“IVR ≥ 30”'

  it.each<[IvRankAbsence, 'info' | 'warning']>([
    [{ reason: 'pending' }, 'info'],
    [{ reason: 'insufficient_history', coverage: 150, window: 252, required: 200 }, 'info'],
    [{ reason: 'not_collected' }, 'info'],
    [{ reason: 'failed' }, 'warning'],
    [{ reason: 'no_market_data' }, 'warning']
  ])('notes %o as %s, naming the ticker and the condition', (absence, variant) => {
    const note = ivrAbsenceNote('AAPL', absence, CONDITION)

    expect(note.variant).toBe(variant)
    expect(note.kind).toBe(absence.reason)
    expect(note.text).toContain('AAPL')
    expect(note.text).toContain(CONDITION)
    expect(note.text).toContain('cannot be judged')
  })

  it('quotes the coverage numbers for a sparse history', () => {
    const { text } = ivrAbsenceNote(
      'AAPL',
      { reason: 'insufficient_history', coverage: 150, window: 252, required: 200 },
      CONDITION
    )

    expect(text).toContain('covers 150 of the last 252 sessions and rank needs 200')
  })

  it('names the missing credentials', () => {
    expect(ivrAbsenceNote('AAPL', { reason: 'no_market_data' }, CONDITION).text).toContain(
      'Alpaca market-data credentials'
    )
  })

  it('says the last run failed', () => {
    expect(ivrAbsenceNote('AAPL', { reason: 'failed' }, CONDITION).text).toContain(
      'last IV history run failed'
    )
  })
})
