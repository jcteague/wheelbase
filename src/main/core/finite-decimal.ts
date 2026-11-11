// Pure parsing helper shared by the core engines. No DB, broker, or logger imports.

import Decimal from 'decimal.js'

/**
 * The string as a finite Decimal, or `null` when it is null, does not parse, or is NaN /
 * infinite — Decimal accepts 'NaN' and 'Infinity' without throwing, so finiteness is checked too.
 */
export function toFiniteDecimal(value: string | null): Decimal | null {
  // Stryker disable next-line ConditionalExpression: equivalent — new Decimal(null) throws and the catch returns null
  if (value === null) return null
  try {
    const parsed = new Decimal(value)
    return parsed.isFinite() ? parsed : null
  } catch {
    return null
  }
}
