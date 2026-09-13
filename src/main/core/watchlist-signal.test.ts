import { describe, expect, it } from 'vitest'

import type { AssessedIvRank, IvRankState } from './ivr-freshness'
import type { EarningsLookup } from './screener'
import {
  allGatesPass,
  earningsDisplay,
  evaluateEntry,
  reasonsFor,
  type EntrySignalInput,
  type EntryVerdict,
  type Gate,
  type GateVerdict
} from './watchlist-signal'

// 13:00 in New York on Sep 8. The base cases sit well inside the Eastern day so they are
// not accidentally testing the timezone edge — that edge has its own test below.
const NOW = new Date('2026-09-08T17:00:00.000Z')

const reading = (value: string, state: IvRankState, ageTradingDays = 0): AssessedIvRank => ({
  value,
  observedAt: '2026-09-04T20:00:00.000Z',
  ageTradingDays,
  state
})

const conditions = (
  overrides: Partial<EntrySignalInput['conditions']> = {}
): EntrySignalInput['conditions'] => ({
  ownBelowPrice: null,
  ivrTrigger: null,
  postEarningsOnly: false,
  ...overrides
})

const input = (overrides: Partial<EntrySignalInput> = {}): EntrySignalInput => ({
  conditions: conditions(),
  price: null,
  ivRank: null,
  earnings: { status: 'none' },
  now: NOW,
  ...overrides
})

const found = (date: string): EarningsLookup => ({ status: 'found', date })
const gate = (verdict: GateVerdict, label: string | null = null): Gate => ({ verdict, label })

describe('[US-96] watchlist signal — price gate', () => {
  it('is none when the entry has no "would own below" target', () => {
    expect(evaluateEntry(input({ price: '178.4000' })).price).toEqual(gate('none'))
  })

  it('is unknown when a target is set but the quote is missing', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ownBelowPrice: '170.0000' }), price: null })
    )
    expect(verdict.price).toEqual(gate('unknown', 'Price unavailable'))
  })

  it('is met when the price is below the target', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ownBelowPrice: '185.0000' }), price: '178.4000' })
    )
    expect(verdict.price).toEqual(gate('met'))
  })

  it('is unmet with the 2dp price and the trimmed target when the price is above it', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ownBelowPrice: '170.0000' }), price: '178.4000' })
    )
    expect(verdict.price).toEqual(gate('unmet', 'Price $178.40 above $170 target'))
  })

  it('is met when the price sits exactly on the target', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ownBelowPrice: '170.0000' }), price: '170.0000' })
    )
    expect(verdict.price).toEqual(gate('met'))
  })
})

describe('[US-96] watchlist signal — IV gate', () => {
  it('is none when the entry has no IV-rank trigger', () => {
    expect(evaluateEntry(input({ ivRank: reading('58.0', 'fresh') })).iv).toEqual(gate('none'))
  })

  it('is unknown when no reading has ever been collected', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ivrTrigger: 40 }), ivRank: null })
    )
    expect(verdict.iv).toEqual(gate('unknown', 'IV unavailable'))
  })

  it('is unknown for an expired reading', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ivrTrigger: 40 }), ivRank: reading('47.0', 'expired', 12) })
    )
    expect(verdict.iv).toEqual(gate('unknown', 'IV unavailable'))
  })

  it('is unknown for a stale reading', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ivrTrigger: 45 }), ivRank: reading('58.0', 'stale', 6) })
    )
    expect(verdict.iv).toEqual(gate('unknown', 'IV too old to judge'))
  })

  it('is unknown for a reading that predates a known earnings print', () => {
    const verdict = evaluateEntry(
      input({
        conditions: conditions({ ivrTrigger: 50 }),
        ivRank: reading('62.0', 'predates_earnings', 1)
      })
    )
    expect(verdict.iv).toEqual(gate('unknown', 'IV predates earnings'))
  })

  it('is met when a fresh reading is at or above the trigger', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ivrTrigger: 40 }), ivRank: reading('58.0', 'fresh') })
    )
    expect(verdict.iv).toEqual(gate('met'))
  })

  it('is met when an aging reading is above the trigger', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ivrTrigger: 40 }), ivRank: reading('58.0', 'aging', 2) })
    )
    expect(verdict.iv).toEqual(gate('met'))
  })

  it('is unmet when a usable reading is below the trigger', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ivrTrigger: 50 }), ivRank: reading('34.0', 'fresh') })
    )
    expect(verdict.iv).toEqual(gate('unmet', 'IV low'))
  })

  it('is met when a usable reading sits exactly on the trigger', () => {
    const verdict = evaluateEntry(
      input({ conditions: conditions({ ivrTrigger: 50 }), ivRank: reading('50.0', 'fresh') })
    )
    expect(verdict.iv).toEqual(gate('met'))
  })
})

