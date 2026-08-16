// Shared bounds, messages, and predicates for screening-criteria inputs (delta
// band, DTE band, open-interest floor, max spread %, price ceiling, IV rank
// floor). Pure constants and functions — imported by the IPC schemas, the DB
// services, and the renderer form schema so every validation layer stays in
// lockstep. Change a bound here and all call sites move together.

export const DELTA_MIN = 0.01
export const DELTA_MAX = 0.99
export const DTE_MIN = 1
export const DTE_MAX = 365
export const OPEN_INTEREST_MIN = 0
export const SPREAD_PERCENT_MIN = 1
export const SPREAD_PERCENT_MAX = 50
export const IV_RANK_MIN = 0
export const IV_RANK_MAX = 100
export const SPREAD_ABSOLUTE_MIN = 0

/**
 * The only string shape these predicates accept: an optional sign, then plain
 * digits with at most one decimal point. Deliberately narrower than `Number`,
 * which coerces padded (`'0.20 '`) and exotic (`'1e2'`, `'0x10'`) forms that
 * `decimal.js` — every downstream consumer of these values — throws on. Fail
 * closed: a value the predicates pass must be one `new Decimal(...)` accepts.
 */
const DECIMAL_STRING = /^-?\d*\.?\d+$/

export const DELTA_RANGE_MESSAGE = `Delta must be between ${DELTA_MIN} and ${DELTA_MAX}`
export const DTE_MIN_MESSAGE = `DTE must be at least ${DTE_MIN}`
export const DTE_MAX_MESSAGE = `DTE must be at most ${DTE_MAX}`
export const OPEN_INTEREST_MESSAGE = 'Open interest floor cannot be negative'
export const SPREAD_PERCENT_MESSAGE = `Max spread must be between ${SPREAD_PERCENT_MIN}% and ${SPREAD_PERCENT_MAX}%`
export const PRICE_CEILING_MESSAGE = 'Price ceiling must be greater than zero'
export const IV_RANK_MESSAGE = `IV rank floor must be between ${IV_RANK_MIN} and ${IV_RANK_MAX}`
export const DELTA_INVERTED_MESSAGE = 'Minimum delta must be less than maximum delta'
export const DTE_INVERTED_MESSAGE = 'Minimum DTE must be less than maximum DTE'

/**
 * Parses a criteria field value, returning null when it is blank, malformed, or
 * not a finite number. The renderer calls the predicates below on every
 * keystroke, so half-typed input must fall through to `false` rather than throw.
 *
 * Strings must match `DECIMAL_STRING` verbatim — no trimming, no normalising.
 * A padded value that `Number` would coerce is rejected outright rather than
 * cleaned up, so nothing the trader did not type can reach the database.
 */
function parseNumeric(value: number | string): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (!DECIMAL_STRING.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** True when a delta is within the inclusive allowed range. */
export function isDeltaInRange(value: number | string): boolean {
  const parsed = parseNumeric(value)
  return parsed !== null && parsed >= DELTA_MIN && parsed <= DELTA_MAX
}

/** True when a DTE is a whole number within the inclusive allowed range. */
export function isDteInRange(value: number | string): boolean {
  const parsed = parseNumeric(value)
  return parsed !== null && Number.isInteger(parsed) && parsed >= DTE_MIN && parsed <= DTE_MAX
}

/** True when an open-interest floor is a whole number at or above zero. */
export function isOpenInterestInRange(value: number | string): boolean {
  const parsed = parseNumeric(value)
  return parsed !== null && Number.isInteger(parsed) && parsed >= OPEN_INTEREST_MIN
}

/** True when a max bid/ask spread percent is within the inclusive allowed range. */
export function isSpreadPercentInRange(value: number | string): boolean {
  const parsed = parseNumeric(value)
  return parsed !== null && parsed >= SPREAD_PERCENT_MIN && parsed <= SPREAD_PERCENT_MAX
}

/** True when a max absolute bid/ask spread is a dollar amount at or above zero.
 *  Not editable in the sheet, but a stored value reaches the engine's `Decimal`
 *  comparison unguarded, so it earns the same bound check as every other field. */
export function isSpreadAbsoluteInRange(value: number | string): boolean {
  const parsed = parseNumeric(value)
  return parsed !== null && parsed >= SPREAD_ABSOLUTE_MIN
}

/** True when an underlying price ceiling is greater than zero. */
export function isPriceCeilingInRange(value: number | string): boolean {
  const parsed = parseNumeric(value)
  return parsed !== null && parsed > 0
}

/** True when an IV rank floor is within the inclusive allowed range. */
export function isIvRankFloorInRange(value: number | string): boolean {
  const parsed = parseNumeric(value)
  return parsed !== null && parsed >= IV_RANK_MIN && parsed <= IV_RANK_MAX
}

/** True when a band's minimum is strictly less than its maximum. */
export function isAscending(min: number | string, max: number | string): boolean {
  const parsedMin = parseNumeric(min)
  const parsedMax = parseNumeric(max)
  return parsedMin !== null && parsedMax !== null && parsedMin < parsedMax
}
