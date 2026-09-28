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
// Ages are produced by ending the IV series earlier rather than by moving the clock
// forward. Advancing the clock would also move every fixture's DTE,
// which is how a staleness spec silently turns into a DTE-window spec; holding `now`
// still keeps each test about the one thing it names.
import { addMinutes, addDays, format, parseISO } from 'date-fns'

/** `days` calendar days after BASE_DAY, as YYYY-MM-DD. */
export function daysAfterBaseDay(days: number): string {
  return format(addDays(parseISO(BASE_DAY), days), 'yyyy-MM-dd')
}

function isWeekend(day: Date): boolean {
  return day.getDay() === 0 || day.getDay() === 6
}

function mostRecentWeekday(): string {
  let day = new Date()
  while (isWeekend(day)) day = addDays(day, -1)
  return format(day, 'yyyy-MM-dd')
}

/**
 * The Eastern calendar day every fixture is anchored to: the most recent weekday on or
 * before today. `ivr-helpers.ts` re-exports it as FAKE_NOW_DAY, so chain expirations and
 * session arithmetic cannot drift apart.
 *
 * Derived rather than pinned. The screener runs on this fake clock while position
 * creation validates expirations against the real one, so a fixed base guarantees a
 * date on which every promoted-expiration fixture turns into a past date and the
 * promote specs start failing — a deadline baked into the suite. Anchoring to the real
 * date keeps the two clocks in step for good.
 */
export const BASE_DAY = mostRecentWeekday()

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

/** [US-121] How many weekday sessions `day` sits before BASE_DAY — the inverse of
 *  `sessionsBefore(BASE_DAY, k)` for a weekday `day` on or before BASE_DAY. */
export function sessionsAgo(day: string): number {
  let k = 0
  while (sessionsBefore(BASE_DAY, k) > day) k += 1
  return k
}

/** [US-121] The `count` weekday sessions ending on `last` (inclusive), ascending — the
 *  session keys of a fake IV series. */
export function sessionsBetween(last: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => sessionsBefore(last, count - 1 - i))
}

/** The most recent occurrence of `weekday` (0 = Sunday) on or before BASE_DAY. */
export function mostRecent(weekday: number): string {
  let day = parseISO(BASE_DAY)
  while (day.getDay() !== weekday) day = addDays(day, -1)
  return format(day, 'yyyy-MM-dd')
}

/**
 * An hour after `day`'s 16:00 ET close, on either side of DST — when the scheduled
 * `ivr-collect` run fires, and past the collector's bar-settle margin, so the day's own
 * session counts as complete and its bars as final.
 */
export function afterCloseOn(day: string): string {
  return addMinutes(parseISO(sessionCloseOn(day)), 60).toISOString()
}

/** 14:00Z on `day` — 10:00 ET, before the close, so the day's session is still open and
 *  the most recent *completed* one is the previous session. */
export function morningOf(day: string): string {
  return `${day}T14:00:00.000Z`
}

/** One day of the exchange calendar, as `MarketDataProvider.getMarketCalendar` reports it. */
type CalendarDay = { date: string; close: string }

// Wide enough to cover the store's refresh range (420 back / 400 ahead) so no requested
// day falls outside the fixture and reads as an unintended closure. [US-121] The IV
// window needs 253 sessions of history, which is why the lookback is over a year.
const CALENDAR_LOOKBACK_DAYS = 450
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
 * The instant the 16:00 ET session on `day` closed — what `iv30_reading.observed_at`
 * carries for a reading taken on that session.
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
