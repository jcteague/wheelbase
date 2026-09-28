import { addDays, format } from 'date-fns'

/** The "now" boundary for services that must agree on one instant (and for tests to pin it). */
export type Clock = {
  now(): Date
}

/** Returns today's date as YYYY-MM-DD in the local timezone. */
export function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Returns a date offset from today as YYYY-MM-DD in the local timezone. */
export function localDate(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), 'yyyy-MM-dd')
}

/**
 * Builds a snapshot_at timestamp whose date portion matches the given
 * business-event date (so deriveRunningBasis can pair it with the
 * corresponding leg) while the time portion preserves wall-clock
 * ordering across snapshots created in sequence.
 */
export function makeSnapshotAt(eventDate: string): string {
  const time = format(new Date(), "'T'HH:mm:ss.SSS'Z'")
  return `${eventDate}${time}`
}
