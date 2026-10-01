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
  openPmcc,
  openWheel,
  recordAssignment,
  recordCallAway,
  rollCc,
  rollCsp
} from './lifecycle'
import type { OpenPmccInput, OpenPmccLegInput, PmccField } from './lifecycle'
import { pmccCrossLegIssues } from './pmcc-rules'
import type { WheelPhase } from './types'
import {
  contracts,
  isoDay,
  nonNegativeMoney,
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

describe('openPmcc', () => {
  const plus = (a: string, b: string): string => new Decimal(a).plus(b).toFixed(4)

  // Four distinct sorted days: long fill ≤ short fill (= reference) < short exp < long exp.
  const validPmcc: fc.Arbitrary<OpenPmccInput> = fc
    .record({
      ticker,
      days: fc.uniqueArray(isoDay, { minLength: 4, maxLength: 4 }).map((days) => [...days].sort()),
      sameFillDay: fc.boolean(),
      longStrike: positiveMoney(),
      strikeGap: positiveMoney(),
      shortFill: positiveMoney(),
      debit: positiveMoney(),
      contracts,
      longFees: nonNegativeMoney(10),
      shortFees: nonNegativeMoney(10)
    })
    .map(({ ticker, days: [first, shortFillDate, shortExpiration, longExpiration], ...r }) => {
      const leg = {
        underlying: ticker,
        instrumentType: 'CALL' as const,
        deliverableShares: 100,
        contracts: r.contracts
      }
      return {
        ticker,
        referenceDate: shortFillDate,
        long: {
          ...leg,
          strike: r.longStrike,
          expiration: longExpiration,
          fillPrice: plus(r.shortFill, r.debit),
          fillDate: r.sameFillDay ? shortFillDate : first,
          fees: r.longFees
        },
        short: {
          ...leg,
          strike: plus(r.longStrike, r.strikeGap),
          expiration: shortExpiration,
          fillPrice: r.shortFill,
          fillDate: shortFillDate,
          fees: r.shortFees
        }
      }
    })

  const withLeg = (
    input: OpenPmccInput,
    side: 'long' | 'short',
    patch: Partial<OpenPmccLegInput>
  ): OpenPmccInput => ({ ...input, [side]: { ...input[side], ...patch } })

  it('accepts every valid PMCC entry', () => {
    fc.assert(
      fc.property(validPmcc, (input) => {
        expect(openPmcc(input)).toEqual({ phase: 'PMCC_OPEN' })
      })
    )
  })

  it('rejects a short strike at or below the LEAPS strike', () => {
    fc.assert(
      fc.property(validPmcc, positiveMoney(), positiveMoney(), (input, a, b) => {
        const [low, high] = new Decimal(a).lte(b) ? [a, b] : [b, a]
        const error = validationErrorOf(() =>
          openPmcc(withLeg(withLeg(input, 'long', { strike: high }), 'short', { strike: low }))
        )
        expect(error.field).toBe('short.strike')
        expect(error.code).toBe('strike_not_above_long')
      })
    )
  })

  it('rejects a short expiration on or after the LEAPS expiration', () => {
    fc.assert(
      fc.property(validPmcc, fc.boolean(), (input, swap) => {
        const shortExp = input.short.expiration
        const longExp = input.long.expiration
        const broken = swap
          ? withLeg(withLeg(input, 'short', { expiration: longExp }), 'long', {
              expiration: shortExp
            })
          : withLeg(input, 'short', { expiration: longExp })
        const error = validationErrorOf(() => openPmcc(broken))
        expect(error.field).toBe('short.expiration')
        expect(error.code).toBe('short_not_before_long')
      })
    )
  })

  it('rejects a short fill at or above the LEAPS fill', () => {
    fc.assert(
      fc.property(validPmcc, nonNegativeMoney(), (input, excess) => {
        const error = validationErrorOf(() =>
          openPmcc(withLeg(input, 'short', { fillPrice: plus(input.long.fillPrice, excess) }))
        )
        expect(error.field).toBe('__pair__')
        expect(error.code).toBe('not_net_debit')
      })
    )
  })

  it('rejects a put on either leg on that leg path', () => {
    fc.assert(
      fc.property(validPmcc, fc.constantFrom('long' as const, 'short' as const), (input, side) => {
        const error = validationErrorOf(() =>
          openPmcc(withLeg(input, side, { instrumentType: 'PUT' }))
        )
        expect(error.field).toBe(`${side}.instrumentType`)
        expect(error.code).toBe('not_a_call')
      })
    )
  })

  // A valid entry with any of its cross-leg values (dates, strikes, fill prices) replaced —
  // each per-leg rule still holds, so only the shared cross-leg rules can reject it.
  const crossLegPerturbed: fc.Arbitrary<OpenPmccInput> = fc
    .record({
      input: validPmcc,
      long: fc.record({
        strike: fc.option(positiveMoney(), { nil: undefined }),
        expiration: fc.option(isoDay, { nil: undefined }),
        fillPrice: fc.option(positiveMoney(), { nil: undefined }),
        fillDate: fc.option(isoDay, { nil: undefined })
      }),
      short: fc.record({
        strike: fc.option(positiveMoney(), { nil: undefined }),
        expiration: fc.option(isoDay, { nil: undefined }),
        fillPrice: fc.option(positiveMoney(), { nil: undefined }),
        fillDate: fc.option(isoDay, { nil: undefined })
      })
    })
    .map(({ input, long, short }) => {
      const merge = (leg: OpenPmccLegInput, patch: typeof long): OpenPmccLegInput => ({
        ...leg,
        strike: patch.strike ?? leg.strike,
        expiration: patch.expiration ?? leg.expiration,
        fillPrice: patch.fillPrice ?? leg.fillPrice,
        fillDate: patch.fillDate ?? leg.fillDate
      })
      return { ...input, long: merge(input.long, long), short: merge(input.short, short) }
    })

  it('accepts exactly when the shared cross-leg rules report no issues, and throws the first', () => {
    fc.assert(
      fc.property(crossLegPerturbed, (input) => {
        const [first] = pmccCrossLegIssues(input)
        if (first === undefined) {
          expect(openPmcc(input)).toEqual({ phase: 'PMCC_OPEN' })
        } else {
          const error = validationErrorOf(() => openPmcc(input))
          expect({ field: error.field, code: error.code, message: error.message }).toEqual(first)
        }
      })
    )
  })

  it('reports each cross-leg rule independently of the others', () => {
    fc.assert(
      fc.property(crossLegPerturbed, (input) => {
        const codes = pmccCrossLegIssues(input).map(({ code }) => code)
        const { long, short } = input
        const expected = {
          strike_not_above_long: new Decimal(short.strike).lte(long.strike),
          not_net_debit: new Decimal(long.fillPrice).lte(short.fillPrice),
          short_not_before_long: short.expiration >= long.expiration,
          long_after_short: long.fillDate > short.fillDate
        }
        Object.entries(expected).forEach(([code, broken]) => {
          expect(codes.includes(code)).toBe(broken)
        })
      })
    )
  })

  it('only ever reports a field in PmccField', () => {
    const legKeys = [
      'underlying',
      'instrumentType',
      'deliverableShares',
      'strike',
      'expiration',
      'contracts',
      'fillPrice',
      'fillDate',
      'fees'
    ] as const satisfies ReadonlyArray<keyof OpenPmccLegInput>
    const pmccFields = new Set<string>([
      'ticker',
      '__pair__',
      ...legKeys.flatMap((key) => [`long.${key}`, `short.${key}`] satisfies PmccField[])
    ])
    const money = fc.integer({ min: -5, max: 150 }).map(String)
    const anyLeg: fc.Arbitrary<OpenPmccLegInput> = fc.record({
      underlying: fc.constantFrom('XYZ', 'ABC'),
      instrumentType: fc.constantFrom('CALL' as const, 'PUT' as const),
      deliverableShares: fc.constantFrom(100, 50),
      strike: money,
      expiration: isoDay,
      contracts: fc.constantFrom(0, 1, 2, 1.5),
      fillPrice: money,
      fillDate: isoDay,
      fees: fc.integer({ min: -2, max: 2 }).map(String)
    })
    fc.assert(
      fc.property(
        fc.record({
          ticker: fc.constantFrom('XYZ', 'xyz'),
          long: anyLeg,
          short: anyLeg,
          referenceDate: isoDay
        }),
        (input) => {
          try {
            openPmcc(input)
          } catch (error) {
            if (!(error instanceof ValidationError)) throw error
            expect(pmccFields).toContain(error.field)
          }
        }
      )
    )
  })
})
