export type OptionType = 'call' | 'put'

export type BlackScholesInput = {
  type: OptionType
  spot: number
  strike: number
  yearsToExpiry: number
  rate: number
  dividendYield: number
  volatility: number
}

export type ImpliedVolatilityInput = Omit<BlackScholesInput, 'volatility'> & { price: number }

const INV_SQRT_2PI = 0.3989422804014327
const VOL_LOWER = 0.001
const VOL_UPPER = 10
const BISECTION_ITERATIONS = 100

/** Standard normal CDF — Abramowitz–Stegun 26.2.17, mirrored so N(−x) = 1 − N(x) and N(0) = 0.5. */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const density = INV_SQRT_2PI * Math.exp((-x * x) / 2)
  const tail =
    density *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return 0.5 + Math.sign(x) * (0.5 - tail)
}

export function blackScholesPrice(input: BlackScholesInput): number {
  const { type, spot, strike, yearsToExpiry, rate, dividendYield, volatility } = input
  const volSqrtT = volatility * Math.sqrt(yearsToExpiry)
  const d1 =
    (Math.log(spot / strike) +
      (rate - dividendYield + (volatility * volatility) / 2) * yearsToExpiry) /
    volSqrtT
  const d2 = d1 - volSqrtT
  const discountedSpot = spot * Math.exp(-dividendYield * yearsToExpiry)
  const discountedStrike = strike * Math.exp(-rate * yearsToExpiry)
  return type === 'call'
    ? discountedSpot * normalCdf(d1) - discountedStrike * normalCdf(d2)
    : discountedStrike * normalCdf(-d2) - discountedSpot * normalCdf(-d1)
}

function discountedIntrinsic(input: ImpliedVolatilityInput): number {
  const { type, spot, strike, yearsToExpiry, rate, dividendYield } = input
  const forwardGap =
    spot * Math.exp(-dividendYield * yearsToExpiry) - strike * Math.exp(-rate * yearsToExpiry)
  return Math.max(0, type === 'call' ? forwardGap : -forwardGap)
}

/** null when price ≤ discounted intrinsic or the bisection does not bracket. */
export function impliedVolatility(input: ImpliedVolatilityInput): number | null {
  if (input.yearsToExpiry <= 0 || input.price <= 0 || input.price <= discountedIntrinsic(input)) {
    return null
  }
  const priceAt = (volatility: number): number => blackScholesPrice({ ...input, volatility })
  if (input.price < priceAt(VOL_LOWER) || input.price > priceAt(VOL_UPPER)) return null

  const [lo, hi] = Array.from({ length: BISECTION_ITERATIONS }).reduce<[number, number]>(
    ([low, high]) => {
      const mid = (low + high) / 2
      return priceAt(mid) > input.price ? [low, mid] : [mid, high]
    },
    [VOL_LOWER, VOL_UPPER]
  )
  return (lo + hi) / 2
}
