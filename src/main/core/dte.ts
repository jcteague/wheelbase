// Pure DTE (days-to-expiration) calculation shared across services and the
// alert engine. No DB or broker imports.

import { differenceInCalendarDays, parseISO } from 'date-fns'

/**
 * Calendar days from `now` to `expiration` (a `YYYY-MM-DD` date string).
 * Returns `null` when `expiration` is absent or not a parseable ISO date —
 * never NaN, which would bypass both a rule's missing-data guard and its
 * predicate downstream. Counts whole calendar days, so a `now` late in the
 * day yields the same count as midnight (no off-by-one).
 */
export function computeDte(expiration: string | null, now: Date = new Date()): number | null {
  if (!expiration) return null
  const days = differenceInCalendarDays(parseISO(expiration), now)
  return Number.isNaN(days) ? null : days
}
