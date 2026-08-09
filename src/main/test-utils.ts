import Database from 'better-sqlite3'
import path from 'node:path'
import { vi, type Mock } from 'vitest'
import { localDate } from './dates'
import { runMigrations } from './db/migrate'
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

/** LoggerLike-compatible spy for asserting log events in tests. */
export type SpyLogger = { info: Mock; debug: Mock; warn: Mock; error: Mock }

export function makeSpyLogger(): SpyLogger {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}
