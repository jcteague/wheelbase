// Property tests: the phase guards and field validators of the lifecycle engine hold for
// every input shape, not just the worked examples in lifecycle.test.ts.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { calculateCspClose } from './costbasis'
import {
  ValidationError,
  closeCoveredCall,
  closeCsp,
  expireCc,
  expireCsp,
  openCoveredCall,
  openWheel,
  recordAssignment,
  recordCallAway,
  rollCc,
  rollCsp
} from './lifecycle'
import type { WheelPhase } from './types'
import {
  contracts,
  isoDay,
  nonPositiveMoney,
  orderedDays,
  positiveMoney,
  ticker,
  wheelPhase
} from './test-fixtures/arbitraries'

function validationErrorOf(run: () => unknown): ValidationError {
  try {
    run()
  } catch (error) {
    if (error instanceof ValidationError) return error
    throw error
  }
  throw new Error('expected a ValidationError')
}

describe('phase guards', () => {
  const DAY = '2026-01-15'
  const guarded: Array<{
    name: string
    requiredPhase: WheelPhase
    run: (currentPhase: WheelPhase) => unknown
  }> = [
    {
      name: 'closeCsp',
      requiredPhase: 'CSP_OPEN',
      run: (currentPhase) =>
        closeCsp({
          currentPhase,
          closePricePerContract: '1',
          openPremiumPerContract: '2',
          closeFillDate: DAY,
          openFillDate: DAY,
          expiration: DAY
        })
    },
    {
      name: 'expireCsp',
      requiredPhase: 'CSP_OPEN',
      run: (currentPhase) => expireCsp({ currentPhase, expirationDate: DAY, referenceDate: DAY })
    },
    {
      name: 'recordAssignment',
      requiredPhase: 'CSP_OPEN',
      run: (currentPhase) =>
        recordAssignment({ currentPhase, assignmentDate: DAY, openFillDate: DAY })
    },
    {
      name: 'rollCsp',
      requiredPhase: 'CSP_OPEN',
      run: (currentPhase) =>
        rollCsp({
          currentPhase,
          currentExpiration: DAY,
          newExpiration: '2026-02-15',
          costToClosePerContract: '1',
          newPremiumPerContract: '2'
        })
    },
    {
      name: 'openCoveredCall',
      requiredPhase: 'HOLDING_SHARES',
      run: (currentPhase) =>
        openCoveredCall({
          currentPhase,
          strike: '100',
          contracts: 1,
          positionContracts: 1,
          premiumPerContract: '1',
          fillDate: DAY,
          assignmentDate: DAY,
          referenceDate: DAY,
          expiration: DAY
        })
    },
    {
      name: 'recordCallAway',
      requiredPhase: 'CC_OPEN',
      run: (currentPhase) =>
        recordCallAway({ currentPhase, contracts: 1, fillDate: DAY, ccOpenFillDate: DAY })
    },
    {
      name: 'expireCc',
      requiredPhase: 'CC_OPEN',
      run: (currentPhase) => expireCc({ currentPhase, expirationDate: DAY, referenceDate: DAY })
    },
    {
      name: 'closeCoveredCall',
      requiredPhase: 'CC_OPEN',
      run: (currentPhase) =>
        closeCoveredCall({
          currentPhase,
          closePricePerContract: '1',
          openFillDate: DAY,
          fillDate: DAY,
          expiration: DAY
        })
    },
    {
      name: 'rollCc',
      requiredPhase: 'CC_OPEN',
      run: (currentPhase) =>
        rollCc({
          currentPhase,
          currentStrike: '100',
          currentExpiration: DAY,
          newStrike: '105',
          newExpiration: DAY,
          costToClosePerContract: '1',
          newPremiumPerContract: '2'
        })
    }
  ]

  it.each(guarded)(
    '$name rejects every phase other than $requiredPhase',
    ({ requiredPhase, run }) => {
      fc.assert(
        fc.property(
          wheelPhase.filter((phase) => phase !== requiredPhase),
          (phase) => {
            const error = validationErrorOf(() => run(phase))
            expect(error.field).toBe('__phase__')
            expect(error.code).toBe('invalid_phase')
          }
        )
      )
    }
  )

  it.each(guarded)(
    '$name accepts $requiredPhase on otherwise valid input',
    ({ requiredPhase, run }) => {
      expect(() => run(requiredPhase)).not.toThrow()
    }
  )
})

