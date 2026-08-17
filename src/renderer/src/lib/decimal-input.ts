import Decimal from 'decimal.js'

/** A complete decimal literal. `''` and `'2.'` are mid-edit, not a decided value. */
const COMPLETE_DECIMAL = /^-?\d+(\.\d+)?$/

/**
 * A form input's free text as a `Decimal`, or `null` while it is empty, mid-edit,
 * or not a number at all. `new Decimal` throws on `''` and reads `'2.'` as `2`, so
 * neither is safe to point straight at a value the trader is still typing.
 */
export function parseInputDecimal(value: string): Decimal | null {
  const trimmed = value.trim()
  return COMPLETE_DECIMAL.test(trimmed) ? new Decimal(trimmed) : null
}

/** As `parseInputDecimal`, rejecting values that cannot stand in for a price or a count. */
export function parsePositiveInputDecimal(value: string): Decimal | null {
  const parsed = parseInputDecimal(value)
  return parsed?.gt(0) ? parsed : null
}
