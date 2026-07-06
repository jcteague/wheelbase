import Database from 'better-sqlite3'
import path from 'node:path'
import { vi, type Mock } from 'vitest'
import { localDate } from './dates'
import { runMigrations } from './db/migrate'

export const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations')

export function makeTestDb(): Database.Database {
  const db = new Database(':memory:')
  runMigrations(db, MIGRATIONS_DIR)
  return db
}

export function isoDate(offsetDays: number): string {
  return localDate(offsetDays)
}

/** LoggerLike-compatible spy for asserting log events in tests. */
export type SpyLogger = { info: Mock; debug: Mock; warn: Mock; error: Mock }

export function makeSpyLogger(): SpyLogger {
  return { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}
