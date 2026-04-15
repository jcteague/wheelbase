import { addDays, format } from 'date-fns'

export function localToday(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function localDate(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), 'yyyy-MM-dd')
}
