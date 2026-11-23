import { addDays, format } from 'date-fns'

export function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function localDate(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), 'yyyy-MM-dd')
}

/** Today's calendar day in America/New_York (`yyyy-MM-dd`) — the day the app's sheets count from. */
export function nyToday(): string {
  // `en-CA` formats as `yyyy-MM-dd`.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}
