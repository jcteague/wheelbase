// [US-108] Which PMCC leg blocks carry an action state's mark: every leg the action names.
import { describe, expect, it } from 'vitest'
import type { PmccLegSummary } from '../api/positions'
import type { PmccAction } from '../../../main/core/pmcc-card'
import { XYZ_LEAPS_LEG, XYZ_SHORT_112_LEG, XYZ_SHORT_LEG } from '../test-fixtures/wheel-cards'
import { openLeg } from './pmcc-card-legs'

const TARGET_PERCENT = 50

const BOTH_SHORTS_BELOW: PmccAction = {
  glyph: '✕',
  statusWord: 'BELOW BREAKEVEN',
  tone: 'red',
  rank: 0,
  summary: '$108.00 strike is $4.20 under the $112.20 breakeven · roll up before it is called',
  tooltip: 'Short strike below breakeven $112.20 — being called away locks in a loss',
  legs: [
    { side: 'SHORT', legId: 'xyz-short' },
    { side: 'SHORT', legId: 'xyz-short-112' }
  ]
}

const LEAPS_ROLL: PmccAction = {
  glyph: '◆',
  statusWord: 'ROLL WINDOW',
  tone: 'gold',
  rank: 3,
  summary: 'LEAPS 59d left, inside the 60-day window · roll while it has time value',
  tooltip: 'LEAPS inside the 60-day roll window',
  legs: [{ side: 'LONG' }]
}

/** Each leg's owned status words, given both actions. */
const ownedWords = (legs: PmccLegSummary[]): string[][] =>
  legs.map((leg) =>
    openLeg({ leg, snapshot: null }, [BOTH_SHORTS_BELOW, LEAPS_ROLL], TARGET_PERCENT).actions.map(
      (action) => action.statusWord
    )
  )

describe('openLeg — the action states a leg owns', () => {
  it('marks every short an action names, and the LEAPS only with its own action', () => {
    expect(ownedWords([XYZ_LEAPS_LEG, XYZ_SHORT_LEG, XYZ_SHORT_112_LEG])).toEqual([
      ['ROLL WINDOW'],
      ['BELOW BREAKEVEN'],
      ['BELOW BREAKEVEN']
    ])
  })

  it('leaves a short the action does not name unmarked', () => {
    const otherShort = { ...XYZ_SHORT_LEG, legId: 'xyz-short-115', strike: '115.0000' }
    expect(ownedWords([otherShort])).toEqual([[]])
  })
})
