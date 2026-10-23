import { addDays, format } from 'date-fns'

/** Returns today's date as YYYY-MM-DD in the local timezone. */
export function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Returns a date offset from today as YYYY-MM-DD in the local timezone. */
export function localDate(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), 'yyyy-MM-dd')
}

/** The market calendar day used by PMCC roll reviews and their default fill dates. */
export function newYorkToday(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}
