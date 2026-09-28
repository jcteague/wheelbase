import Database from 'better-sqlite3'
import path from 'node:path'
import { eachDayOfInterval, format, isWeekend, parseISO } from 'date-fns'
import { vi, type Mock } from 'vitest'
import { localDate } from './dates'
import { runMigrations } from './db/migrate'
import { etInstantAt, type TradingCalendar } from './core/trading-calendar'
import { IV30_ENGINE_VERSION } from './core/iv30'
import { RANK_WINDOW_SESSIONS } from './core/iv-metrics'
import { addWatchlistEntry } from './services/watchlist'

export const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations')

export function makeTestDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return db
}

export function isoDate(offsetDays: number): string {
  return localDate(offsetDays)
}

/** Plain watchlist entries — neither flag participates in chain pulls or screening,
 *  so tests that only need a ticker on the list can say just that. */
export function seedWatchlist(db: Database.Database, tickers: string[]): void {
  for (const ticker of tickers) {
    addWatchlistEntry(db, { ticker, postEarningsOnly: false, coreHolding: false })
  }
}

const NORMAL_CLOSE = '16:00'

export type Iv30SeedRow = [session: string, iv30: string]

/** [US-121] IV30 readings straight into `iv30_reading`, so read-path tests can set up a
 *  series without running the collector. The stored inputs are placeholders — a row
 *  seeded here is for reading, not for recompute. `observed_at` is the 16:00 ET close. */
export function seedIv30Series(db: Database.Database, ticker: string, rows: Iv30SeedRow[]): void {
  const insert = db.prepare(
    `INSERT INTO iv30_reading (
       underlying, session, method, engine_version, observed_at, iv30, underlying_vwap,
       expiration_tier, near_expiration, near_strike, near_call_vwap, near_call_trades,
       near_put_vwap, near_put_trades, rate, dividend_yield
     ) VALUES (?, ?, 'daily_vwap', ?, ?, ?, '100.0000', 'monthly', ?, '100.0000',
       '3.0000', 100, '3.0000', 100, '0.0450', '0.0000')`
  )
  for (const [session, iv30] of rows) {
    insert.run(
      ticker.toUpperCase(),
      session,
      IV30_ENGINE_VERSION,
      etInstantAt(session, NORMAL_CLOSE),
      iv30,
      session
    )
  }
}

/**
 * [US-121] A full rank window plus its anchor, ending at `anchorSession`, whose IV rank reads
 * `rank`: every window reading is 0.2000 except the oldest at 0.3000 (low 0.2000, high 0.3000),
 * and the anchor sits at `0.2 + rank / 1000`. Sessions come from `calendar`, so the read path
 * sees a complete window when it reads the same calendar.
 */
export function seedRankedIv30Series(
  db: Database.Database,
  ticker: string,
  calendar: TradingCalendar,
  anchorSession: string,
  rank: number
): void {
  const window = calendar.sessions
    .map((session) => session.date)
    .filter((session) => session < anchorSession)
    .slice(-RANK_WINDOW_SESSIONS)
  const rows = window.map(
    (session, index): Iv30SeedRow => [session, index === 0 ? '0.3000' : '0.2000']
  )
  seedIv30Series(db, ticker, [...rows, [anchorSession, (0.2 + rank / 1000).toFixed(4)]])
}

/** Every calendar day from `firstDay` to `lastDay` inclusive, as YYYY-MM-DD. */
function eachIsoDay(firstDay: string, lastDay: string): string[] {
  return eachDayOfInterval({ start: parseISO(firstDay), end: parseISO(lastDay) }).map((day) =>
    format(day, 'yyyy-MM-dd')
  )
}

/**
 * A trading calendar over `[firstDay, lastDay]` holding a session on every weekday
 * except `closures`, each closing at 16:00 ET unless `earlyCloses` says otherwise.
 *
 * Weekday-derived on purpose: tests that care about a specific holiday name it, and
 * everything else gets an ordinary calendar without restating one.
 */
export function makeTradingCalendar(
  firstDay: string,
  lastDay: string,
  {
    closures = [],
    earlyCloses = {}
  }: { closures?: string[]; earlyCloses?: Record<string, string> } = {}
): TradingCalendar {
  const closed = new Set(closures)
  const sessions = eachIsoDay(firstDay, lastDay)
    .filter((date) => !isWeekend(parseISO(date)) && !closed.has(date))
    .map((date) => ({ date, closeAt: etInstantAt(date, earlyCloses[date] ?? NORMAL_CLOSE)! }))

  return { firstDay, lastDay, sessions }
}

/** The same calendar, written into the table `readTradingCalendar` reads. Every day in
 *  the window gets a row so stored coverage matches the intended window. */
export function seedTradingCalendar(
  db: Database.Database,
  firstDay: string,
  lastDay: string,
  opts: { closures?: string[]; earlyCloses?: Record<string, string> } = {}
): void {
  const { sessions } = makeTradingCalendar(firstDay, lastDay, opts)
  const closeByDate = new Map(sessions.map((session) => [session.date, session.closeAt]))
  const insert = db.prepare(
    `INSERT INTO trading_session (date, close_at, source) VALUES (?, ?, 'test')
     ON CONFLICT (date) DO UPDATE SET close_at = excluded.close_at`
  )

  for (const date of eachIsoDay(firstDay, lastDay)) {
    insert.run(date, closeByDate.get(date) ?? null)
  }
}

/**
 * [US-116] A `getMarketCalendar` that publishes every weekday in the requested range as a
 * normal 16:00 ET session — what a service test needs once the read paths refresh the
 * calendar themselves, so a fetch leaves the same sessions a seeded DB would have held.
 */
export function weekdayCalendarFetcher(): Mock {
  return vi.fn(async (range: { start: string; end: string }) =>
    eachDayOfInterval({ start: parseISO(range.start), end: parseISO(range.end) })
      .filter((day) => !isWeekend(day))
      .map((day) => ({ date: format(day, 'yyyy-MM-dd'), close: '16:00' }))
  )
}

/** LoggerLike-compatible spy for asserting log events in tests. */
export type SpyLogger = { info: Mock; debug: Mock; warn: Mock; error: Mock }

export function makeSpyLogger(): SpyLogger {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}
