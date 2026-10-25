// Property tests: [US-106] the PMCC short-call assignment-risk rule — a floor 2% below the
// short-call strike with no ceiling, gated to PMCC_OPEN — and [US-107] the PMCC LEAPS
// roll-window rule, which reads the LEAPS leg only, and [US-107] leg applicability: a PMCC
// with no short call evaluates no short-leg rule.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { evaluatePosition, type AlertEvaluationInput, type PositionEvaluation } from './alerts'
import { WheelPhase } from './types'
import { contracts, nonNegativeMoney, positiveMoney } from './test-fixtures/arbitraries'

const RULE = 'PMCC_ASSIGNMENT_RISK'

interface RuleCase {
  strike: string
  price: string | null
  phase?: WheelPhase
  dte?: number | null
  leapsDte?: number | null
  leapsStrike?: string | null
}

const input = ({
  strike,
  price,
  phase = 'PMCC_OPEN',
  dte = 18,
  leapsDte = null,
  leapsStrike = null
}: RuleCase): AlertEvaluationInput => ({
  positionId: 'pos-1',
  phase,
  instrumentType: 'CALL',
  strike,
  dte,
  managementWindowDteOverride: null,
  entryPremiumPerContract: '2.0000',
  contracts: 1,
  currentOptionMid: '2.0000',
  profitTargetPercentOverride: null,
  currentUnderlyingPrice: price,
  daysToEarnings: null,
  expiration: '2026-10-16',
  leapsDte,
  leapsStrike
})

const fires = (ruleCase: RuleCase): boolean =>
  evaluatePosition(input(ruleCase)).matches.some((m) => m.ruleCode === RULE)

/** A price within ±5% of the strike, so the 2% floor is exercised densely, not by luck. */
const nearStrike = positiveMoney(1000).chain((strike) =>
  fc.integer({ min: -500, max: 500 }).map((basisPoints) => ({
    strike,
    price: new Decimal(strike)
      .times(10_000 + basisPoints)
      .dividedBy(10_000)
      .toDecimalPlaces(4)
      .toFixed(4)
  }))
)

const anyPair = fc.record({ strike: positiveMoney(1000), price: positiveMoney(2000) })

const nonPmccPhase = fc.constantFrom(...WheelPhase.options.filter((p) => p !== 'PMCC_OPEN'))

describe('PMCC_ASSIGNMENT_RISK — properties', () => {
  it('fires exactly when price × 100 ≥ strike × 98 (independent multiplication oracle)', () => {
    fc.assert(
      fc.property(fc.oneof(nearStrike, anyPair), ({ strike, price }) => {
        const oracle = new Decimal(price).times(100).gte(new Decimal(strike).times(98))
        expect(fires({ strike, price })).toBe(oracle)
      })
    )
  })

  it('stays firing as the price rises — the rule has no ceiling', () => {
    fc.assert(
      fc.property(nearStrike, nonNegativeMoney(1000), ({ strike, price }, increment) => {
        const higher = new Decimal(price).plus(increment).toFixed(4)
        if (fires({ strike, price })) expect(fires({ strike, price: higher })).toBe(true)
      })
    )
  })

  it('never matches or skips for a non-PMCC phase, with or without a quote', () => {
    fc.assert(
      fc.property(
        nonPmccPhase,
        positiveMoney(1000),
        fc.option(positiveMoney(2000), { nil: null }),
        (phase, strike, price) => {
          const { matches, skipped } = evaluatePosition(input({ phase, strike, price }))
          expect(matches.some((m) => m.ruleCode === RULE)).toBe(false)
          expect(skipped.some((s) => s.ruleCode === RULE)).toBe(false)
        }
      )
    )
  })
})

const LEAPS_RULE = 'PMCC_LEAPS_ROLL_WINDOW'

/** Any LEAPS DTE, plus a dense band around the 0 and 60 boundaries so both edges
 *  are exercised on every run rather than by luck. */
const leapsDteArb = fc.oneof(fc.integer({ min: -400, max: 800 }), fc.integer({ min: -5, max: 65 }))

