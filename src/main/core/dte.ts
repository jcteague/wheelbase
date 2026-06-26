// Pure DTE (days-to-expiration) calculation shared across services and the
// alert engine. No DB or broker imports.

import { differenceInCalendarDays, parseISO } from 'date-fns'

/**
 * Calendar days from `now` to `expiration` (a `YYYY-MM-DD` date string).
 * Returns `null` when `expiration` is absent. Counts whole calendar days, so a
 * `now` late in the day yields the same count as midnight (no off-by-one).
 */
export function computeDte(expiration: string | null, now: Date = new Date()): number | null {
  if (!expiration) return null
  return differenceInCalendarDays(parseISO(expiration), now)
}
