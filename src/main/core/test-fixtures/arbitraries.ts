// Shared fast-check arbitraries for property tests over the pure core engines.
//
// Money is generated the way the engines store it — a 4-dp decimal string — so a
// property can reason about exact Decimal arithmetic rather than float noise.
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { WheelPhase } from '../types'

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

export const wheelPhase = fc.constantFrom(...WheelPhase.options)

/** 1–5 uppercase letters, the ticker shape the lifecycle engine accepts. */
export const ticker = fc
  .array(fc.constantFrom(...UPPERCASE), { minLength: 1, maxLength: 5 })
  .map((letters) => letters.join(''))
