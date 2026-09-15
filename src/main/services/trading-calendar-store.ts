// [US-98] trading-calendar-store — the persisted exchange calendar behind IVR freshness.
//
// Sessions are exchange facts, not rules we can derive: observed-holiday conventions
// have exceptions and unscheduled closures happen, so the venue's own calendar is
// fetched and cached. `trading_session` is that cache, and this module is the only
// thing that writes it. Reads never fetch — a screen must not hang on a provider — so
// a range we have never fetched reads as *unknown* rather than as a run of closures.
//
// [US-116] The calendar is a market fact, fetched through the market-data provider.
// `ensureTradingCalendar` is the write path the bench calls on the read it serves, so a
// fresh install does not wait for the nightly collection to make IV rank legible.
import type Database from 'better-sqlite3'
import { addDays, eachDayOfInterval, format, parseISO } from 'date-fns'
import {
  EMPTY_TRADING_CALENDAR,
  etDateOf,
  etInstantAt,
  type TradingCalendar,
  type TradingSession
} from '../core/trading-calendar'
import type { MarketCalendarSource } from '../integrations/market-data-provider'
import { logger } from '../logger'

/**
 * How far back a read loads. Comfortably past `STALE_MAX_AGE` (10 trading days) so a
 * reading at the stale boundary is still assessable, and it bounds the session list
 * the engine scans — an ancient snapshot cannot make the read walk months of days.
 */
const READ_LOOKBACK_DAYS = 45

/** Enough ahead to cover a session in progress; the engine never reasons past today. */
const READ_LOOKAHEAD_DAYS = 2

/** One fetch covers a wide band so the refresh is rare and a laptop offline for weeks
 *  still has coverage. Alpaca returns one small row per day, so the range is cheap. */
const REFRESH_LOOKBACK_DAYS = 120
const REFRESH_LOOKAHEAD_DAYS = 400

/** Refetch at most this often: the published calendar changes a few times a year. */
const REFRESH_INTERVAL_DAYS = 7

/** Warn while there is still time to act rather than at the moment the calendar runs
 *  out — an exhausted calendar silently disables every IVR freshness judgement. */
const COVERAGE_WARNING_DAYS = 30

const SESSION_RANGE_QUERY = `
  SELECT date, close_at
  FROM trading_session
  WHERE date >= ? AND date <= ?
  ORDER BY date
`

const COVERAGE_QUERY = `
  SELECT MIN(date) AS first_day, MAX(date) AS last_day
  FROM trading_session
`

const UPSERT_SESSION = `
  INSERT INTO trading_session (date, close_at, source)
  VALUES (?, ?, ?)
  ON CONFLICT (date) DO UPDATE SET
    close_at = excluded.close_at,
    source   = excluded.source
`

type SessionRow = { date: string; close_at: string | null }

function dayOffset(from: Date, days: number): string {
  return format(addDays(from, days), 'yyyy-MM-dd')
}

/** Every calendar day from `start` to `end` inclusive, as YYYY-MM-DD. */
function eachDay(start: string, end: string): string[] {
  return eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map((day) =>
    format(day, 'yyyy-MM-dd')
  )
}

/**
 * The cached calendar around `now`, clipped to what we actually hold.
 *
 * The window is intersected with stored coverage rather than assumed: reporting a
 * wider window than the rows support would let the engine read an unfetched day as a
 * closure. Degrades to "knows nothing" on a read failure, which reads as unknown
 * everywhere downstream instead of as a fabricated calendar.
 */
export function readTradingCalendar(db: Database.Database, now: Date): TradingCalendar {
  const today = etDateOf(now)
  if (today === '') return EMPTY_TRADING_CALENDAR

  try {
    const stored = db.prepare(COVERAGE_QUERY).get() as {
      first_day: string | null
      last_day: string | null
    }
    if (stored.first_day === null || stored.last_day === null) {
      logger.warn(
        { today },
        'Trading calendar has never been fetched; IVR freshness is unavailable'
      )
      return EMPTY_TRADING_CALENDAR
    }

    const firstDay = maxDay(dayOffset(now, -READ_LOOKBACK_DAYS), stored.first_day)
    const lastDay = minDay(dayOffset(now, READ_LOOKAHEAD_DAYS), stored.last_day)
    if (firstDay > lastDay) {
      logger.warn(
        { today, coverage: stored },
        'Trading calendar does not cover today; IVR freshness is unavailable'
      )
      return EMPTY_TRADING_CALENDAR
    }

    warnIfCoverageRunningOut(now, stored.last_day)

    const rows = db.prepare(SESSION_RANGE_QUERY).all(firstDay, lastDay) as SessionRow[]
    const sessions = rows.flatMap((row): TradingSession[] =>
      row.close_at === null ? [] : [{ date: row.date, closeAt: row.close_at }]
    )

    logger.debug({ firstDay, lastDay, sessionCount: sessions.length }, 'trading_calendar_read')
    return { firstDay, lastDay, sessions }
  } catch (err) {
    logger.warn({ err, today }, 'trading_calendar_read_failed')
    return EMPTY_TRADING_CALENDAR
  }
}