/** Every match and skip except the LEAPS rule's own. */
const shortLeg = (ruleCase: RuleCase): PositionEvaluation => {
  const { matches, skipped } = evaluatePosition(input(ruleCase))
  return {
    matches: matches.filter((m) => m.ruleCode !== LEAPS_RULE),
    skipped: skipped.filter((s) => s.ruleCode !== LEAPS_RULE)
  }
}

describe('PMCC_LEAPS_ROLL_WINDOW — properties', () => {
  it('fires exactly when 0 <= leapsDte <= 60 (the literal story inequality)', () => {
    fc.assert(
      fc.property(leapsDteArb, positiveMoney(1000), (leapsDte, leapsStrike) => {
        const { matches } = evaluatePosition(
          input({ strike: '110.0000', price: '100.0000', leapsDte, leapsStrike })
        )
        const oracle = 0 <= leapsDte && leapsDte <= 60
        expect(matches.some((m) => m.ruleCode === LEAPS_RULE)).toBe(oracle)
      })
    )
  })

  it('never matches or skips for a non-PMCC phase, whatever the LEAPS fields hold', () => {
    fc.assert(
      fc.property(
        nonPmccPhase,
        fc.option(leapsDteArb, { nil: null }),
        fc.option(positiveMoney(1000), { nil: null }),
        (phase, leapsDte, leapsStrike) => {
          const { matches, skipped } = evaluatePosition(
            input({ phase, strike: '110.0000', price: '100.0000', leapsDte, leapsStrike })
          )
          expect(matches.some((m) => m.ruleCode === LEAPS_RULE)).toBe(false)
          expect(skipped.some((s) => s.ruleCode === LEAPS_RULE)).toBe(false)
        }
      )
    )
  })

  it('leaves every short-leg match and skip unchanged whatever the LEAPS fields hold', () => {
    fc.assert(
      fc.property(
        positiveMoney(1000),
        fc.option(positiveMoney(2000), { nil: null }),
        fc.option(fc.integer({ min: -10, max: 60 }), { nil: null }),
        fc.option(leapsDteArb, { nil: null }),
        fc.option(positiveMoney(1000), { nil: null }),
        (strike, price, dte, leapsDte, leapsStrike) => {
          expect(shortLeg({ strike, price, dte, leapsDte, leapsStrike })).toEqual(
            shortLeg({ strike, price, dte, leapsDte: null, leapsStrike: null })
          )
        }
      )
    )
  })
})

/** Every short-leg field, each independently present or absent — including
 *  values that would fire a short-leg rule if it were allowed to run. */
const shortLegFields = fc.record({
  strike: fc.option(positiveMoney(1000), { nil: null }),
  currentUnderlyingPrice: fc.option(positiveMoney(2000), { nil: null }),
  dte: fc.option(fc.integer({ min: -10, max: 60 }), { nil: null }),
  expiration: fc.option(fc.constant('2026-10-16'), { nil: null }),
  entryPremiumPerContract: fc.option(positiveMoney(20), { nil: null }),
  contracts: fc.option(contracts, { nil: null }),
  currentOptionMid: fc.option(nonNegativeMoney(20), { nil: null }),
  daysToEarnings: fc.option(fc.integer({ min: -5, max: 30 }), { nil: null })
})

describe('leg applicability — properties', () => {
  it('evaluates no rule but PMCC_LEAPS_ROLL_WINDOW on a PMCC with no short call, whatever the short-leg fields hold', () => {
    fc.assert(
      fc.property(
        shortLegFields,
        fc.option(leapsDteArb, { nil: null }),
        fc.option(positiveMoney(1000), { nil: null }),
        (shortFields, leapsDte, leapsStrike) => {
          const { matches, skipped } = evaluatePosition({
            ...input({ strike: '110.0000', price: null, leapsDte, leapsStrike }),
            ...shortFields,
            instrumentType: null
          })
          const codes = [...matches, ...skipped].map((r) => r.ruleCode)
          expect(codes.filter((code) => code !== LEAPS_RULE)).toEqual([])
        }
      )
    )
  })
})
