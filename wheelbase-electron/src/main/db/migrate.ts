import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

const CREATE_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )
`

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(CREATE_MIGRATIONS_TABLE)

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name)
  )

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  const insert = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)')

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    db.exec(sql)
    insert.run(file, new Date().toISOString())
  }
}
