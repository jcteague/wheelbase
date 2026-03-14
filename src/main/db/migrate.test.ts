import { describe, expect, it } from 'vitest'
import { makeTestDb, MIGRATIONS_DIR } from '../test-utils'
import { runMigrations } from './migrate'

describe('runMigrations', () => {
  it('creates all three domain tables', () => {
    const db = makeTestDb()

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
    const db = makeTestDb()

    const applied = (
      db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[]
    ).map((r) => r.name)

    expect(applied).toEqual(['001_initial_schema.sql', '002_add_query_indexes.sql'])
  })

  it('is idempotent — running twice does not error', () => {
    const db = makeTestDb()
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
  })
})
