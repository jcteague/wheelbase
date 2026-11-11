import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export const WIDE_SPREAD_THRESHOLD = 0.1

export interface SpreadInput {
  bid: string
  ask: string
  mid: string
}

/** The bid–ask spread as a percent of the mid, unrounded; `null` when the mid is not positive. */
export function spreadPercentOfMid({ bid, ask, mid }: SpreadInput): Decimal | null {
  const m = new Decimal(mid)
  if (m.lte(0)) return null
  return new Decimal(ask).minus(bid).dividedBy(m).times(100)
}

export function isWideSpread(spread: SpreadInput): boolean {
  const percent = spreadPercentOfMid(spread)
  return percent !== null && percent.gt(new Decimal(WIDE_SPREAD_THRESHOLD).times(100))
}

export interface NoBidInput {
  bid: string
}
export function hasNoBid({ bid }: NoBidInput): boolean {
  return new Decimal(bid).isZero()
}
