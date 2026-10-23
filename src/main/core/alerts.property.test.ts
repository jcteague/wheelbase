// Property tests: [US-106] the PMCC short-call assignment-risk rule — a floor 2% below the
// short-call strike with no ceiling, gated to PMCC_OPEN.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { evaluatePosition, type AlertEvaluationInput } from './alerts'
import { WheelPhase } from './types'
import { nonNegativeMoney, positiveMoney } from './test-fixtures/arbitraries'

const RULE = 'PMCC_ASSIGNMENT_RISK'

interface RuleCase {
  strike: string
  price: string | null
  phase?: WheelPhase
}

const input = ({ strike, price, phase = 'PMCC_OPEN' }: RuleCase): AlertEvaluationInput => ({
  positionId: 'pos-1',
  phase,
  instrumentType: 'CALL',
  strike,
  dte: 18,
  managementWindowDteOverride: null,
  entryPremiumPerContract: '2.0000',
  contracts: 1,
  currentOptionMid: '2.0000',
  profitTargetPercentOverride: null,
  currentUnderlyingPrice: price,
  daysToEarnings: null,
  expiration: '2026-10-16'
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
