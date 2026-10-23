// Property tests: the shared coverage comparator — a PMCC short call must expire strictly
// before its LEAPS — and the cross-leg rule that reports it.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import {
  pmccCrossLegIssues,
  pmccLeapsRollIssues,
  pmccShortRollIssues,
  SHORT_NOT_BEFORE_LONG,
  shortExpiresBeforeLeaps,
  shortStrikeAboveLeaps,
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

  it('always rejects equal expiration dates', () => {
    fc.assert(
      fc.property(isoDay, (expiration) => {
        expect(shortExpiresBeforeLeaps(expiration, expiration)).toBe(false)
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
        const onOrAfter =
          new Date(`${shortExpiration}T00:00:00Z`) >= new Date(`${longExpiration}T00:00:00Z`)
        expect(reported).toBe(onOrAfter)
      })
    )
  })
})

// [US-105] The strike-ordering predicate shared by the entry rule and the LEAPS roll.
describe('shortStrikeAboveLeaps', () => {
  // Two distinct strikes, built apart by a positive gap rather than filtered for inequality.
  const strikePair = fc
    .tuple(positiveMoney(), positiveMoney(100))
    .map(([lower, gap]) => ({ lower, higher: new Decimal(lower).plus(gap).toFixed(4) }))

  it('holds when the LEAPS strike sits a positive gap below the short strike', () => {
    fc.assert(
      fc.property(strikePair, ({ lower, higher }) => {
        expect(shortStrikeAboveLeaps(higher, lower)).toBe(true)
      })
    )
  })

  it('is antisymmetric: for distinct strikes exactly one order holds', () => {
    fc.assert(
      fc.property(strikePair, ({ lower, higher }) => {
        expect(shortStrikeAboveLeaps(lower, higher)).toBe(false)
        expect(shortStrikeAboveLeaps(higher, lower)).not.toBe(shortStrikeAboveLeaps(lower, higher))
      })
    )
  })

  it('is irreflexive, however the equal strikes are formatted', () => {
    fc.assert(
      fc.property(positiveMoney(), (strike) => {
        // '112.0000' and its trimmed form '112' are the same strike.
        const trimmed = new Decimal(strike).toString()
        expect(shortStrikeAboveLeaps(strike, strike)).toBe(false)
        expect(shortStrikeAboveLeaps(strike, trimmed)).toBe(false)
        expect(shortStrikeAboveLeaps(trimmed, strike)).toBe(false)
      })
    )
  })
})

describe('pmccCrossLegIssues — strike-ordering rule', () => {
  it('reports strike_not_above_long iff the short strike is not above the LEAPS strike', () => {
    fc.assert(
      fc.property(positiveMoney(), positiveMoney(), (shortStrike, longStrike) => {
        // Debit and expirations fixed valid, so only the strike rule can fire.
        const issues = pmccCrossLegIssues({
          long: leg(longStrike, '25.00', '2099-01-16'),
          short: leg(shortStrike, '2.00', '2098-12-18'),
          referenceDate: REFERENCE_DATE
        })
        const reported = issues.some(({ code }) => code === 'strike_not_above_long')
        expect(reported).toBe(new Decimal(shortStrike).lte(longStrike))
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

// [US-105] The LEAPS roll's date rules: a roll can neither precede the position's last recorded
// event (which is never before the LEAPS it sells) nor leave an already-expired replacement as
// the open LEAPS.
describe('pmccLeapsRollIssues — before-last-event rule', () => {
  it('reports before_last_event whenever the roll fills strictly before the last recorded event', () => {
    fc.assert(
      fc.property(
        strictlyOrderedDays(2),
        isoDay,
        isoDay,
        positiveMoney(),
        positiveMoney(),
        fc.option(fc.record({ strike: positiveMoney(), expiration: isoDay }), { nil: null }),
        (
          [fillDate, lastEventDate],
          leapsExpiration,
          newExpiration,
          leapsStrike,
          newStrike,
          openShort
        ) => {
          const issues = pmccLeapsRollIssues({
            currentLeaps: { strike: leapsStrike, expiration: leapsExpiration },
            openShort,
            lastEventDate,
            fillDate,
            newStrike,
            newExpiration
          })
          expect(issues).toContainEqual(
            expect.objectContaining({ field: 'fillDate', code: 'before_last_event' })
          )
        }
      )
    )
  })
})

describe('pmccLeapsRollIssues — replacement-expiry rule', () => {
  it('with no short open, reports expiration_not_after_fill iff the replacement expires on or before the fill', () => {
    fc.assert(
      fc.property(isoDay, isoDay, positiveMoney(), (fillDate, newExpiration, newStrike) => {
        // The LEAPS was filled before and expires after every generated day, so only this
        // rule can fire.
        const issues = pmccLeapsRollIssues({
          currentLeaps: { strike: '80', expiration: '2099-01-01' },
          openShort: null,
          lastEventDate: REFERENCE_DATE,
          fillDate,
          newStrike,
          newExpiration
        })
        const onOrBefore =
          new Date(`${newExpiration}T00:00:00Z`) <= new Date(`${fillDate}T00:00:00Z`)
        expect(issues.map(({ code }) => code)).toEqual(
          onOrBefore ? ['expiration_not_after_fill'] : []
        )
      })
    )
  })
})
