// Property tests: algebraic invariants of the cost-basis engine that hold for any input,
// complementing the worked examples in costbasis.test.ts.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import {
  calculateAssignmentBasis,
  calculateCallAway,
  calculateCcClose,
  calculateCcOpenBasis,
  calculateCspClose,
  calculateCspExpiration,
  calculateInitialCspBasis,
  calculateRollBasis,
  computeUnrealizedPnl
} from './costbasis'
import {
  contracts,
  isoDay,
  nonNegativeMoney,
  nonPositiveMoney,
  positiveMoney
} from './test-fixtures/arbitraries'

const SHARES_PER_CONTRACT = 100

const money = (value: string | number | Decimal): Decimal => new Decimal(value)

/** Engines return money as strings of varying precision; compare them as exact 4-dp amounts. */
function expectSameAmount(actual: string, expected: string | Decimal): void {
  expect(money(actual).toFixed(4)).toBe(money(expected).toFixed(4))
}

describe('calculateInitialCspBasis', () => {
  it('total premium is linear in contracts while basis per share ignores them', () => {
    fc.assert(
      fc.property(positiveMoney(), positiveMoney(), contracts, (strike, premium, n) => {
        const one = calculateInitialCspBasis({ strike, premiumPerContract: premium, contracts: 1 })
        const many = calculateInitialCspBasis({ strike, premiumPerContract: premium, contracts: n })
        expectSameAmount(many.totalPremiumCollected, money(one.totalPremiumCollected).times(n))
        expectSameAmount(many.basisPerShare, one.basisPerShare)
      })
    )
  })

  it('basis plus premium recovers the strike, and total premium scales by shares', () => {
    fc.assert(
      fc.property(positiveMoney(), positiveMoney(), contracts, (strike, premium, n) => {
        const result = calculateInitialCspBasis({
          strike,
          premiumPerContract: premium,
          contracts: n
        })
        expectSameAmount(money(result.basisPerShare).plus(premium).toString(), strike)
        expectSameAmount(
          result.totalPremiumCollected,
          money(premium).times(SHARES_PER_CONTRACT * n)
        )
      })
    )
  })
})

describe('calculateCspClose', () => {
  it('P&L is the per-contract spread times shares, and its percentage is relative to the open premium', () => {
    fc.assert(
      fc.property(positiveMoney(), nonNegativeMoney(), contracts, (open, close, n) => {
        const result = calculateCspClose({
          openPremiumPerContract: open,
          closePricePerContract: close,
          contracts: n
        })
        const spread = money(open).minus(close)
        expectSameAmount(result.finalPnl, spread.times(SHARES_PER_CONTRACT * n))
        expectSameAmount(result.pnlPercentage, spread.div(open).times(100).toDecimalPlaces(4))
      })
    )
  })

  it('closing at zero is the same P&L as letting the put expire', () => {
    fc.assert(
      fc.property(positiveMoney(), contracts, (open, n) => {
        const closed = calculateCspClose({
          openPremiumPerContract: open,
          closePricePerContract: '0',
          contracts: n
        })
        const expired = calculateCspExpiration({ openPremiumPerContract: open, contracts: n })
        expect(closed).toEqual(expired)
      })
    )
  })

  it('a covered-call close books the same leg P&L as a put close on the same fills', () => {
    fc.assert(
      fc.property(positiveMoney(), nonNegativeMoney(), contracts, (open, close, n) => {
        const input = { openPremiumPerContract: open, closePricePerContract: close, contracts: n }
        expect(calculateCcClose(input).ccLegPnl).toBe(calculateCspClose(input).finalPnl)
      })
    )
  })
})

describe('calculateAssignmentBasis', () => {
  const premiumLeg = fc.record({
    legRole: fc.constantFrom('CSP_OPEN', 'ROLL_TO'),
    premiumPerContract: positiveMoney(),
    contracts
  })

  it('basis is strike less every premium per share; total sums each leg by its own shares', () => {
    fc.assert(
      fc.property(
        positiveMoney(),
        contracts,
        fc.array(premiumLeg, { minLength: 1, maxLength: 6 }),
        (strike, n, premiumLegs) => {
          const result = calculateAssignmentBasis({ strike, contracts: n, premiumLegs })
          const perShare = premiumLegs.reduce(
            (sum, leg) => sum.plus(leg.premiumPerContract),
            money(0)
          )
          const total = premiumLegs.reduce(
            (sum, leg) =>
              sum.plus(money(leg.premiumPerContract).times(SHARES_PER_CONTRACT * leg.contracts)),
            money(0)
          )
          expectSameAmount(result.basisPerShare, money(strike).minus(perShare))
          expectSameAmount(result.totalPremiumCollected, total)
          expect(result.sharesHeld).toBe(SHARES_PER_CONTRACT * n)
          expect(result.premiumWaterfall.map((entry) => entry.amount)).toEqual(
            premiumLegs.map((leg) => leg.premiumPerContract)
          )
        }
      )
    )
  })

  it('a single CSP leg agrees with the initial CSP basis', () => {
    fc.assert(
      fc.property(positiveMoney(), positiveMoney(), contracts, (strike, premium, n) => {
        const initial = calculateInitialCspBasis({
          strike,
          premiumPerContract: premium,
          contracts: n
        })
        const assigned = calculateAssignmentBasis({
          strike,
          contracts: n,
          premiumLegs: [{ legRole: 'CSP_OPEN', premiumPerContract: premium, contracts: n }]
        })
        expectSameAmount(assigned.basisPerShare, initial.basisPerShare)
        expectSameAmount(assigned.totalPremiumCollected, initial.totalPremiumCollected)
      })
    )
  })
})

