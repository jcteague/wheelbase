// Shared fast-check arbitraries for property tests over the pure core engines.
//
// Money is generated the way the engines store it — a 4-dp decimal string — so a
// property can reason about exact Decimal arithmetic rather than float noise.
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { WheelPhase } from '../types'
import type { PmccContribution, PmccUnrealizedPnlInput } from '../costbasis'
import type { PmccSignalInput, PmccSignalShort } from '../pmcc-card'

const MONEY_SCALE = 10_000
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const scaled = (units: number): string => new Decimal(units).div(MONEY_SCALE).toFixed(4)

/** Strictly positive money, 0.0001 … maxDollars, as a 4-dp string. */
export const positiveMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: 1, max: maxDollars * MONEY_SCALE }).map(scaled)

/** Money that may be exactly zero. */
export const nonNegativeMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: maxDollars * MONEY_SCALE }).map(scaled)

/** Zero or negative money — what a "must be positive" guard has to reject. */
export const nonPositiveMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: -maxDollars * MONEY_SCALE, max: 0 }).map(scaled)

/** Money of either sign, −maxDollars … maxDollars, as a 4-dp string. */
export const signedMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: -maxDollars * MONEY_SCALE, max: maxDollars * MONEY_SCALE }).map(scaled)

export const contracts = fc.integer({ min: 1, max: 50 })

/** A real calendar day as YYYY-MM-DD. Day ≤ 28 so every month is valid without date math. */
export const isoDay = fc
  .record({
    year: fc.integer({ min: 2020, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  })
  .map(
    ({ year, month, day }) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  )

/** `count` ISO days sorted ascending — for "fill ≤ expiration ≤ reference" style inputs. */
export const orderedDays = (count: number): fc.Arbitrary<string[]> =>
  fc.array(isoDay, { minLength: count, maxLength: count }).map((days) => [...days].sort())

/** `count` distinct ISO days sorted ascending — each strictly before the next. */
export const strictlyOrderedDays = (count: number): fc.Arbitrary<string[]> =>
  fc.uniqueArray(isoDay, { minLength: count, maxLength: count }).map((days) => [...days].sort())

export const wheelPhase = fc.constantFrom(...WheelPhase.options)

/** 1–5 uppercase letters, the ticker shape the lifecycle engine accepts. */
export const ticker = fc
  .array(fc.constantFrom(...UPPERCASE), { minLength: 1, maxLength: 5 })
  .map((letters) => letters.join(''))

/**
 * One signed PMCC ledger contribution: a debit (+) or credit (−) per share on either side,
 * with non-negative fees — what `calculatePmccLedger` folds.
 */
export const pmccContribution: fc.Arbitrary<PmccContribution> = fc.record({
  side: fc.constantFrom('LONG' as const, 'SHORT' as const),
  cashPerShare: fc
    .tuple(positiveMoney(100), fc.boolean())
    .map(([amount, negative]) => (negative ? `-${amount}` : amount)),
  contracts,
  fees: nonNegativeMoney(10)
})

type PmccMarkedLeg = PmccUnrealizedPnlInput['legs'][number]

/** One open PMCC leg on `side` with a non-negative mid — what `computePmccUnrealizedPnl` marks. */
export const pmccMarkedLeg = (side: PmccMarkedLeg['side']): fc.Arbitrary<PmccMarkedLeg> =>
  fc.record({ side: fc.constant(side), mid: nonNegativeMoney(100), contracts })

/** One open PMCC short call, dte −5 … 60 so the expiring and management windows both draw. */
export const pmccSignalShort: fc.Arbitrary<PmccSignalShort> = fc.record({
  legId: fc.uuid(),
  strike: positiveMoney(500),
  dte: fc.integer({ min: -5, max: 60 }),
  expiration: isoDay
})

/**
 * Any PMCC card's signal input: 0–3 shorts sorted nearest first, an optional delta in [0, 1],
 * an optional LEAPS spread, a basis of either sign, and earnings around the short windows.
 */
export const pmccSignalInput: fc.Arbitrary<PmccSignalInput> = fc.record({
  leaps: fc.record({
    strike: positiveMoney(500),
    dte: fc.integer({ min: -5, max: 800 }),
    delta: fc.option(nonNegativeMoney(1)),
    spread: fc.option(
      fc.record({
        bid: nonNegativeMoney(100),
        ask: nonNegativeMoney(100),
        mid: nonNegativeMoney(100)
      })
    )
  }),
  shorts: fc
    .array(pmccSignalShort, { maxLength: 3 })
    .map((shorts) => [...shorts].sort((a, b) => a.dte - b.dte)),
  price: fc.option(positiveMoney(500)),
  basisPerShare: signedMoney(100),
  managementWindowDte: fc.integer({ min: 0, max: 45 }),
  daysToEarnings: fc.option(fc.integer({ min: -5, max: 30 }))
})
