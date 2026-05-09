import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export const WIDE_SPREAD_THRESHOLD = 0.1

export function formatPnlPercentForDisplay(value: string): string {
  const d = new Decimal(value).toDecimalPlaces(1)
  const fixed = d.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}

export interface SpreadInput {
  bid: string
  ask: string
  mid: string
}
export function isWideSpread({ bid, ask, mid }: SpreadInput): boolean {
  const m = new Decimal(mid)
  if (m.lte(0)) return false
  const spread = new Decimal(ask).minus(bid)
  return spread.dividedBy(m).gt(WIDE_SPREAD_THRESHOLD)
}

export interface NoBidInput {
  bid: string
}
export function hasNoBid({ bid }: NoBidInput): boolean {
  return new Decimal(bid).isZero()
}

export interface TargetTooltipInput {
  pnlPercent: string
  maxProfit: string
  targetPercent: number
}
export function formatTargetTooltip({
  pnlPercent,
  maxProfit,
  targetPercent
}: TargetTooltipInput): string {
  const pct = formatPnlPercentForDisplay(pnlPercent)
  const maxProfitDec = new Decimal(maxProfit)
  const moneyStr = maxProfitDec.modulo(1).isZero()
    ? maxProfitDec.toFixed(0)
    : maxProfitDec.toFixed(2)
  return `${pct}% of max profit ($${moneyStr}) — target is ${targetPercent}%`
}
