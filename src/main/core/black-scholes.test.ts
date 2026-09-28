// [US-121] Calculate IV30 from option prices — Black–Scholes pricer and inversion
import { describe, expect, it } from 'vitest'
import { blackScholesPrice, impliedVolatility, normalCdf } from './black-scholes'
import type { OptionType } from './black-scholes'

const RATE = 0.045

const market = {
  spot: 200,
  strike: 200,
  yearsToExpiry: 30 / 365,
  rate: RATE,
  dividendYield: 0
}

describe('normalCdf', () => {
  it('is exactly one half at zero', () => {
    expect(normalCdf(0)).toBe(0.5)
  })

  it('matches the standard normal at ±1.96 within 1e-6', () => {
    expect(Math.abs(normalCdf(1.96) - 0.9750021)).toBeLessThan(1e-6)
    expect(Math.abs(normalCdf(-1.96) - 0.0249979)).toBeLessThan(1e-6)
  })

  it('is symmetric: N(x) + N(-x) = 1', () => {
    ;[0.3, 1, 2.5, 4].forEach((x) => {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 12)
    })
  })

  it('saturates to 0 and 1 at large magnitudes', () => {
    expect(normalCdf(40)).toBe(1)
    expect(normalCdf(-40)).toBe(0)
    expect(normalCdf(10)).toBeCloseTo(1, 12)
    expect(normalCdf(-10)).toBeCloseTo(0, 12)
  })
})

describe('blackScholesPrice', () => {
  it('satisfies put–call parity C − P = S·e^{−qT} − K·e^{−rT} within 1e-9', () => {
    const volatility = 0.25
    const call = blackScholesPrice({ ...market, type: 'call', volatility })
    const put = blackScholesPrice({ ...market, type: 'put', volatility })
    const { spot, strike, yearsToExpiry, rate, dividendYield } = market
    const parity =
      spot * Math.exp(-dividendYield * yearsToExpiry) - strike * Math.exp(-rate * yearsToExpiry)
    expect(Math.abs(call - put - parity)).toBeLessThan(1e-9)
  })

  it('applies a continuous dividend yield through put–call parity', () => {
    const input = { ...market, dividendYield: 0.02, volatility: 0.3 }
    const call = blackScholesPrice({ ...input, type: 'call' })
    const put = blackScholesPrice({ ...input, type: 'put' })
    const parity =
      input.spot * Math.exp(-0.02 * input.yearsToExpiry) -
      input.strike * Math.exp(-RATE * input.yearsToExpiry)
    expect(Math.abs(call - put - parity)).toBeLessThan(1e-9)
    expect(call).toBeLessThan(blackScholesPrice({ ...input, dividendYield: 0, type: 'call' }))
  })

  it('prices a call monotone increasing in volatility', () => {
    const prices = [0.05, 0.1, 0.2, 0.4, 0.8, 1.6].map((volatility) =>
      blackScholesPrice({ ...market, type: 'call', volatility })
    )
    prices.slice(1).forEach((price, i) => {
      expect(price).toBeGreaterThan(prices[i])
    })
  })

  it('tends to discounted intrinsic as volatility → 0', () => {
    const { yearsToExpiry } = market
    const itm = blackScholesPrice({ ...market, strike: 180, type: 'call', volatility: 1e-6 })
    expect(itm).toBeCloseTo(200 - 180 * Math.exp(-RATE * yearsToExpiry), 8)
    const otm = blackScholesPrice({ ...market, strike: 220, type: 'call', volatility: 1e-6 })
    expect(otm).toBeCloseTo(0, 8)
    const itmPut = blackScholesPrice({ ...market, strike: 220, type: 'put', volatility: 1e-6 })
    expect(itmPut).toBeCloseTo(220 * Math.exp(-RATE * yearsToExpiry) - 200, 8)
  })
})

describe('impliedVolatility', () => {
  const SIGMA = 0.2475

  const roundTripCases: ReadonlyArray<{ type: OptionType; strike: number; dte: number }> = [
    7, 45
  ].flatMap((dte) => [
    { type: 'call' as const, strike: 200, dte },
    { type: 'put' as const, strike: 200, dte },
    { type: 'call' as const, strike: 204, dte },
    { type: 'put' as const, strike: 196, dte }
  ])

  it.each(roundTripCases)(
    'round-trips σ=0.2475 for a $type at strike $strike, $dte DTE, within 1e-8',
    ({ type, strike, dte }) => {
      const input = { ...market, type, strike, yearsToExpiry: dte / 365 }
      const price = blackScholesPrice({ ...input, volatility: SIGMA })
      const iv = impliedVolatility({ ...input, price })
      expect(iv).not.toBeNull()
      expect(Math.abs((iv as number) - SIGMA)).toBeLessThan(1e-8)
    }
  )

  it.each([0.02, 4.0])('converges for σ = %s', (sigma) => {
    const input = { ...market, type: 'call' as const }
    const price = blackScholesPrice({ ...input, volatility: sigma })
    const iv = impliedVolatility({ ...input, price })
    expect(iv).not.toBeNull()
    expect(Math.abs((iv as number) - sigma)).toBeLessThan(1e-8)
  })

  it('returns null for a deep ITM call priced at discounted intrinsic', () => {
    const strike = 150
    const intrinsic = 200 - strike * Math.exp(-RATE * market.yearsToExpiry)
    expect(impliedVolatility({ ...market, type: 'call', strike, price: intrinsic })).toBeNull()
    expect(
      impliedVolatility({ ...market, type: 'call', strike, price: intrinsic - 0.01 })
    ).toBeNull()
  })

  it('returns null for a deep ITM put priced below discounted intrinsic', () => {
    const strike = 250
    const intrinsic = strike * Math.exp(-RATE * market.yearsToExpiry) - 200
    expect(impliedVolatility({ ...market, type: 'put', strike, price: intrinsic })).toBeNull()
  })

  it.each([0, -1])('returns null when price is %s', (price) => {
    expect(impliedVolatility({ ...market, type: 'call', price })).toBeNull()
    expect(impliedVolatility({ ...market, type: 'put', strike: 150, price })).toBeNull()
  })

  it.each([0, -0.01])('returns null (does not throw) when yearsToExpiry is %s', (yearsToExpiry) => {
    expect(() =>
      impliedVolatility({ ...market, type: 'call', yearsToExpiry, price: 5 })
    ).not.toThrow()
    expect(impliedVolatility({ ...market, type: 'call', yearsToExpiry, price: 5 })).toBeNull()
  })

  it('returns null when the price is above what any volatility in range produces', () => {
    expect(impliedVolatility({ ...market, type: 'call', price: 250 })).toBeNull()
  })
})
