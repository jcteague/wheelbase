import { addDays, format } from 'date-fns'

/** Returns today's date as YYYY-MM-DD in the local timezone. */
export function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Returns a date offset from today as YYYY-MM-DD in the local timezone. */
export function localDate(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), 'yyyy-MM-dd')
}
