// Property tests: the shared coverage comparator — a PMCC short call must expire strictly
// before its LEAPS — and the cross-leg rule that reports it.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import {
  pmccCrossLegIssues,
  pmccShortRollIssues,
  SHORT_NOT_BEFORE_LONG,
  shortExpiresBeforeLeaps,
  type PmccCrossLegValues
} from './pmcc-rules'
import { isoDay, positiveMoney, strictlyOrderedDays } from './test-fixtures/arbitraries'

// Before every `isoDay` (2020+), so no generated expiration is expired or on/before its fill.
const REFERENCE_DATE = '2019-12-31'

const leg = (strike: string, fillPrice: string, expiration: string): PmccCrossLegValues => ({
  strike,
  expiration,
  fillPrice,
  fillDate: REFERENCE_DATE
})

describe('shortExpiresBeforeLeaps', () => {
  it('holds exactly when the short expiration is the earlier calendar day', () => {
    fc.assert(
      fc.property(isoDay, isoDay, (short, long) => {
        const earlier = new Date(`${short}T00:00:00Z`) < new Date(`${long}T00:00:00Z`)
        expect(shortExpiresBeforeLeaps(short, long)).toBe(earlier)
      })
    )
  })
})

describe('pmccCrossLegIssues — coverage rule', () => {
  it('reports short_not_before_long iff the short call does not expire before the LEAPS', () => {
    fc.assert(
      fc.property(isoDay, isoDay, (shortExpiration, longExpiration) => {
        const issues = pmccCrossLegIssues({
          long: leg('80', '25.00', longExpiration),
          short: leg('110', '2.00', shortExpiration),
          referenceDate: REFERENCE_DATE
        })
        const reported = issues.some(({ code }) => code === SHORT_NOT_BEFORE_LONG.code)
        expect(reported).toBe(!shortExpiresBeforeLeaps(shortExpiration, longExpiration))
      })
    )
  })
})

describe('pmccShortRollIssues — fill-after-expiration rule', () => {
  it('reports close_date_after_expiration iff the roll fills after the open short expires', () => {
    fc.assert(
      fc.property(isoDay, isoDay, (fillDate, expiration) => {
        // Opened before every generated day, with the replacement undecided, so only this
        // rule can fire.
        const issues = pmccShortRollIssues({
          openShort: { strike: '100', expiration, fillDate: REFERENCE_DATE },
          leapsExpiration: '2099-01-01',
          fillDate,
          newStrike: undefined,
          newExpiration: undefined
        })
        const after = new Date(`${fillDate}T00:00:00Z`) > new Date(`${expiration}T00:00:00Z`)
        expect(issues.map(({ code }) => code)).toEqual(after ? ['close_date_after_expiration'] : [])
      })
    )
  })
})

describe('pmccShortRollIssues — no-change rule', () => {
  // Strictly ordered: open fill < roll fill < current expiration < later expiration < LEAPS, so
  // every date rule holds and only the no-change rule can fire.
  const roll = fc.record({
    days: strictlyOrderedDays(5),
    currentStrike: positiveMoney(500),
    otherStrike: positiveMoney(500),
    sameStrike: fc.boolean(),
    sameExpiration: fc.boolean()
  })

  it('reports no_change iff the strike and the expiration both equal the open short', () => {
    fc.assert(
      fc.property(roll, ({ days, currentStrike, otherStrike, sameStrike, sameExpiration }) => {
        const [openFill, rollFill, currentExpiration, laterExpiration, leapsExpiration] = days
        // The same strike re-spelled without trailing zeros, so equality must be numeric.
        const newStrike = sameStrike ? new Decimal(currentStrike).toString() : otherStrike
        const newExpiration = sameExpiration ? currentExpiration : laterExpiration
        const issues = pmccShortRollIssues({
          openShort: { strike: currentStrike, expiration: currentExpiration, fillDate: openFill },
          leapsExpiration,
          fillDate: rollFill,
          newStrike,
          newExpiration
        })
        const unchanged =
          Number(newStrike) === Number(currentStrike) && newExpiration === currentExpiration
        expect(issues.map(({ code }) => code)).toEqual(unchanged ? ['no_change'] : [])
      })
    )
  })
})