describe('openWheel', () => {
  const validOpen = fc
    .tuple(ticker, positiveMoney(), contracts, positiveMoney(), orderedDays(2), isoDay)
    .map(([symbol, strike, n, premium, [fillDate, expiration], later]) => ({
      ticker: symbol,
      strike,
      expiration,
      contracts: n,
      premiumPerContract: premium,
      fillDate,
      referenceDate: later < fillDate ? fillDate : later
    }))

  it('accepts every well-formed input', () => {
    fc.assert(
      fc.property(validOpen, (input) => {
        expect(openWheel(input)).toEqual({ phase: 'CSP_OPEN' })
      })
    )
  })

  it('rejects a non-positive strike or premium on the offending field', () => {
    fc.assert(
      fc.property(validOpen, nonPositiveMoney(), fc.boolean(), (input, bad, onStrike) => {
        const broken = onStrike ? { ...input, strike: bad } : { ...input, premiumPerContract: bad }
        const error = validationErrorOf(() => openWheel(broken))
        expect(error.field).toBe(onStrike ? 'strike' : 'premiumPerContract')
        expect(error.code).toBe('must_be_positive')
      })
    )
  })

  it('rejects a contract count that is not a positive integer', () => {
    const badContracts = fc.oneof(
      fc.integer({ max: 0 }),
      fc.double({ min: 0.01, max: 50, noInteger: true, noNaN: true })
    )
    fc.assert(
      fc.property(validOpen, badContracts, (input, n) => {
        const error = validationErrorOf(() => openWheel({ ...input, contracts: n }))
        expect(error.field).toBe('contracts')
      })
    )
  })

  it('rejects a fill date after the reference date, and an expiration before the fill', () => {
    fc.assert(
      fc.property(
        validOpen,
        orderedDays(2),
        fc.boolean(),
        (input, [earlier, later], futureFill) => {
          fc.pre(earlier !== later)
          const broken = futureFill
            ? { ...input, fillDate: later, referenceDate: earlier, expiration: later }
            : { ...input, fillDate: later, referenceDate: later, expiration: earlier }
          const error = validationErrorOf(() => openWheel(broken))
          expect(error.field).toBe(futureFill ? 'fillDate' : 'expiration')
        }
      )
    )
  })
})

describe('closeCsp', () => {
  it('books a profit exactly when the cost-basis engine reports positive P&L', () => {
    fc.assert(
      fc.property(
        positiveMoney(),
        positiveMoney(),
        orderedDays(3),
        (open, close, [opened, closed, expiration]) => {
          const result = closeCsp({
            currentPhase: 'CSP_OPEN',
            openPremiumPerContract: open,
            closePricePerContract: close,
            openFillDate: opened,
            closeFillDate: closed,
            expiration
          })
          const { finalPnl } = calculateCspClose({
            openPremiumPerContract: open,
            closePricePerContract: close,
            contracts: 1
          })
          expect(result.phase).toBe(
            new Decimal(finalPnl).gt(0) ? 'CSP_CLOSED_PROFIT' : 'CSP_CLOSED_LOSS'
          )
        }
      )
    )
  })
})

describe('openCoveredCall', () => {
  const validCc = fc
    .tuple(positiveMoney(), positiveMoney(), contracts, contracts, orderedDays(3), isoDay)
    .map(([strike, premium, a, b, [assignmentDate, fillDate, referenceDate], expiration]) => ({
      currentPhase: 'HOLDING_SHARES' as const,
      strike,
      premiumPerContract: premium,
      contracts: Math.min(a, b),
      positionContracts: Math.max(a, b),
      assignmentDate,
      fillDate,
      referenceDate,
      expiration: expiration < fillDate ? fillDate : expiration
    }))

  it('accepts any covered call that fits within the shares held', () => {
    fc.assert(
      fc.property(validCc, (input) => {
        expect(openCoveredCall(input)).toEqual({ phase: 'CC_OPEN' })
      })
    )
  })

  it('rejects more contracts than shares held', () => {
    fc.assert(
      fc.property(validCc, fc.integer({ min: 1, max: 50 }), (input, extra) => {
        const error = validationErrorOf(() =>
          openCoveredCall({ ...input, contracts: input.positionContracts + extra })
        )
        expect(error.field).toBe('contracts')
        expect(error.code).toBe('exceeds_shares')
      })
    )
  })
})

describe('rollCc', () => {
  it('rejects a roll only when neither strike nor expiration changes', () => {
    fc.assert(
      fc.property(
        positiveMoney(),
        positiveMoney(),
        orderedDays(2),
        fc.boolean(),
        fc.boolean(),
        positiveMoney(),
        positiveMoney(),
        (
          currentStrike,
          otherStrike,
          [currentExpiration, laterExpiration],
          sameStrike,
          sameExpiration,
          cost,
          premium
        ) => {
          fc.pre(otherStrike !== currentStrike && laterExpiration !== currentExpiration)
          const input = {
            currentPhase: 'CC_OPEN' as const,
            currentStrike,
            currentExpiration,
            newStrike: sameStrike ? currentStrike : otherStrike,
            newExpiration: sameExpiration ? currentExpiration : laterExpiration,
            costToClosePerContract: cost,
            newPremiumPerContract: premium
          }
          if (sameStrike && sameExpiration) {
            expect(validationErrorOf(() => rollCc(input)).code).toBe('no_change')
          } else {
            expect(rollCc(input)).toEqual({ phase: 'CC_OPEN' })
          }
        }
      )
    )
  })
})
