import Database from 'better-sqlite3'

export const appSettings = {
  get(db: Database.Database, key: string): string | undefined {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value
  },

  set(db: Database.Database, key: string, value: string): void {
    const now = new Date().toISOString()
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      key,
      value,
      now
    )
  }
}
