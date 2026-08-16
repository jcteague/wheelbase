import { format, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { ScreenerIvRank } from '../api/screener'
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

// [US-67] The reading travels with the day it was taken. IV rank is a hard filter
// now that the floor exists, and the collector writes at most one reading a day, so
// a months-old snapshot must not read as today's. Mirrors the shape the engine's
// iv_rank_floor exclusion reason uses (`src/main/core/screener.ts`).
export function fmtIvr(ivRank: ScreenerIvRank | null): string {
  if (ivRank === null) return 'n/a'
  const observedOn = format(parseISO(ivRank.observedAt), 'MMM d')
  return `${new Decimal(ivRank.value).toString()} (${observedOn})`
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