function maxDay(a: string, b: string): string {
  return a > b ? a : b
}

function minDay(a: string, b: string): string {
  return a < b ? a : b
}

function warnIfCoverageRunningOut(now: Date, lastDay: string): void {
  if (lastDay >= dayOffset(now, COVERAGE_WARNING_DAYS)) return
  logger.warn(
    { lastDay },
    'Trading calendar coverage is nearly exhausted; refresh it before IVR freshness stops'
  )
}

/** True when the stored calendar no longer reaches far enough ahead to be worth
 *  trusting for another interval. Cheap enough to check on every bench open. */
function needsRefresh(db: Database.Database, now: Date): boolean {
  const stored = db.prepare(COVERAGE_QUERY).get() as { last_day: string | null }
  if (stored.last_day === null) return true
  return stored.last_day < dayOffset(now, REFRESH_LOOKAHEAD_DAYS - REFRESH_INTERVAL_DAYS)
}

function persistDays(
  db: Database.Database,
  rows: Array<[string, string | null]>,
  source: string
): void {
  const upsert = db.prepare(UPSERT_SESSION)
  db.transaction(() => {
    for (const [date, closeAt] of rows) upsert.run(date, closeAt, source)
  })()
}

export type RefreshTradingCalendarResult =
  | { status: 'refreshed'; dayCount: number; sessionCount: number }
  | { status: 'skipped' }
  | { status: 'failed' }

/**
 * Fetches the exchange calendar around `now` and rewrites the cache for that range.
 *
 * Every calendar day in the range is written, closures included as a NULL close, so
 * coverage stays derivable from the rows and a closure is never confused with a day we
 * did not fetch. A provider outage leaves the previous rows untouched and reports
 * `failed`: every caller treats the calendar as best-effort, so an outage must not
 * abort the work it gates.
 */
export async function refreshTradingCalendar(
  db: Database.Database,
  provider: MarketCalendarSource,
  now: Date,
  { force = false }: { force?: boolean } = {}
): Promise<RefreshTradingCalendarResult> {
  try {
    if (!force && !needsRefresh(db, now)) return { status: 'skipped' }

    const start = dayOffset(now, -REFRESH_LOOKBACK_DAYS)
    const end = dayOffset(now, REFRESH_LOOKAHEAD_DAYS)
    const published = await provider.getMarketCalendar({ start, end })

    const closes = new Map(
      published.flatMap((day): Array<[string, string]> => {
        const closeAt = etInstantAt(day.date, day.close)
        if (closeAt === null) {
          logger.warn({ day }, 'trading_calendar_unparseable_session')
          return []
        }
        return [[day.date, closeAt]]
      })
    )

    const rows = eachDay(start, end).map((day): [string, string | null] => [
      day,
      closes.get(day) ?? null
    ])

    persistDays(db, rows, 'alpaca')
    logger.info(
      { start, end, dayCount: rows.length, sessionCount: closes.size },
      'Trading calendar refreshed'
    )
    return { status: 'refreshed', dayCount: rows.length, sessionCount: closes.size }
  } catch (err) {
    logger.warn({ err }, 'trading_calendar_refresh_failed')
    return { status: 'failed' }
  }
}

// The bench issues its snapshot and screener queries concurrently, and on a fresh install
// both would otherwise race to fetch the same calendar. One in-flight promise, cleared on
// settle, collapses them into a single fetch without caching the *result* — a later open
// is free to retry a refresh that failed.
let inFlight: Promise<void> | null = null

/**
 * Refreshes the cached exchange calendar if it is due, then resolves. Never throws and
 * never rejects: an unconfigured provider, a provider error and an up-to-date cache are
 * all "nothing more to do". Concurrent callers share one in-flight fetch.
 *
 * That guarantee is load-bearing, not a courtesy: both callers await this inside a
 * `Promise.all`, so a rejection here would sink the bench — the exact failure AC 5 and
 * AC 6 exist to prevent. It holds because `refreshTradingCalendar` wraps its whole body
 * in a catch and reports `{ status: 'failed' }` instead of throwing; only the
 * `getProvider()` call, which is outside that, is guarded here. Narrowing
 * `refreshTradingCalendar`'s catch would break this, which is why the unit tests assert
 * this function *resolves* on both a construction failure and a fetch failure.
 */
export function ensureTradingCalendar(
  db: Database.Database,
  getProvider: () => MarketCalendarSource,
  now: Date
): Promise<void> {
  if (inFlight) return inFlight

  const run = async (): Promise<void> => {
    // Only resolving the provider is guarded: an unconfigured install throws here, and
    // that is a skip rather than a fault. refreshTradingCalendar swallows and logs every
    // outcome of its own, so anything escaping it is a programming error worth surfacing.
    let provider: MarketCalendarSource
    try {
      provider = getProvider()
    } catch (err) {
      logger.warn({ err }, 'trading_calendar_provider_unavailable')
      return
    }

    await refreshTradingCalendar(db, provider, now)
  }

  inFlight = run().finally(() => {
    inFlight = null
  })
  return inFlight
}
