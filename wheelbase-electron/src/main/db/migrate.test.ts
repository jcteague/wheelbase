import Database from 'better-sqlite3'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { runMigrations } from './migrate'

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations')

describe('runMigrations', () => {
  it('creates all three domain tables', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const tables = (
      db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND substr(name, 1, 1) != '_' ORDER BY name`
        )
        .all() as { name: string }[]
    ).map((r) => r.name)

    expect(tables).toContain('positions')
    expect(tables).toContain('legs')
    expect(tables).toContain('cost_basis_snapshots')
  })

  it('records applied migrations', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)

    const applied = (
      db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[]
    ).map((r) => r.name)

    expect(applied).toEqual(['001_initial_schema.sql'])
  })

  it('is idempotent — running twice does not error', () => {
    const db = new Database(':memory:')
    runMigrations(db, MIGRATIONS_DIR)
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
  })
})
