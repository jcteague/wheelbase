// [US-98] Trading-session fixtures for the IV-rank staleness specs.
//
// The freshness engine ages a reading in *completed exchange sessions*, read from the
// `trading_session` cache refreshed through `MarketDataProvider.getMarketCalendar` — a
// market fact, so no broker is involved. Offline that provider is
// `FakeMarketDataProvider`, which serves every weekday in the requested range as a normal
// 16:00 ET session unless FAKE_MARKET_CALENDAR names an explicit one. So the arithmetic
// here mirrors exactly one rule — weekdays are sessions — and everything else is derived
// from it.
//
// Ages are produced by moving the *observation* back through sessions rather than by
// moving the clock forward. Advancing the clock would also move every fixture's DTE,
// which is how a staleness spec silently turns into a DTE-window spec; holding `now`
// still keeps each test about the one thing it names.
import { addDays, format, parseISO } from 'date-fns'
import { FAKE_NOW_DAY } from './ivr-helpers'

/** `days` calendar days after BASE_DAY, as YYYY-MM-DD. */
export function daysAfterBaseDay(days: number): string {
  return format(addDays(parseISO(BASE_DAY), days), 'yyyy-MM-dd')
}

/** The Eastern day every fixture is anchored to — shared with the other IVR specs so
 *  chain expirations and session arithmetic cannot drift apart. */
export const BASE_DAY = FAKE_NOW_DAY

function isWeekend(day: Date): boolean {
  return day.getDay() === 0 || day.getDay() === 6
}

/** The `k`th weekday strictly before `from`; `k = 0` returns `from` itself. */
export function sessionsBefore(from: string, k: number): string {
  let day = parseISO(from)
  let remaining = k
  while (remaining > 0) {
    day = addDays(day, -1)
    if (!isWeekend(day)) remaining -= 1
  }
  return format(day, 'yyyy-MM-dd')
}

/** The most recent occurrence of `weekday` (0 = Sunday) on or before BASE_DAY. */
export function mostRecent(weekday: number): string {
  let day = parseISO(BASE_DAY)
  while (day.getDay() !== weekday) day = addDays(day, -1)
  return format(day, 'yyyy-MM-dd')
}

/**
 * 21:00Z on `day` — 17:00 EDT or 16:00 EST, either way at or after the 16:00 ET close,
 * so the day's own session counts as complete and the observation belongs to it.
 */
export function afterCloseOn(day: string): string {
  return `${day}T21:00:00.000Z`
}

/** 14:00Z on `day` — 10:00 ET, before the close, so the day's session is still open and
 *  the most recent *completed* one is the previous session. */
export function morningOf(day: string): string {
  return `${day}T14:00:00.000Z`
}

/** An observation whose session is exactly `k` completed sessions before BASE_DAY's —
 *  i.e. `ageTradingDays` reads `k` when the clock sits after BASE_DAY's close. */
export function observedSessionsAgo(k: number): string {
  return afterCloseOn(sessionsBefore(BASE_DAY, k))
}

/** One day of the exchange calendar, as `MarketDataProvider.getMarketCalendar` reports it. */
type CalendarDay = { date: string; close: string }

// Wide enough to cover the store's refresh range (120 back / 400 ahead) so no requested
// day falls outside the fixture and reads as an unintended closure.
const CALENDAR_LOOKBACK_DAYS = 150
const CALENDAR_LOOKAHEAD_DAYS = 400

/**
 * Every weekday around BASE_DAY as a normal 16:00 ET session, minus `holidays`.
 *
 * Only needed when a spec cares about a specific closure: with FAKE_MARKET_CALENDAR
 * unset the fake generates this same weekday calendar itself. Passing it explicitly is
 * how a holiday becomes a *recognised* closure rather than a day nobody fetched.
 */
export function weekdayCalendar(holidays: string[] = []): CalendarDay[] {
  const closed = new Set(holidays)
  const days: CalendarDay[] = []
  const end = addDays(parseISO(BASE_DAY), CALENDAR_LOOKAHEAD_DAYS)

  for (
    let day = addDays(parseISO(BASE_DAY), -CALENDAR_LOOKBACK_DAYS);
    day <= end;
    day = addDays(day, 1)
  ) {
    const date = format(day, 'yyyy-MM-dd')
    if (isWeekend(day) || closed.has(date)) continue
    days.push({ date, close: '16:00' })
  }
  return days
}

/**
 * The instant the 16:00 ET session on `day` closed — what `ivr_snapshot.observed_at`
 * now carries for a reading taken on that session.
 *
 * Computed from the zone offset rather than pinned at 20:00Z or 21:00Z, so the expected
 * stamp is right on both sides of the DST boundary the derived BASE_DAY drifts across.
 * Mirrors `etInstantAt` in `src/main/core/trading-calendar.ts`, which is what actually
 * produced the stamp.
 */
export function sessionCloseOn(day: string): string {
  const parsed = parseISO(day)
  const guess = new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 16, 0, 0)
  )

  const zoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'longOffset'
  })
    .formatToParts(guess)
    .find((part) => part.type === 'timeZoneName')!.value

  const [, sign, hours, minutes = '00'] = /^GMT([+-])(\d{2}):?(\d{2})?$/.exec(zoneName)!
  const offsetMinutes = (sign === '+' ? 1 : -1) * (Number(hours) * 60 + Number(minutes))

  return new Date(guess.getTime() - offsetMinutes * 60_000).toISOString()
}
