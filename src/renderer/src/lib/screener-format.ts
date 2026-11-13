import { format, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { PmccScreenerCandidate } from '../api/pmcc-screener'
import type { PmccScreeningCriteria } from '../api/pmcc-screening-criteria'
import type { ScreenerCandidate } from '../api/screener'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { fmtDate, fmtMoney, fmtPct } from './format'

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

export function formatIvrValue(value: string | null): string {
  // A flat 52-week window has no rank; the reading itself still exists.
  return value === null ? 'n/a' : new Decimal(value).toString()
}

export function fmtOpenInterest(openInterest: number | null): string {
  return openInterest === null ? '—' : openInterest.toLocaleString('en-US')
}

export function fmtQuoteTime(timestamp: string): string {
  return format(parseISO(timestamp), 'HH:mm:ss')
}

// Chip builders both criteria strips share, so the wheel's and the PMCC lens's chips cannot
// drift apart in glyphs or number formatting.
function plain(value: string): string {
  return new Decimal(value).toString()
}

function deltaBandChip(min: string, max: string): string {
  return `Δ ${fmtDelta(min)}${EN_DASH}${fmtDelta(max)}`
}

function dteBand(min: number, max: number): string {
  return `${min}${EN_DASH}${max}`
}

function openInterestChip(min: number): string {
  return `OI ≥ ${fmtOpenInterest(min)}`
}

function spreadChip(maxPercent: string): string {
  return `Spread ≤ ${plain(maxPercent)}%`
}

/** An optional limit contributes its chip only when it is enabled (non-null). */
function optionalChip(limit: string | null, chip: (value: string) => string): string[] {
  return limit === null ? [] : [chip(plain(limit))]
}

function earningsChip(handling: ScreeningCriteria['earningsHandling']): string {
  return `Earnings ${handling === 'exclude' ? 'Exclude' : 'Flag only'}`
}

/**
 * The wording of the criteria summary strip, one string per chip, in a stable order:
 * delta, DTE, OI, spread, price ceiling, IVR floor, earnings. The two optional limits
 * contribute a chip only when they are enabled. Callers own the chip markup.
 */
export function fmtCriteriaSummary(criteria: ScreeningCriteria): string[] {
  return [
    deltaBandChip(criteria.deltaMin, criteria.deltaMax),
    `DTE ${dteBand(criteria.dteMin, criteria.dteMax)}`,
    openInterestChip(criteria.minOpenInterest),
    spreadChip(criteria.maxSpreadPercent),
    ...optionalChip(criteria.maxUnderlyingPrice, (price) => `Price ≤ $${price}`),
    ...optionalChip(criteria.minIvRank, (rank) => `IVR ≥ ${rank}`),
    earningsChip(criteria.earningsHandling)
  ]
}

/** A ratio the engine already expresses in percent (2 dp), trailing zeros trimmed. */
export function fmtRatioPercent(percent: string): string {
  return `${new Decimal(percent).toDecimalPlaces(2).toString()}%`
}

/**
 * [US-110] The PMCC criteria strip, one string per chip, in a stable order: LEAPS delta and
 * DTE, short delta and DTE, debit/width, OI, spread, IVR floor, IVR ceiling, earnings. The
 * two IV-rank limits contribute a chip only when they are enabled.
 */
export function fmtPmccCriteriaSummary(criteria: PmccScreeningCriteria): string[] {
  return [
    `LEAPS ${deltaBandChip(criteria.longDeltaMin, criteria.longDeltaMax)}`,
    `LEAPS ${dteBand(criteria.longDteMin, criteria.longDteMax)} DTE`,
    `Short ${deltaBandChip(criteria.shortDeltaMin, criteria.shortDeltaMax)}`,
    `Short ${dteBand(criteria.shortDteMin, criteria.shortDteMax)} DTE`,
    `Debit ≤ ${plain(criteria.maxDebitToWidthPercent)}% width`,
    openInterestChip(criteria.minOpenInterest),
    spreadChip(criteria.maxSpreadPercent),
    ...optionalChip(criteria.minIvRank, (rank) => `IVR ≥ ${rank}`),
    ...optionalChip(criteria.maxIvRank, (rank) => `IVR ≤ ${rank}`),
    earningsChip(criteria.earningsHandling)
  ]
}

/** The wheel's put in one line on a bench card: strike, expiry, period yield. */
export function fmtPutLine(candidate: ScreenerCandidate): string {
  return `${fmtMoney(candidate.strike)} put · ${fmtDate(candidate.expiration)} · ${fmtYieldPercent(candidate.periodYield)} yield`
}

/** [US-110] An ISO calendar day with its year — `Oct 23, 2026`. */
export function fmtLongDate(isoDay: string): string {
  return format(parseISO(isoDay), 'MMM d, yyyy')
}

/** [US-110] A diagonal in one line: both strikes, the short call's expiry, the cycle yield. */
export function fmtDiagonalLine(candidate: PmccScreenerCandidate): string {
  const { long, short } = candidate
  const shortExpiry = format(parseISO(short.expiration), 'MMM d')
  return `${fmtMoney(long.strike)} LEAPS · ${fmtMoney(short.strike)} short ${shortExpiry} · ${fmtYieldPercent(candidate.cycleYield)} on debit`
}
