// Property tests: no-arbitrage bounds, put–call parity and solver round-trips that any
// correct Black–Scholes implementation must satisfy.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { blackScholesPrice, impliedVolatility, normalCdf } from './black-scholes'
import type { BlackScholesInput } from './black-scholes'

const finite = (min: number, max: number): fc.Arbitrary<number> =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true })

type Range = [min: number, max: number]

const contract = (moneyness: Range, years: Range, vol: Range): fc.Arbitrary<BlackScholesInput> =>
  fc
    .record({
      type: fc.constantFrom('call', 'put'),
      spot: finite(5, 1000),
      moneyness: finite(...moneyness),
      yearsToExpiry: finite(...years),
      rate: finite(0, 0.1),
      dividendYield: finite(0, 0.06),
      volatility: finite(...vol)
    })
    .map(({ moneyness, ...rest }) => ({ ...rest, strike: rest.spot * moneyness }))

/** The whole domain the pricer accepts, deep ITM and near-expiry included. */
const marketInput = contract([0.5, 1.5], [0.01, 3], [0.05, 3])

/** Contracts with real time value, where the IV solver has a well-conditioned root. */
const liquidContract = contract([0.85, 1.15], [0.05, 2], [0.15, 2])

const discounted = (input: BlackScholesInput): { spot: number; strike: number } => ({
  spot: input.spot * Math.exp(-input.dividendYield * input.yearsToExpiry),
  strike: input.strike * Math.exp(-input.rate * input.yearsToExpiry)
})

describe('normalCdf', () => {
  it('is a symmetric, non-decreasing map into [0, 1]', () => {
    fc.assert(
      fc.property(finite(-40, 40), finite(-40, 40), (x, y) => {
        const [lo, hi] = x <= y ? [x, y] : [y, x]
        expect(normalCdf(lo)).toBeGreaterThanOrEqual(0)
        expect(normalCdf(hi)).toBeLessThanOrEqual(1)
        expect(normalCdf(lo)).toBeLessThanOrEqual(normalCdf(hi))
        expect(normalCdf(-x) + normalCdf(x)).toBeCloseTo(1, 12)
      })
    )
  })
})

describe('blackScholesPrice', () => {
  it('stays within the no-arbitrage bounds', () => {
    fc.assert(
      fc.property(marketInput, (input) => {
        const price = blackScholesPrice(input)
        const { spot, strike } = discounted(input)
        const tolerance = 1e-9 * input.spot
        const [intrinsic, ceiling] =
          input.type === 'call' ? [spot - strike, spot] : [strike - spot, strike]
        expect(price).toBeGreaterThanOrEqual(Math.max(0, intrinsic) - tolerance)
        expect(price).toBeLessThanOrEqual(ceiling + tolerance)
      })
    )
  })

  it('satisfies put–call parity', () => {
    fc.assert(
      fc.property(marketInput, (input) => {
        const call = blackScholesPrice({ ...input, type: 'call' })
        const put = blackScholesPrice({ ...input, type: 'put' })
        const { spot, strike } = discounted(input)
        expect(call - put).toBeCloseTo(spot - strike, 6)
      })
    )
  })

  it('never gets cheaper as volatility rises', () => {
    fc.assert(
      fc.property(marketInput, finite(0.05, 3), (input, otherVol) => {
        const [lowVol, highVol] =
          input.volatility <= otherVol ? [input.volatility, otherVol] : [otherVol, input.volatility]
        const cheaper = blackScholesPrice({ ...input, volatility: lowVol })
        const dearer = blackScholesPrice({ ...input, volatility: highVol })
        expect(dearer).toBeGreaterThanOrEqual(cheaper - 1e-6 * input.spot)
      })
    )
  })
})

describe('impliedVolatility', () => {
  it('recovers the volatility that produced a price with real time value', () => {
    fc.assert(
      fc.property(liquidContract, (input) => {
        const price = blackScholesPrice(input)
        const { spot, strike } = discounted(input)
        const intrinsic = Math.max(0, input.type === 'call' ? spot - strike : strike - spot)
        // Safety net only: liquidContract keeps ~96% of draws above this floor.
        fc.pre(price - intrinsic > 1e-4 * input.spot)

        const solved = impliedVolatility({ ...input, price })
        expect(solved).not.toBeNull()
        expect(blackScholesPrice({ ...input, volatility: solved! })).toBeCloseTo(price, 8)
        expect(solved!).toBeCloseTo(input.volatility, 6)
      })
    )
  })

  it('returns null for a price at or below discounted intrinsic, or above the option ceiling', () => {
    fc.assert(
      fc.property(marketInput, finite(0, 1), fc.boolean(), (input, fraction, tooHigh) => {
        const { spot, strike } = discounted(input)
        const intrinsic = Math.max(0, input.type === 'call' ? spot - strike : strike - spot)
        const ceiling = input.type === 'call' ? spot : strike
        const price = tooHigh ? ceiling * (1 + fraction) + 1 : intrinsic * fraction
        expect(impliedVolatility({ ...input, price })).toBeNull()
      })
    )
  })
})
