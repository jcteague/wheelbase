// [US-105] The Roll LEAPS form's derived view: validity, DTEs, net, post-roll figures, the
// below-short-strike shortfall, the roll label, the coverage change and the stays-open footer.
import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  LONG_NOT_AFTER_SHORT,
  leapsStrikeNotBelowShortMessage
} from '../../../main/core/pmcc-rules'
import { rollPmccLeapsSchema, type RollPmccLeapsFormValues } from '../schemas/roll-pmcc-leaps'
import {
  LEAPS_LAST_EVENT_DATE,
  LEAPS_LEDGER,
  LEAPS_LEG,
  LEAPS_OPEN_SHORT,
  LEAPS_TODAY
} from '../test-fixtures/pmcc-leaps-roll'
import { leapsRollView, type LeapsRollViewContext } from './pmcc-leaps-roll-view'

const schema = rollPmccLeapsSchema({
  currentLeaps: LEAPS_LEG,
  openShort: LEAPS_OPEN_SHORT,
  lastEventDate: LEAPS_LAST_EVENT_DATE
})

const ctx: LeapsRollViewContext = {
  schema,
  leaps: LEAPS_LEG,
  openShort: LEAPS_OPEN_SHORT,
  ledger: LEAPS_LEDGER,
  today: LEAPS_TODAY,
  errors: {}
}

const UP_OUT: RollPmccLeapsFormValues = {
  proceeds: '26.00',
  newStrike: '85',
  newDebit: '23.50',
  newExpiration: '2028-01-21',
  fillDate: LEAPS_TODAY
}

describe('leapsRollView', () => {
  it('derives every figure of a valid roll up and out', () => {
    expect(leapsRollView(UP_OUT, ctx)).toEqual({
      valid: true,
      leapsDte: 70,
      replacementDte: 196,
      fieldDte: 196,
      net: { net: new Decimal('2.50'), perShare: '2.50', total: '250.00' },
      postRoll: { postBasis: '19.30', leapsCostAfter: '22.50', effectiveAfter: '104.30' },
      shortfall: null,
      label: 'Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration · 196 DTE',
      coverageChange: 126,
      leavesLeapsOpen: false
    })
  })

  it('reports the shortfall when the effective cost rises above the open short strike', () => {
    const view = leapsRollView(
      { ...UP_OUT, newStrike: '80', newExpiration: '2029-01-19', newDebit: '37.00' },
      ctx
    )
    expect(view.postRoll?.effectiveAfter).toBe('112.80')
    expect(view.shortfall).toBe('0.80')
  })

  it('has no shortfall with no short open', () => {
    const view = leapsRollView(
      { ...UP_OUT, newStrike: '80', newExpiration: '2029-01-19', newDebit: '37.00' },
      { ...ctx, openShort: null }
    )
    expect(view.shortfall).toBeNull()
  })

  it('a server error on a valid expiration keeps the label DTE but hides the field DTE', () => {
    const view = leapsRollView(UP_OUT, {
      ...ctx,
      errors: { newExpiration: 'Rejected by the server.' }
    })
    expect(view.valid).toBe(true)
    expect(view.fieldDte).toBeNull()
    expect(view.replacementDte).toBe(196)
    expect(view.label).toBe(
      'Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration · 196 DTE'
    )
  })

  it('an invalid roll has no label, shortfall or coverage change', () => {
    const view = leapsRollView({ ...UP_OUT, newDebit: '0' }, ctx)
    expect(view.valid).toBe(false)
    expect(view.label).toBeNull()
    expect(view.shortfall).toBeNull()
    expect(view.coverageChange).toBeNull()
  })

  it('has no net or post-roll figures until both cash fields parse', () => {
    const view = leapsRollView({ ...UP_OUT, proceeds: '' }, ctx)
    expect(view.net).toBeNull()
    expect(view.postRoll).toBeNull()
  })

  it.each([
    ['the expiration fails to cover the short', { newExpiration: LONG_NOT_AFTER_SHORT.message }],
    [
      'the strike is not below the short',
      { newStrike: leapsStrikeNotBelowShortMessage(LEAPS_OPEN_SHORT.strike) }
    ]
  ])('leaves the LEAPS open when %s', (_name, errors) => {
    expect(leapsRollView(UP_OUT, { ...ctx, errors }).leavesLeapsOpen).toBe(true)
  })

  it.each([
    ['a non-positive strike', { newStrike: 'Strike must be positive' }],
    ['an expiration before the fill', { newExpiration: 'Expiration must be after the fill date.' }]
  ])('does not leave the LEAPS open for %s', (_name, errors) => {
    expect(leapsRollView(UP_OUT, { ...ctx, errors }).leavesLeapsOpen).toBe(false)
  })
})
