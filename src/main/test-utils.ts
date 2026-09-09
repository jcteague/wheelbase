import Database from 'better-sqlite3'
import path from 'node:path'
import { eachDayOfInterval, format, parseISO } from 'date-fns'
import { vi, type Mock } from 'vitest'
import { localDate } from './dates'
import { runMigrations } from './db/migrate'
import { etInstantAt, type TradingCalendar } from './core/trading-calendar'
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

export type IvrSeedRow = [underlying: string, observedAt: string, ivr: string]

/** IVR readings straight into the table the collector writes, so read-path tests can
 *  set up history (several observations for one ticker) without going through it. */
export function seedIvr(db: Database.Database, rows: IvrSeedRow[]): void {
  const insert = db.prepare(
    'INSERT INTO ivr_snapshot (underlying, observed_at, ivr) VALUES (?, ?, ?)'
  )
  for (const [underlying, observedAt, ivr] of rows) insert.run(underlying, observedAt, ivr)
}

const NORMAL_CLOSE = '16:00'

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
  const sessions = eachDayOfInterval({ start: parseISO(firstDay), end: parseISO(lastDay) })
    .map((day) => format(day, 'yyyy-MM-dd'))
    .filter((date) => {
      const weekday = parseISO(date).getDay()
      return weekday !== 0 && weekday !== 6 && !closed.has(date)
    })
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

  for (const day of eachDayOfInterval({ start: parseISO(firstDay), end: parseISO(lastDay) })) {
    const date = format(day, 'yyyy-MM-dd')
    insert.run(date, closeByDate.get(date) ?? null)
  }
}

/** LoggerLike-compatible spy for asserting log events in tests. */
export type SpyLogger = { info: Mock; debug: Mock; warn: Mock; error: Mock }

export function makeSpyLogger(): SpyLogger {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}
