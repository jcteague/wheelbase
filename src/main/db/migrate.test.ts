import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { makeTestDb, MIGRATIONS_DIR } from '../test-utils'
import { runMigrations } from './migrate'

function namesOf(rows: unknown[]): string[] {
  return (rows as { name: string }[]).map((r) => r.name)
}

function listUserTables(db: Database.Database): string[] {
  return namesOf(
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND substr(name, 1, 1) != '_' ORDER BY name`
      )
      .all()
  )
}

function listAppliedMigrations(db: Database.Database): string[] {
  return namesOf(db.prepare('SELECT name FROM _migrations ORDER BY name').all())
}

function listIndexes(db: Database.Database, tableName: string): string[] {
  return namesOf(
    db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?`).all(tableName)
  )
}

function indexSql(db: Database.Database, indexName: string): string | null {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type='index' AND name=?`)
    .get(indexName) as { sql: string | null } | undefined

  return row?.sql ?? null
}

function columnInfo(
  db: Database.Database,
  tableName: string
): { name: string; type: string; notnull: number }[] {
  return db.prepare(`PRAGMA table_info(${tableName})`).all() as {
    name: string
    type: string
    notnull: number
  }[]
}

function insertPosition(db: Database.Database): void {
  db.prepare(
    `INSERT INTO positions (
      id, ticker, strategy_type, status, phase, opened_date, created_at, updated_at
    ) VALUES (
      'pos-1', 'AAPL', 'WHEEL', 'ACTIVE', 'CSP_OPEN', '2026-03-17', '2026-03-17T00:00:00.000Z', '2026-03-17T00:00:00.000Z'
    )`
  ).run()
}

function insertLeg(db: Database.Database): void {
  db.prepare(
    `INSERT INTO legs (
      id, position_id, leg_role, action, instrument_type,
      strike, expiration, contracts, premium_per_contract,
      fill_date, created_at, updated_at
    ) VALUES (
      'leg-1', 'pos-1', 'OPEN', 'SELL_TO_OPEN', 'PUT',
      '180.0000', '2026-01-19', 1, '2.5000',
      '2026-01-10', '2026-01-10T00:00:00.000Z', '2026-01-10T00:00:00.000Z'
    )`
  ).run()
}

function insertLegWithInstrument(
  db: Database.Database,
  input: { id: string; instrumentType: string; action: string; legRole: string; contracts: number }
): () => void {
  const { id, instrumentType, action, legRole, contracts } = input
  const stmt = db.prepare(
    `INSERT INTO legs (
      id, position_id, leg_role, action, instrument_type,
      strike, expiration, contracts, premium_per_contract, fill_price,
      fill_date, created_at, updated_at
    ) VALUES (
      ?, 'pos-1', ?, ?, ?,
      '100.0000', '2026-03-20', ?, '1.2300', '1.2300',
      '2026-03-17', '2026-03-17T00:00:00.000Z', '2026-03-17T00:00:00.000Z'
    )`
  )
  return () => stmt.run(id, legRole, action, instrumentType, contracts)
}

describe('runMigrations', () => {
  it('creates all domain tables', () => {
    const db = makeTestDb()
    const tables = listUserTables(db)

    expect(tables).toContain('positions')
    expect(tables).toContain('legs')
    expect(tables).toContain('cost_basis_snapshots')
    expect(tables).toContain('pending_assignments')
    expect(tables).toContain('app_settings')
  })

  it('records applied migrations', () => {
    const db = makeTestDb()

    expect(listAppliedMigrations(db)).toEqual([
      '001_initial_schema.sql',
      '002_add_query_indexes.sql',
      '003_rename_option_type_to_instrument_type.sql',
      '004_add_trigger_event_to_snapshots.sql',
      '005_add_profit_target_percent.sql',
      '006_add_credential_settings.sql',
      '007_create_ivr_snapshot.sql',
      '008_create_pending_assignments.sql'
    ])
  })

  it('is idempotent — running twice does not error', () => {
    const db = makeTestDb()
    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
  })

  it('accepts STOCK as a valid instrument_type in legs after all migrations', () => {
    const db = makeTestDb()
    insertPosition(db)

    const insertStockLeg = insertLegWithInstrument(db, {
      id: 'leg-stock',
      instrumentType: 'STOCK',
      action: 'ASSIGN',
      legRole: 'ASSIGN',
      contracts: 100
    })

    expect(insertStockLeg).not.toThrow()
  })

  it('rejects BOND as an invalid instrument_type in legs after all migrations', () => {
    const db = makeTestDb()
    insertPosition(db)

    const insertBondLeg = insertLegWithInstrument(db, {
      id: 'leg-bond',
      instrumentType: 'BOND',
      action: 'SELL_TO_OPEN',
      legRole: 'OPEN',
      contracts: 1
    })

    expect(insertBondLeg).toThrow(/CHECK constraint failed/i)
  })

  it('cost_basis_snapshots has trigger_event column after migration 004', () => {
    const db = makeTestDb()
    const cols = namesOf(db.prepare(`PRAGMA table_info(cost_basis_snapshots)`).all())
    expect(cols).toContain('trigger_event')
  })

  it('removes the option_type column from legs after all migrations', () => {
    const db = makeTestDb()

    expect(() => db.prepare('SELECT option_type FROM legs').get()).toThrow(
      /no such column: option_type/i
    )
  })

  it('migration 005 adds profit_target_percent column to positions table', () => {
    const db = makeTestDb()
    const profitTargetCol = columnInfo(db, 'positions').find(
      (c) => c.name === 'profit_target_percent'
    )

    expect(profitTargetCol).toBeDefined()
    expect(profitTargetCol?.type).toBe('INTEGER')
    expect(profitTargetCol?.notnull).toBe(0)
  })

  it('migration 008 creates pending_assignments table with compound UNIQUE(activity_id, position_id)', () => {
    const db = makeTestDb()

    expect(listUserTables(db)).toContain('pending_assignments')

    insertPosition(db)
    insertLeg(db)

    const insert = db.prepare(`
      INSERT INTO pending_assignments
        (position_id, leg_id, activity_id, broker_symbol, qty, transaction_time, status)
      VALUES
        ('pos-1', 'leg-1', 'act-001', 'AAPL240119P00180000', 100, '2026-01-19T20:00:00.000Z', 'pending')
    `)
    insert.run()

    expect(() => insert.run()).toThrow(/UNIQUE constraint failed/i)
  })

  it('migration 008 creates index on status and on position_id', () => {
    const db = makeTestDb()
    const indexes = listIndexes(db, 'pending_assignments')

    expect(indexes).toContain('idx_pending_assignments_status')
    expect(indexes).toContain('idx_pending_assignments_position')
  })

  it('migration 006 creates app_settings table with PRIMARY KEY(key)', () => {
    const db = makeTestDb()

    expect(listUserTables(db)).toContain('app_settings')

    const now = new Date().toISOString()
    db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('foo', 'bar', ?)`).run(
      now
    )

    expect(() =>
      db
        .prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('foo', 'baz', ?)`)
        .run(now)
    ).toThrow(/UNIQUE constraint failed/i)
  })

  it('applies 007_create_ivr_snapshot.sql and creates ivr_snapshot with latest-first index', () => {
    const db = makeTestDb()

    expect(listUserTables(db)).toContain('ivr_snapshot')
    expect(
      columnInfo(db, 'ivr_snapshot').map(({ name, type, notnull }) => ({ name, type, notnull }))
    ).toEqual([
      { name: 'underlying', type: 'TEXT', notnull: 1 },
      { name: 'observed_at', type: 'TEXT', notnull: 1 },
      { name: 'ivr', type: 'TEXT', notnull: 1 },
      { name: 'ivp', type: 'TEXT', notnull: 0 },
      { name: 'iv30', type: 'TEXT', notnull: 0 },
      { name: 'source', type: 'TEXT', notnull: 1 }
    ])

    expect(listIndexes(db, 'ivr_snapshot')).toContain(
      'idx_ivr_snapshot_underlying_observed_at_desc'
    )
    expect(indexSql(db, 'idx_ivr_snapshot_underlying_observed_at_desc')).toContain(
      'ON ivr_snapshot (underlying, observed_at DESC)'
    )
  })
})