describe('calculateCcOpenBasis', () => {
  const ccOpen = fc
    .tuple(positiveMoney(), nonNegativeMoney(100_000), positiveMoney(), contracts, contracts)
    .map(([prev, prevTotal, premium, a, b]) => ({
      prevBasisPerShare: prev,
      prevTotalPremiumCollected: prevTotal,
      ccPremiumPerContract: premium,
      contracts: Math.min(a, b),
      positionContracts: Math.max(a, b)
    }))

  it('never raises the basis and always books the full premium', () => {
    fc.assert(
      fc.property(ccOpen, (input) => {
        const result = calculateCcOpenBasis(input)
        const basis = money(result.basisPerShare)
        expect(basis.lte(input.prevBasisPerShare)).toBe(true)
        expect(basis.gte(money(input.prevBasisPerShare).minus(input.ccPremiumPerContract))).toBe(
          true
        )
        expectSameAmount(
          result.totalPremiumCollected,
          money(input.prevTotalPremiumCollected).plus(
            money(input.ccPremiumPerContract).times(SHARES_PER_CONTRACT * input.contracts)
          )
        )
      })
    )
  })

  it('covering the whole position lowers the basis by exactly the premium', () => {
    fc.assert(
      fc.property(ccOpen, (partial) => {
        const input = { ...partial, contracts: partial.positionContracts }
        const result = calculateCcOpenBasis(input)
        expectSameAmount(
          result.basisPerShare,
          money(input.prevBasisPerShare).minus(input.ccPremiumPerContract)
        )
      })
    )
  })
})

describe('calculateRollBasis', () => {
  const roll = fc.record({
    prevBasisPerShare: positiveMoney(),
    prevTotalPremiumCollected: nonNegativeMoney(100_000),
    costToClosePerContract: positiveMoney(),
    newPremiumPerContract: positiveMoney(),
    contracts,
    prevStrike: positiveMoney(),
    newStrike: positiveMoney()
  })

  const netOf = (input: {
    newPremiumPerContract: string
    costToClosePerContract: string
  }): Decimal => money(input.newPremiumPerContract).minus(input.costToClosePerContract)

  it('total premium moves by the net credit times shares, for either leg type', () => {
    fc.assert(
      fc.property(roll, fc.constantFrom('CSP', 'CC'), (base, legType) => {
        const input = { ...base, legType, positionContracts: base.contracts } as const
        const result = calculateRollBasis(input)
        expectSameAmount(
          result.totalPremiumCollected,
          money(base.prevTotalPremiumCollected).plus(
            netOf(base).times(SHARES_PER_CONTRACT * base.contracts)
          )
        )
      })
    )
  })

  it('a CSP roll shifts the basis by the strike change less the net credit', () => {
    fc.assert(
      fc.property(roll, fc.boolean(), (base, sameStrike) => {
        const input = {
          ...base,
          legType: 'CSP',
          newStrike: sameStrike ? base.prevStrike : base.newStrike
        } as const
        const result = calculateRollBasis(input)
        const strikeShift = money(input.newStrike).minus(input.prevStrike)
        expectSameAmount(
          result.basisPerShare,
          money(base.prevBasisPerShare).plus(strikeShift).minus(netOf(base))
        )
      })
    )
  })

  it('a CC roll is a CC open at the net premium, on the same position', () => {
    fc.assert(
      fc.property(roll, (base) => {
        fc.pre(money(base.newPremiumPerContract).gt(base.costToClosePerContract))
        const rolled = calculateRollBasis({
          ...base,
          legType: 'CC',
          positionContracts: base.contracts
        })
        const opened = calculateCcOpenBasis({
          prevBasisPerShare: base.prevBasisPerShare,
          prevTotalPremiumCollected: base.prevTotalPremiumCollected,
          ccPremiumPerContract: netOf(base).toFixed(4),
          contracts: base.contracts,
          positionContracts: base.contracts
        })
        expect(rolled).toEqual(opened)
      })
    )
  })

  it('a CC roll over the whole position shifts the basis by exactly the net credit', () => {
    fc.assert(
      fc.property(roll, (base) => {
        const result = calculateRollBasis({
          ...base,
          legType: 'CC',
          positionContracts: base.contracts
        })
        expectSameAmount(result.basisPerShare, money(base.prevBasisPerShare).minus(netOf(base)))
      })
    )
  })
})

