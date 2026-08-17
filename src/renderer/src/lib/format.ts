import { differenceInCalendarDays, parseISO } from 'date-fns'
import Decimal from 'decimal.js'

export function fmtMoney(value: string): string {
  const amount = parseFloat(value)
  return amount < 0 ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`
}

export function formatSignedMoney(value: string): string {
  const formatted = fmtMoney(value)
  return new Decimal(value).gte(0) ? `+${formatted}` : formatted
}

export function fmtPct(value: number): string {
  return `${Math.round(value)}%`
}

export function fmtDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

export function pnlColor(value: string): string {
  return parseFloat(value) >= 0 ? 'var(--wb-green)' : 'var(--wb-red)'
}

export function pnlClass(value: string): string {
  return parseFloat(value) >= 0 ? 'text-wb-green' : 'text-wb-red'
}

export function computeDte(expiration: string): number {
  const [year, month, day] = expiration.split('-').map(Number)
  const exp = Date.UTC(year, month - 1, day)
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())

  return Math.ceil((exp - todayUtc) / (1000 * 60 * 60 * 24))
}

/** A complete `YYYY-MM-DD`. A half-typed date is mid-edit, not a decided expiration. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Days to expiration for a date the trader is still typing, or `null` while that
 * date is unusable. `computeDte` above reads free text as `NaN`, so anything driven
 * by a live form input must go through this guard rather than call it directly.
 *
 * Counted in **local** calendar days via `date-fns`, deliberately matching the
 * engine's `src/main/core/dte.ts` rather than the UTC arithmetic in `computeDte`:
 * a promoted form must not read `36 DTE` for the screener row that just said `37`,
 * which is exactly what the UTC basis produces for any trader west of UTC after
 * the UTC date has rolled over.
 */
export function computeDteFromInput(expiration: string | undefined): number | null {
  if (!expiration || !ISO_DATE.test(expiration)) return null
  const days = differenceInCalendarDays(parseISO(expiration), new Date())
  return Number.isNaN(days) ? null : days
}
