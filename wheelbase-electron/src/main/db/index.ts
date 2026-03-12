import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { runMigrations } from './migrate'

export function initDb(): Database.Database {
  const dbName = app.isPackaged ? 'wheelbase.db' : 'wheelbase-dev.db'
  const dbPath = path.join(app.getPath('userData'), dbName)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const migrationsDir = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'migrations')
    : path.join(process.cwd(), 'migrations')

  runMigrations(db, migrationsDir)
  return db
}