describe('computeUnrealizedPnl', () => {
  it('P&L plus the cost to close equals max profit; 100% at a zero mid; signed like the spread', () => {
    fc.assert(
      fc.property(positiveMoney(), nonNegativeMoney(), contracts, (entry, mid, n) => {
        const result = computeUnrealizedPnl({ entryPremium: entry, currentMid: mid, contracts: n })
        const shares = SHARES_PER_CONTRACT * n
        expectSameAmount(
          money(result.pnl).plus(money(mid).times(shares)).toString(),
          result.maxProfit
        )
        expectSameAmount(result.maxProfit, money(entry).times(shares))
        expect(money(result.pnlPercent).lte(100)).toBe(true)
        // Only one direction: a mid of 0.0001 on a large premium also rounds to 100.0000.
        if (money(mid).isZero()) expect(money(result.pnlPercent).equals(100)).toBe(true)
        expect(money(result.pnl).comparedTo(0)).toBe(money(entry).comparedTo(mid))
      })
    )
  })

  it('rejects a non-positive entry, a negative mid, or a non-positive-integer contract count', () => {
    const valid = { entryPremium: '1.0000', currentMid: '0.5000', contracts: 1 }
    const invalid = fc.oneof(
      nonPositiveMoney().map((entryPremium) => ({ ...valid, entryPremium })),
      positiveMoney().map((m) => ({ ...valid, currentMid: money(m).neg().toFixed(4) })),
      fc
        .oneof(
          fc.integer({ max: 0 }),
          fc.double({ min: 0.5, max: 50, noInteger: true, noNaN: true })
        )
        .map((n) => ({ ...valid, contracts: n }))
    )
    fc.assert(
      fc.property(invalid, (input) => {
        expect(() => computeUnrealizedPnl(input)).toThrow()
      })
    )
  })
})

describe('calculateCallAway', () => {
  const callAway = fc.record({
    ccStrike: positiveMoney(),
    basisPerShare: positiveMoney(),
    contracts,
    positionOpenedDate: isoDay,
    fillDate: isoDay
  })

  it('P&L and capital scale with shares; cycle days agree with date-fns', () => {
    fc.assert(
      fc.property(callAway, (input) => {
        const result = calculateCallAway(input)
        const shares = SHARES_PER_CONTRACT * input.contracts
        expectSameAmount(
          result.finalPnl,
          money(input.ccStrike).minus(input.basisPerShare).times(shares)
        )
        expectSameAmount(result.capitalDeployed, money(input.basisPerShare).times(shares))
        expect(result.cycleDays).toBe(
          differenceInCalendarDays(parseISO(input.fillDate), parseISO(input.positionOpenedDate))
        )
      })
    )
  })

  it('annualized return is a rate: zero without elapsed days, signed like the P&L, and independent of size', () => {
    fc.assert(
      fc.property(callAway, contracts, (input, otherContracts) => {
        const result = calculateCallAway(input)
        const annualized = money(result.annualizedReturn)
        if (result.cycleDays <= 0) {
          expect(annualized.isZero()).toBe(true)
          return
        }
        // Rounding to 4 dp can flatten a tiny spread over a long cycle to 0.0000 —
        // the sign is only meaningful when something survived the rounding.
        if (!annualized.isZero()) {
          expect(annualized.comparedTo(0)).toBe(money(result.finalPnl).comparedTo(0))
        }
        const resized = calculateCallAway({ ...input, contracts: otherContracts })
        expect(resized.annualizedReturn).toBe(result.annualizedReturn)
      })
    )
  })
})

describe('full wheel cycle', () => {
  it('call-away P&L equals the strike gain plus every premium collected', () => {
    fc.assert(
      fc.property(
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        contracts,
        fc.array(positiveMoney(), { minLength: 0, maxLength: 5 }),
        isoDay,
        isoDay,
        (assignmentStrike, ccStrike, cspPremium, n, ccPremiums, opened, filled) => {
          const assigned = calculateAssignmentBasis({
            strike: assignmentStrike,
            contracts: n,
            premiumLegs: [{ legRole: 'CSP_OPEN', premiumPerContract: cspPremium, contracts: n }]
          })
          const afterCalls = ccPremiums.reduce(
            (state, premium) =>
              calculateCcOpenBasis({
                prevBasisPerShare: state.basisPerShare,
                prevTotalPremiumCollected: state.totalPremiumCollected,
                ccPremiumPerContract: premium,
                contracts: n,
                positionContracts: n
              }),
            {
              basisPerShare: assigned.basisPerShare,
              totalPremiumCollected: assigned.totalPremiumCollected
            }
          )
          const callAway = calculateCallAway({
            ccStrike,
            basisPerShare: afterCalls.basisPerShare,
            contracts: n,
            positionOpenedDate: opened,
            fillDate: filled
          })

          const strikeGain = money(ccStrike)
            .minus(assignmentStrike)
            .times(SHARES_PER_CONTRACT * n)
          expectSameAmount(callAway.finalPnl, strikeGain.plus(afterCalls.totalPremiumCollected))
        }
      )
    )
  })
})
