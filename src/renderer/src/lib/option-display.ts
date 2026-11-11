import Decimal from 'decimal.js'

Decimal.set({ rounding: Decimal.ROUND_HALF_UP })

export { WIDE_SPREAD_THRESHOLD, isWideSpread, hasNoBid } from '../../../shared/option-spread'
export type { SpreadInput, NoBidInput } from '../../../shared/option-spread'

export function formatPnlPercentForDisplay(value: string): string {
  const d = new Decimal(value).toDecimalPlaces(1)
  const fixed = d.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
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
