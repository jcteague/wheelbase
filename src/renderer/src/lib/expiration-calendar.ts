import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import type { PositionListItem, WheelPhase } from '../api/positions'

export const CHIP_LIMIT = 3
export const BUSY_WEEK_THRESHOLD = 3
export const AGENDA_HORIZON_DAYS = 30

export interface CalendarEntry {
  id: string
  ticker: string
  phase: WheelPhase
  strike: string | null
  dte: number | null
  expiration: string
}

export interface DayCell {
  date: Date
  dayOfMonth: number
  inMonth: boolean
  isToday: boolean
  entries: CalendarEntry[]
}

export interface AgendaDay {
  date: Date
  entries: CalendarEntry[]
}

export interface AgendaWeek {
  weekStart: Date
  label: string
  rangeLabel: string
  days: AgendaDay[]
  total: number
  isBusy: boolean
}

export function toCalendarEntries(positions: PositionListItem[]): CalendarEntry[] {
  return positions
    .filter((position) => position.status === 'ACTIVE' && position.expiration != null)
    .map((position) => ({
      id: position.id,
      ticker: position.ticker,
      phase: position.phase,
      strike: position.strike,
      dte: position.dte,
      expiration: position.expiration as string
    }))
}

export function groupByExpiration(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  return entries.reduce((byDate, entry) => {
    const existing = byDate.get(entry.expiration) ?? []
    byDate.set(entry.expiration, [...existing, entry])
    return byDate
  }, new Map<string, CalendarEntry[]>())
}

export function buildMonthGrid(
  viewMonth: Date,
  byDate: Map<string, CalendarEntry[]>,
  today: Date
): DayCell[][] {
  const gridStart = startOfWeek(startOfMonth(viewMonth))
  const gridEnd = endOfWeek(endOfMonth(viewMonth))
  const monthNumber = viewMonth.getMonth()

  const cells: DayCell[] = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => ({
    date,
    dayOfMonth: date.getDate(),
    inMonth: date.getMonth() === monthNumber,
    isToday: isSameDay(date, today),
    entries: byDate.get(format(date, 'yyyy-MM-dd')) ?? []
  }))

  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7))
}

export function buildAgendaWeeks(
  entries: CalendarEntry[],
  today: Date,
  horizonDays: number = AGENDA_HORIZON_DAYS
): AgendaWeek[] {
  // `today` may carry a real time-of-day (e.g. a frozen `new Date()`), while
  // ISO expiration strings always parse to local midnight — normalize to the
  // start of the day so a same-day expiration isn't excluded by `>=`.
  const startOfToday = startOfDay(today)
  const horizonEnd = addDays(startOfToday, horizonDays)

  const inWindow = entries.filter((entry) => {
    const expiration = parseISO(entry.expiration)
    return expiration >= startOfToday && expiration <= horizonEnd
  })

  const byDay = groupByExpiration(inWindow)
  const dayKeys = Array.from(byDay.keys()).sort()
  const weekKeyOf = (isoDate: string): string =>
    format(startOfWeek(parseISO(isoDate)), 'yyyy-MM-dd')
  const weekKeys = Array.from(new Set(dayKeys.map(weekKeyOf))).sort()

  return weekKeys.map((weekKey) => {
    const weekStart = parseISO(weekKey)
    const weekEnd = endOfWeek(weekStart)
    const days: AgendaDay[] = dayKeys
      .filter((isoDate) => weekKeyOf(isoDate) === weekKey)
      .map((isoDate) => ({ date: parseISO(isoDate), entries: byDay.get(isoDate) ?? [] }))
    const total = days.reduce((sum, day) => sum + day.entries.length, 0)
    const weekEndFormat = isSameMonth(weekStart, weekEnd) ? 'd' : 'MMM d'

    return {
      weekStart,
      label: `Week of ${format(weekStart, 'MMM d')}`,
      rangeLabel: `${format(weekStart, 'MMM d')} – ${format(weekEnd, weekEndFormat)}`,
      days,
      total,
      isBusy: total >= BUSY_WEEK_THRESHOLD
    }
  })
}

export function visibleChips(
  entries: CalendarEntry[],
  limit: number = CHIP_LIMIT
): { visible: CalendarEntry[]; hiddenCount: number } {
  return {
    visible: entries.slice(0, limit),
    hiddenCount: Math.max(0, entries.length - limit)
  }
}