describe('[US-96] watchlist signal — earnings gate', () => {
  const postEarnings = (earnings: EarningsLookup, now = NOW): EntryVerdict['earnings'] =>
    evaluateEntry(input({ conditions: conditions({ postEarningsOnly: true }), earnings, now }))
      .earnings

  it('is none when the entry does not ask to wait for earnings', () => {
    expect(evaluateEntry(input({ earnings: found('2026-09-11') })).earnings).toEqual(gate('none'))
  })

  it('is unmet with a day count when earnings is inside the window', () => {
    expect(postEarnings(found('2026-09-11'))).toEqual(gate('unmet', 'Earnings in 3 days'))
  })

  it('says "1 day" in the singular the day before earnings', () => {
    expect(postEarnings(found('2026-09-09'))).toEqual(gate('unmet', 'Earnings in 1 day'))
  })

  it('says "Earnings today" when the print lands on the current Eastern day', () => {
    expect(postEarnings(found('2026-09-08'))).toEqual(gate('unmet', 'Earnings today'))
  })

  it('is met when earnings is beyond the window', () => {
    expect(postEarnings(found('2026-09-16'))).toEqual(gate('met'))
  })

  it('is unmet on the last day of the window — the window is inclusive at 7 days', () => {
    expect(postEarnings(found('2026-09-15'))).toEqual(gate('unmet', 'Earnings in 7 days'))
  })

  it('is unknown when the known earnings date has already passed', () => {
    expect(postEarnings(found('2026-09-07'))).toEqual(gate('unknown', 'Earnings date unknown'))
  })

  it('is unknown when no earnings date is on file', () => {
    expect(postEarnings({ status: 'none' })).toEqual(gate('unknown', 'Earnings date unknown'))
  })

  it('is unknown when the earnings read was unavailable', () => {
    expect(postEarnings({ status: 'unavailable' })).toEqual(
      gate('unknown', 'Earnings date unknown')
    )
  })

  // A date the store handed us but nobody can parse yields NaN, and every comparison
  // against NaN is false — so an unguarded gate falls through its window check and reports
  // `met`. That is the exact inversion of this module's rule: an unknown decides nothing,
  // and least of all does it clear a trader into an unpriced print.
  it('is unknown when the earnings date cannot be parsed, never met', () => {
    expect(postEarnings(found('not-a-date'))).toEqual(gate('unknown', 'Earnings date unknown'))
    expect(postEarnings(found(''))).toEqual(gate('unknown', 'Earnings date unknown'))
  })

  it('is unknown when the clock itself is invalid', () => {
    expect(postEarnings(found('2026-09-16'), new Date('nonsense'))).toEqual(
      gate('unknown', 'Earnings date unknown')
    )
  })

  // 03:30 UTC is 23:30 the previous evening in New York, so "today" is still Sep 8 and the
  // Sep 11 print is three calendar days out — not the two a UTC day count would report.
  it('counts days from the Eastern calendar day, not the UTC one', () => {
    expect(postEarnings(found('2026-09-11'), new Date('2026-09-09T03:30:00.000Z'))).toEqual(
      gate('unmet', 'Earnings in 3 days')
    )
  })
})

describe('[US-96] watchlist signal — reasonsFor', () => {
  const verdict = (overrides: Partial<EntryVerdict> = {}): EntryVerdict => ({
    price: gate('none'),
    iv: gate('none'),
    earnings: gate('none'),
    ...overrides
  })

  it('lists unmet and unknown labels in earnings → price → IV order', () => {
    expect(
      reasonsFor(
        verdict({
          price: gate('unmet', 'Price $178.40 above $170 target'),
          iv: gate('unmet', 'IV low'),
          earnings: gate('unmet', 'Earnings in 3 days')
        })
      )
    ).toEqual(['Earnings in 3 days', 'Price $178.40 above $170 target', 'IV low'])
  })

  it('skips gates that are met or none', () => {
    expect(
      reasonsFor(verdict({ price: gate('met'), iv: gate('unknown', 'IV too old to judge') }))
    ).toEqual(['IV too old to judge'])
  })

  it('is empty when every gate is met or none', () => {
    expect(reasonsFor(verdict({ price: gate('met'), iv: gate('met') }))).toEqual([])
  })
})

describe('[US-96] watchlist signal — allGatesPass', () => {
  const verdict = (overrides: Partial<EntryVerdict> = {}): EntryVerdict => ({
    price: gate('none'),
    iv: gate('none'),
    earnings: gate('none'),
    ...overrides
  })

  it('is true when every gate is met or none', () => {
    expect(allGatesPass(verdict({ price: gate('met'), earnings: gate('met') }))).toBe(true)
  })

  it('is false when any gate is unmet', () => {
    expect(allGatesPass(verdict({ price: gate('met'), iv: gate('unmet', 'IV low') }))).toBe(false)
  })

  it('is false when any gate is unknown', () => {
    expect(allGatesPass(verdict({ iv: gate('unknown', 'IV unavailable') }))).toBe(false)
  })
})

describe('[US-96] watchlist signal — earningsDisplay', () => {
  it('reports an upcoming date with its day count', () => {
    expect(earningsDisplay(found('2026-09-13'), NOW)).toEqual({
      kind: 'date',
      date: '2026-09-13',
      daysUntil: 5,
      withinWindow: true
    })
  })

  it('is still within the window on the seventh day', () => {
    expect(earningsDisplay(found('2026-09-15'), NOW)).toMatchObject({
      daysUntil: 7,
      withinWindow: true
    })
  })

  it('is outside the window on the eighth day', () => {
    expect(earningsDisplay(found('2026-09-16'), NOW)).toMatchObject({
      daysUntil: 8,
      withinWindow: false
    })
  })

  it('is unknown when the known date has already passed', () => {
    expect(earningsDisplay(found('2026-09-07'), NOW)).toEqual({ kind: 'unknown' })
  })

  it('is unknown when no date is on file', () => {
    expect(earningsDisplay({ status: 'none' }, NOW)).toEqual({ kind: 'unknown' })
  })

  it('is unknown when the earnings read was unavailable', () => {
    expect(earningsDisplay({ status: 'unavailable' }, NOW)).toEqual({ kind: 'unknown' })
  })

  // An unparseable date must not reach the row as a date: `in NaN days` is the visible
  // half of the same defect that lets the gate report `met`.
  it('is unknown when the date or the clock cannot be read', () => {
    expect(earningsDisplay(found('not-a-date'), NOW)).toEqual({ kind: 'unknown' })
    expect(earningsDisplay(found('2026-09-16'), new Date('nonsense'))).toEqual({ kind: 'unknown' })
  })
})
