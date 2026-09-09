// [US-98] Trading-calendar engine — pure over a calendar value the caller supplies.
//
// The sessions themselves are exchange facts we fetch and cache (see
// `services/trading-calendar-store.ts`); this module only reasons over them. Keeping
// the data out of the engine is what stops a hand-maintained holiday table from
// silently expiring, and keeps `src/main/core` free of I/O.
import { isValid, parseISO } from 'date-fns'

const EASTERN_TIME_ZONE = 'America/New_York'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^(\d{2}):(\d{2})$/

/** One session the exchange actually held. `closeAt` is the instant it closed, so an
 *  early close is just a different instant — no separate "half day" concept. */
export type TradingSession = { date: string; closeAt: string }

/**
 * The sessions we know about and the window we know them over.
 *
 * A day inside `[firstDay, lastDay]` with no session was a closure (weekend, holiday,
 * or an unscheduled one); a day outside the window is *unknown*, which is a different
 * answer and must stay distinguishable — certifying freshness against a window we
 * never read is exactly the failure this type exists to prevent.
 */
export type TradingCalendar = {
  firstDay: string
  lastDay: string
  /** Ascending by date, every entry inside the window. */
  sessions: readonly TradingSession[]
}

export type SessionLookup =
  | { status: 'open'; session: TradingSession }
  | { status: 'closed' }
  | { status: 'unavailable' }

/** Knows nothing, so every lookup is `unavailable`. The honest state before the
 *  calendar has ever been fetched. */
export const EMPTY_TRADING_CALENDAR: TradingCalendar = {
  firstDay: '',
  lastDay: '',
  sessions: []
}

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const offsetFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TIME_ZONE,
  timeZoneName: 'longOffset',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
})

/** A real calendar day written as YYYY-MM-DD — '2026-02-30' is not one. */
export function isIsoDay(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const parsed = parseISO(value)
  if (!isValid(parsed)) return false
  const [year, month, day] = value.split('-').map(Number)
  return (
    parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day
  )
}

/** The Eastern calendar day an instant falls on, as YYYY-MM-DD. */
export function etDateOf(instant: Date): string {
  if (!isValid(instant)) return ''
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(instant).map(({ type, value }) => [type, value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

function offsetMinutesAt(instant: Date): number {
  const zoneName = offsetFormatter
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value
  if (zoneName === undefined || zoneName === 'GMT') return 0

  const match = /^GMT([+-])(\d{2}):?(\d{2})?$/.exec(zoneName)
  if (match === null) return 0
  const [, sign, hours, minutes = '00'] = match
  const absoluteMinutes = Number(hours) * 60 + Number(minutes)
  return sign === '+' ? absoluteMinutes : -absoluteMinutes
}

/**
 * The instant an Eastern wall-clock time on a given day corresponds to, independent of
 * the host time zone. The exchange publishes session times as ET wall clock ('16:00'),
 * so this is what turns a published close into something comparable to `Date.now()`.
 * Returns null for input that is not a real day and HH:MM time.
 */
export function etInstantAt(day: string, time: string): string | null {
  const match = TIME_RE.exec(time)
  if (!isIsoDay(day) || match === null) return null

  const [, hours, minutes] = match
  if (Number(hours) > 23 || Number(minutes) > 59) return null

  const parsed = parseISO(day)
  const guess = new Date(
    Date.UTC(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
      Number(hours),
      Number(minutes),
      0
    )
  )
  return new Date(guess.getTime() - offsetMinutesAt(guess) * 60_000).toISOString()
}

function covers(calendar: TradingCalendar, day: string): boolean {
  return (
    calendar.firstDay !== '' && isIsoDay(day) && day >= calendar.firstDay && day <= calendar.lastDay
  )
}

/** Whether the calendar can speak about the moment `instant` falls in. */
function coversInstant(calendar: TradingCalendar, instant: Date): boolean {
  return covers(calendar, etDateOf(instant))
}

export function getTradingSession(calendar: TradingCalendar, day: string): SessionLookup {
  if (!covers(calendar, day)) return { status: 'unavailable' }

  const session = calendar.sessions.find((candidate) => candidate.date === day)
  return session === undefined ? { status: 'closed' } : { status: 'open', session }
}

/** The newest session that had already closed at `instant`, or null when the calendar
 *  cannot speak for that moment. */
export function getMostRecentCompletedSession(
  calendar: TradingCalendar,
  instant: Date
): TradingSession | null {
  if (!isValid(instant) || !coversInstant(calendar, instant)) return null

  return calendar.sessions.findLast((session) => new Date(session.closeAt) <= instant) ?? null
}

/**
 * How many sessions have closed since `session` closed — the age unit the freshness
 * tiers are expressed in. Null when the calendar cannot answer: an unknown session, a
 * `now` outside coverage, or a session that had not yet closed.
 */
export function countCompletedSessionsAfter(
  calendar: TradingCalendar,
  session: TradingSession,
  now: Date
): number | null {
  if (!isValid(now) || !coversInstant(calendar, now)) return null

  const known = getTradingSession(calendar, session.date)
  if (known.status !== 'open' || known.session.closeAt !== session.closeAt) return null
  if (new Date(session.closeAt) > now) return null

  return calendar.sessions.filter(
    (candidate) => candidate.date > session.date && new Date(candidate.closeAt) <= now
  ).length
}
