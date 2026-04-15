import Database from 'better-sqlite3'
import path from 'node:path'
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
