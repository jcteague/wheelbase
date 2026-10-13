// Property tests: the phase guards and field validators of the lifecycle engine hold for
// every input shape, not just the worked examples in lifecycle.test.ts.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { addDays, format, parseISO } from 'date-fns'
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
  rollCsp,
  rollPmccLeaps,
  rollPmccShortCall
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
  strictlyOrderedDays,
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
    },
    {
      name: 'rollPmccShortCall',
      requiredPhase: 'PMCC_OPEN',
      run: (currentPhase) =>
        rollPmccShortCall({
          currentPhase,
          openShort: { strike: '100', expiration: DAY, fillDate: DAY },
          leapsExpiration: '2027-01-15',
          fillDate: DAY,
          newStrike: '105',
          newExpiration: '2026-02-15',
          costToClosePerContract: '1',
          newPremiumPerContract: '2'
        })
    },
    {
      name: 'rollPmccLeaps',
      requiredPhase: 'PMCC_OPEN',
      run: (currentPhase) =>
        rollPmccLeaps({
          currentPhase,
          currentLeaps: { strike: '80', expiration: '2027-01-15' },
          openShort: { strike: '110', expiration: DAY },
          lastEventDate: DAY,
          fillDate: DAY,
          newStrike: '85',
          newExpiration: '2027-06-18',
          proceedsPerContract: '26',
          replacementDebitPerContract: '23.5'
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

// [US-104] The PMCC short-call roll: coverage is checked against the LEAPS regardless of the
// current short, and every legal successor (on/after current, before LEAPS, changed) is accepted.
describe('rollPmccShortCall', () => {
  it('rejects a replacement expiring on or after the LEAPS, whatever the current short', () => {
    fc.assert(
      fc.property(
        orderedDays(2),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        // open fill ≤ roll fill ≤ current expiration, so no fill-date rule fires first.
        orderedDays(3),
        (
          [leapsExpiration, newExpiration],
          strike,
          newStrike,
          cost,
          premium,
          [openFillDate, fillDate, currentExpiration]
        ) => {
          const error = validationErrorOf(() =>
            rollPmccShortCall({
              currentPhase: 'PMCC_OPEN',
              openShort: { strike, expiration: currentExpiration, fillDate: openFillDate },
              leapsExpiration,
              fillDate,
              newStrike,
              newExpiration,
              costToClosePerContract: cost,
              newPremiumPerContract: premium
            })
          )
          expect(error.field).toBe('newExpiration')
          expect(error.code).toBe('short_not_before_long')
        }
      )
    )
  })

  it('accepts a changed strike expiring on/after the current short and before the LEAPS', () => {
    fc.assert(
      fc.property(
        // The roll fills strictly before the replacement expires: earlierFill ≤ fill < earlier
        // ≤ new expiration < LEAPS.
        strictlyOrderedDays(5),
        fc.boolean(),
        fc.boolean(),
        fc.uniqueArray(positiveMoney(), { minLength: 2, maxLength: 2 }),
        positiveMoney(),
        positiveMoney(),
        (
          [earlierFill, fillDate, earlier, newExpiration, leapsExpiration],
          sameDay,
          sameFillDay,
          [strike, newStrike],
          cost,
          premium
        ) => {
          const openShort = {
            strike,
            expiration: sameDay ? newExpiration : earlier,
            fillDate: sameFillDay ? fillDate : earlierFill
          }
          expect(
            rollPmccShortCall({
              currentPhase: 'PMCC_OPEN',
              openShort,
              leapsExpiration,
              fillDate,
              newStrike,
              newExpiration,
              costToClosePerContract: cost,
              newPremiumPerContract: premium
            })
          ).toEqual({ phase: 'PMCC_OPEN', openShort, newStrike })
        }
      )
    )
  })
  // The roll fills on/before the current expiration and the replacement expires on/after it,
  // so expiring on/before the fill means all three fall on one day.
  it('rejects a replacement expiring on the roll fill date and the current expiration', () => {
    fc.assert(
      fc.property(
        // open fill ≤ current expiration = new expiration = roll fill < LEAPS
        orderedDays(2),
        fc.integer({ min: 1, max: 730 }),
        fc.uniqueArray(positiveMoney(), { minLength: 2, maxLength: 2 }),
        positiveMoney(),
        positiveMoney(),
        ([openFillDate, fillDate], leapsGap, [strike, newStrike], cost, premium) => {
          const error = validationErrorOf(() =>
            rollPmccShortCall({
              currentPhase: 'PMCC_OPEN',
              openShort: { strike, expiration: fillDate, fillDate: openFillDate },
              leapsExpiration: format(addDays(parseISO(fillDate), leapsGap), 'yyyy-MM-dd'),
              fillDate,
              newStrike,
              newExpiration: fillDate,
              costToClosePerContract: cost,
              newPremiumPerContract: premium
            })
          )
          expect(error.field).toBe('newExpiration')
          expect(error.code).toBe('expiration_not_after_fill')
        }
      )
    )
  })

  it('rejects a roll filled after the open short call expired, whatever the other terms', () => {
    fc.assert(
      fc.property(
        // open fill < current expiration < roll fill; the replacement and money are free.
        strictlyOrderedDays(3),
        isoDay,
        isoDay,
        positiveMoney(),
        positiveMoney(),
        nonNegativeMoney(),
        nonNegativeMoney(),
        (
          [openFillDate, currentExpiration, fillDate],
          newExpiration,
          leapsExpiration,
          strike,
          newStrike,
          cost,
          premium
        ) => {
          const error = validationErrorOf(() =>
            rollPmccShortCall({
              currentPhase: 'PMCC_OPEN',
              openShort: { strike, expiration: currentExpiration, fillDate: openFillDate },
              leapsExpiration,
              fillDate,
              newStrike,
              newExpiration,
              costToClosePerContract: cost,
              newPremiumPerContract: premium
            })
          )
          expect(error.field).toBe('fillDate')
          expect(error.code).toBe('close_date_after_expiration')
        }
      )
    )
  })

  it('rejects a roll filled before the open short call, whatever the other terms', () => {
    fc.assert(
      fc.property(
        strictlyOrderedDays(2),
        orderedDays(3),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        (
          [fillDate, openFillDate],
          [currentExpiration, newExpiration, leapsExpiration],
          strike,
          newStrike,
          cost,
          premium
        ) => {
          const error = validationErrorOf(() =>
            rollPmccShortCall({
              currentPhase: 'PMCC_OPEN',
              openShort: { strike, expiration: currentExpiration, fillDate: openFillDate },
              leapsExpiration,
              fillDate,
              newStrike,
              newExpiration,
              costToClosePerContract: cost,
              newPremiumPerContract: premium
            })
          )
          expect(error.field).toBe('fillDate')
          expect(error.code).toBe('close_date_before_open')
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

// [US-105] The LEAPS roll's shape rules hold for every open short call and are skipped without one.
describe('rollPmccLeaps', () => {
  // Before every `isoDay` (2020+): the LEAPS and the roll fill then, so no fill-date rule fires
  // and no generated replacement expires on or before the fill.
  const BEFORE_EVERY_DAY = '2019-12-31'
  const plus = (a: string, b: string): string => new Decimal(a).plus(b).toFixed(4)

  /** A current LEAPS and a replacement that differ in strike, expiration, or both. */
  const changedRoll = fc.oneof(
    fc.record({
      strikes: fc.uniqueArray(positiveMoney(), { minLength: 2, maxLength: 2 }),
      days: fc.tuple(isoDay, isoDay)
    }),
    fc.record({
      strikes: positiveMoney().map((strike) => [strike, strike]),
      days: fc.uniqueArray(isoDay, { minLength: 2, maxLength: 2 })
    })
  )

  it('rejects a replacement expiring on or before the open short, whatever the current LEAPS', () => {
    fc.assert(
      fc.property(
        orderedDays(2),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        isoDay,
        (
          [newExpiration, shortExpiration],
          newStrike,
          strikeGap,
          currentStrike,
          proceeds,
          debit,
          currentExpiration
        ) => {
          const error = validationErrorOf(() =>
            rollPmccLeaps({
              currentPhase: 'PMCC_OPEN',
              currentLeaps: {
                strike: currentStrike,
                expiration: currentExpiration
              },
              fillDate: BEFORE_EVERY_DAY,
              lastEventDate: BEFORE_EVERY_DAY,
              openShort: { strike: plus(newStrike, strikeGap), expiration: shortExpiration },
              newStrike,
              newExpiration,
              proceedsPerContract: proceeds,
              replacementDebitPerContract: debit
            })
          )
          expect(error.field).toBe('newExpiration')
          expect(error.code).toBe('long_not_after_short')
        }
      )
    )
  })

  it('rejects a replacement strike at or above the open short strike', () => {
    fc.assert(
      fc.property(
        strictlyOrderedDays(2),
        positiveMoney(),
        nonNegativeMoney(),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        isoDay,
        (
          [shortExpiration, newExpiration],
          shortStrike,
          strikeGap,
          currentStrike,
          proceeds,
          debit,
          currentExpiration
        ) => {
          const error = validationErrorOf(() =>
            rollPmccLeaps({
              currentPhase: 'PMCC_OPEN',
              currentLeaps: {
                strike: currentStrike,
                expiration: currentExpiration
              },
              fillDate: BEFORE_EVERY_DAY,
              lastEventDate: BEFORE_EVERY_DAY,
              openShort: { strike: shortStrike, expiration: shortExpiration },
              newStrike: plus(shortStrike, strikeGap),
              newExpiration,
              proceedsPerContract: proceeds,
              replacementDebitPerContract: debit
            })
          )
          expect(error.field).toBe('newStrike')
          expect(error.code).toBe('strike_not_below_short')
        }
      )
    )
  })

  it('applies no shape rule when no short call is open', () => {
    fc.assert(
      fc.property(
        changedRoll,
        positiveMoney(),
        positiveMoney(),
        (
          { strikes: [currentStrike, newStrike], days: [currentExpiration, newExpiration] },
          proceeds,
          debit
        ) => {
          expect(
            rollPmccLeaps({
              currentPhase: 'PMCC_OPEN',
              currentLeaps: {
                strike: currentStrike,
                expiration: currentExpiration
              },
              fillDate: BEFORE_EVERY_DAY,
              lastEventDate: BEFORE_EVERY_DAY,
              openShort: null,
              newStrike,
              newExpiration,
              proceedsPerContract: proceeds,
              replacementDebitPerContract: debit
            })
          ).toEqual({ phase: 'PMCC_OPEN' })
        }
      )
    )
  })

  it('accepts a changed replacement below the short strike and expiring after the short', () => {
    fc.assert(
      fc.property(
        // The current and replacement LEAPS both expire after the short, on distinct days in
        // either order, so the roll changes its expiration even at an unchanged strike.
        strictlyOrderedDays(3),
        fc.boolean(),
        fc.oneof(
          fc.uniqueArray(positiveMoney(), { minLength: 2, maxLength: 2 }),
          positiveMoney().map((strike) => [strike, strike])
        ),
        positiveMoney(),
        positiveMoney(),
        positiveMoney(),
        (
          [shortExpiration, earlier, later],
          extendsCoverage,
          [currentStrike, newStrike],
          strikeGap,
          proceeds,
          debit
        ) => {
          const [currentExpiration, newExpiration] = extendsCoverage
            ? [earlier, later]
            : [later, earlier]
          expect(
            rollPmccLeaps({
              currentPhase: 'PMCC_OPEN',
              currentLeaps: {
                strike: currentStrike,
                expiration: currentExpiration
              },
              fillDate: BEFORE_EVERY_DAY,
              lastEventDate: BEFORE_EVERY_DAY,
              openShort: { strike: plus(newStrike, strikeGap), expiration: shortExpiration },
              newStrike,
              newExpiration,
              proceedsPerContract: proceeds,
              replacementDebitPerContract: debit
            })
          ).toEqual({ phase: 'PMCC_OPEN' })
        }
      )
    )
  })
})
