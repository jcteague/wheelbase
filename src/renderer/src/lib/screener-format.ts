import { format, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { fmtMoney, fmtPct } from './format'

// U+2013. The same glyph the engine's formatBand renders bands with, so a criteria
// chip and a rejection reason read identically.
const EN_DASH = '–'

export function fmtYieldPercent(fraction: string): string {
  return `${new Decimal(fraction).times(100).toDecimalPlaces(2).toString()}%`
}

export function fmtScore(value: string): string {
  return new Decimal(value).toFixed(2)
}

export function fmtSpread(absolute: string, percent: string): string {
  return `${fmtMoney(absolute)} (${fmtPct(Number(percent))})`
}

export function fmtDelta(value: string): string {
  return new Decimal(value).toFixed(2)
}

export function formatIvrValue(value: string): string {
  return new Decimal(value).toString()
}

export function fmtOpenInterest(openInterest: number | null): string {
  return openInterest === null ? '—' : openInterest.toLocaleString('en-US')
}

export function fmtQuoteTime(timestamp: string): string {
  return format(parseISO(timestamp), 'HH:mm:ss')
}

/**
 * The wording of the criteria summary strip, one string per chip, in a stable order:
 * delta, DTE, OI, spread, price ceiling, IVR floor, earnings. The two optional limits
 * contribute a chip only when they are enabled. Callers own the chip markup.
 */
export function fmtCriteriaSummary(criteria: ScreeningCriteria): string[] {
  return [
    `Δ ${fmtDelta(criteria.deltaMin)}${EN_DASH}${fmtDelta(criteria.deltaMax)}`,
    `DTE ${criteria.dteMin}${EN_DASH}${criteria.dteMax}`,
    `OI ≥ ${fmtOpenInterest(criteria.minOpenInterest)}`,
    `Spread ≤ ${new Decimal(criteria.maxSpreadPercent).toString()}%`,
    ...(criteria.maxUnderlyingPrice === null
      ? []
      : [`Price ≤ $${new Decimal(criteria.maxUnderlyingPrice).toString()}`]),
    ...(criteria.minIvRank === null ? [] : [`IVR ≥ ${new Decimal(criteria.minIvRank).toString()}`]),
    `Earnings ${criteria.earningsHandling === 'exclude' ? 'Exclude' : 'Flag only'}`
  ]
}
