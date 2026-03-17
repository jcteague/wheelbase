import { describe, expect, it } from 'vitest'
import { makeTestDb, MIGRATIONS_DIR } from '../test-utils'
import { runMigrations } from './migrate'

const insertPosition = (db: ReturnType<typeof makeTestDb>): void => {
  db.prepare(
    `INSERT INTO positions (
      id, ticker, strategy_type, status, phase, opened_date, created_at, updated_at
    ) VALUES (
      'pos-1', 'AAPL', 'WHEEL', 'ACTIVE', 'CSP_OPEN', '2026-03-17', '2026-03-17T00:00:00.000Z', '2026-03-17T00:00:00.000Z'
    )`
  ).run()
}

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

  it('accepts STOCK as a valid instrument_type in legs after all migrations', () => {
    const db = makeTestDb()
    insertPosition(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO legs (
          id,
          position_id,
          leg_role,
          action,
          instrument_type,
          strike,
          expiration,
          contracts,
          premium_per_contract,
          fill_price,
          fill_date,
          created_at,
          updated_at
        ) VALUES (
          'leg-stock',
          'pos-1',
          'ASSIGN',
          'ASSIGN',
          'STOCK',
          '100.0000',
          '2026-03-20',
          100,
          '0.0000',
          NULL,
          '2026-03-17',
          '2026-03-17T00:00:00.000Z',
          '2026-03-17T00:00:00.000Z'
        )`
        )
        .run()
    ).not.toThrow()
  })

  it('rejects BOND as an invalid instrument_type in legs after all migrations', () => {
    const db = makeTestDb()
    insertPosition(db)

    expect(() =>
      db
        .prepare(
          `INSERT INTO legs (
          id,
          position_id,
          leg_role,
          action,
          instrument_type,
          strike,
          expiration,
          contracts,
          premium_per_contract,
          fill_price,
          fill_date,
          created_at,
          updated_at
        ) VALUES (
          'leg-bond',
          'pos-1',
          'OPEN',
          'SELL_TO_OPEN',
          'BOND',
          '100.0000',
          '2026-03-20',
          1,
          '1.2300',
          '1.2300',
          '2026-03-17',
          '2026-03-17T00:00:00.000Z',
          '2026-03-17T00:00:00.000Z'
        )`
        )
        .run()
    ).toThrow(/CHECK constraint failed/i)
  })

  it('removes the option_type column from legs after all migrations', () => {
    const db = makeTestDb()

    expect(() => db.prepare('SELECT option_type FROM legs').get()).toThrow(
      /no such column: option_type/i
    )
  })
})
