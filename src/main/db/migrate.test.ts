import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

/**
 * A DB migrated only through `lastFile` — the runner has no stop-at-version, so copy the
 * earlier migration files into a temp dir and run against that. Running the real dir
 * afterwards applies only what is missing, the way an upgrading install would.
 */
function makeDbThrough(lastFile: string): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-migrate-'))
  fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f <= lastFile)
    .forEach((f) => fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(dir, f)))

  const db = new Database(':memory:')
  runMigrations(db, dir)
  fs.rmSync(dir, { recursive: true, force: true })
  return db
}

function listAllIndexNames(db: Database.Database): string[] {
  return namesOf(db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all())
}

function primaryKeyColumns(db: Database.Database, tableName: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string; pk: number }[])
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name)
}

function columnDefault(db: Database.Database, tableName: string, column: string): string | null {
  const row = (
    db.prepare(`PRAGMA table_info(${tableName})`).all() as {
      name: string
      dflt_value: string | null
    }[]
  ).find((c) => c.name === column)
  return row?.dflt_value ?? null
}

type ReadingOverrides = Partial<Record<string, string | number | null>>

function insertIv30Reading(db: Database.Database, overrides: ReadingOverrides = {}): void {
  const row: Record<string, string | number | null> = {
    underlying: 'AAPL',
    session: '2026-03-12',
    engine_version: 1,
    observed_at: '2026-03-12T20:00:00.000Z',
    iv30: '0.2475',
    underlying_vwap: '200.1235',
    expiration_tier: 'weekly',
    near_expiration: '2026-04-10',
    near_strike: '200.0000',
    near_call_vwap: '5.1000',
    near_call_trades: 120,
    near_put_vwap: '4.9000',
    near_put_trades: 98,
    rate: '0.0450',
    dividend_yield: '0.0000',
    ...overrides
  }
  const cols = Object.keys(row)
  db.prepare(
    `INSERT INTO iv30_reading (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  ).run(...cols.map((c) => row[c]))
}

function insertIv30Gap(db: Database.Database, reason: string, session = '2026-03-12'): void {
  db.prepare(
    `INSERT INTO iv30_gap (underlying, session, reason, attempted_at)
     VALUES ('AAPL', ?, ?, '2026-03-13T12:00:00.000Z')`
  ).run(session, reason)
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
      '008_create_pending_assignments.sql',
      '009_create_alerts.sql',
      '010_add_management_window_dte_override.sql',
      '011_add_alerts_dismissal.sql',
      '012_create_watchlist.sql',
      '013_create_earnings_date.sql',
      '014_add_last_earnings.sql',
      '015_create_trading_session.sql',
      '016_create_iv30_history.sql',
      '017_add_leg_fees.sql'
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

  it('migration 007 created ivr_snapshot with a latest-first index (before 016 drops it)', () => {
    const db = makeDbThrough('015_create_trading_session.sql')

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
    expect(indexSql(db, 'idx_ivr_snapshot_underlying_observed_at_desc')).toContain(
      'ON ivr_snapshot (underlying, observed_at DESC)'
    )
  })

  it('applies 012_create_watchlist.sql and creates watchlist with expected columns', () => {
    const db = makeTestDb()

    expect(listUserTables(db)).toContain('watchlist')
    expect(columnInfo(db, 'watchlist').map((c) => c.name)).toEqual([
      'ticker',
      'notes',
      'own_below_price',
      'ivr_trigger',
      'post_earnings_only',
      'core_holding',
      'added_at'
    ])
  })

  it('migration 012 creates newest-first index on watchlist', () => {
    const db = makeTestDb()

    expect(listIndexes(db, 'watchlist')).toContain('idx_watchlist_added_at_desc')
    expect(indexSql(db, 'idx_watchlist_added_at_desc')).toContain('ON watchlist (added_at DESC)')
  })
})

describe('migration 016 — iv30_reading, iv30_gap, drop ivr_snapshot', () => {
  it('creates iv30_reading with the exact column list from the data model', () => {
    const db = makeTestDb()

    expect(
      columnInfo(db, 'iv30_reading').map(({ name, type, notnull }) => ({ name, type, notnull }))
    ).toEqual([
      { name: 'underlying', type: 'TEXT', notnull: 1 },
      { name: 'session', type: 'TEXT', notnull: 1 },
      { name: 'method', type: 'TEXT', notnull: 1 },
      { name: 'engine_version', type: 'INTEGER', notnull: 1 },
      { name: 'observed_at', type: 'TEXT', notnull: 1 },
      { name: 'iv30', type: 'TEXT', notnull: 1 },
      { name: 'underlying_vwap', type: 'TEXT', notnull: 1 },
      { name: 'expiration_tier', type: 'TEXT', notnull: 1 },
      { name: 'near_expiration', type: 'TEXT', notnull: 1 },
      { name: 'near_strike', type: 'TEXT', notnull: 1 },
      { name: 'near_call_vwap', type: 'TEXT', notnull: 1 },
      { name: 'near_call_trades', type: 'INTEGER', notnull: 1 },
      { name: 'near_put_vwap', type: 'TEXT', notnull: 1 },
      { name: 'near_put_trades', type: 'INTEGER', notnull: 1 },
      { name: 'far_expiration', type: 'TEXT', notnull: 0 },
      { name: 'far_strike', type: 'TEXT', notnull: 0 },
      { name: 'far_call_vwap', type: 'TEXT', notnull: 0 },
      { name: 'far_call_trades', type: 'INTEGER', notnull: 0 },
      { name: 'far_put_vwap', type: 'TEXT', notnull: 0 },
      { name: 'far_put_trades', type: 'INTEGER', notnull: 0 },
      { name: 'rate', type: 'TEXT', notnull: 1 },
      { name: 'dividend_yield', type: 'TEXT', notnull: 1 }
    ])
  })

  it('keys iv30_reading on (underlying, session, method) with method defaulting to daily_vwap', () => {
    const db = makeTestDb()

    expect(primaryKeyColumns(db, 'iv30_reading')).toEqual(['underlying', 'session', 'method'])
    expect(columnDefault(db, 'iv30_reading', 'method')).toBe("'daily_vwap'")

    insertIv30Reading(db)
    expect(db.prepare('SELECT method FROM iv30_reading').get()).toEqual({ method: 'daily_vwap' })
  })

  it('creates idx_iv30_reading_underlying_session_desc on (underlying, session DESC)', () => {
    const db = makeTestDb()

    expect(listIndexes(db, 'iv30_reading')).toContain('idx_iv30_reading_underlying_session_desc')
    expect(indexSql(db, 'idx_iv30_reading_underlying_session_desc')).toContain(
      'ON iv30_reading (underlying, session DESC)'
    )
  })

  it('rejects a duplicate (underlying, session, method) reading', () => {
    const db = makeTestDb()
    insertIv30Reading(db)

    expect(() => insertIv30Reading(db, { iv30: '0.3000' })).toThrow(/UNIQUE constraint failed/i)
  })

  it('accepts a second method for the same underlying and session', () => {
    const db = makeTestDb()
    insertIv30Reading(db)

    expect(() => insertIv30Reading(db, { method: 'minute_vwap' })).not.toThrow()
  })

  it('accepts weekly and monthly expiration tiers and rejects daily', () => {
    const db = makeTestDb()

    expect(() => insertIv30Reading(db, { expiration_tier: 'weekly' })).not.toThrow()
    expect(() =>
      insertIv30Reading(db, { session: '2026-03-13', expiration_tier: 'monthly' })
    ).not.toThrow()
    expect(() =>
      insertIv30Reading(db, { session: '2026-03-16', expiration_tier: 'daily' })
    ).toThrow(/CHECK constraint failed/i)
  })

  it('stores a two-expiration reading with all far_* inputs', () => {
    const db = makeTestDb()
    insertIv30Reading(db, {
      far_expiration: '2026-04-17',
      far_strike: '200.0000',
      far_call_vwap: '6.2000',
      far_call_trades: 40,
      far_put_vwap: '6.0000',
      far_put_trades: 33
    })

    expect(db.prepare('SELECT far_expiration, far_put_trades FROM iv30_reading').get()).toEqual({
      far_expiration: '2026-04-17',
      far_put_trades: 33
    })
  })

  it('keys iv30_gap on (underlying, session, method) with method defaulting to daily_vwap', () => {
    const db = makeTestDb()

    expect(primaryKeyColumns(db, 'iv30_gap')).toEqual(['underlying', 'session', 'method'])
    expect(columnDefault(db, 'iv30_gap', 'method')).toBe("'daily_vwap'")
    expect(columnInfo(db, 'iv30_gap').map((c) => c.name)).toEqual([
      'underlying',
      'session',
      'method',
      'reason',
      'attempted_at'
    ])

    insertIv30Gap(db, 'no_tradeable_pair')
    expect(() => insertIv30Gap(db, 'no_underlying_bar')).toThrow(/UNIQUE constraint failed/i)
  })

  it('iv30_gap reason accepts no_underlying_bar and no_tradeable_pair and rejects other', () => {
    const db = makeTestDb()

    expect(() => insertIv30Gap(db, 'no_underlying_bar', '2026-03-12')).not.toThrow()
    expect(() => insertIv30Gap(db, 'no_tradeable_pair', '2026-03-13')).not.toThrow()
    expect(() => insertIv30Gap(db, 'other', '2026-03-16')).toThrow(/CHECK constraint failed/i)
  })

  it('drops ivr_snapshot and its latest-first index', () => {
    const db = makeTestDb()

    expect(listUserTables(db)).not.toContain('ivr_snapshot')
    expect(listAllIndexNames(db)).not.toContain('idx_ivr_snapshot_underlying_observed_at_desc')
  })

  it('migrates a DB holding legacy ivr_snapshot rows without error', () => {
    const db = makeDbThrough('015_create_trading_session.sql')
    db.prepare(
      `INSERT INTO ivr_snapshot (underlying, observed_at, ivr, ivp, iv30)
       VALUES ('AAPL', '2026-03-12T20:00:00.000Z', '42.0000', '55.0000', '0.2475')`
    ).run()

    expect(() => runMigrations(db, MIGRATIONS_DIR)).not.toThrow()
    expect(listUserTables(db)).not.toContain('ivr_snapshot')
    expect(listUserTables(db)).toEqual(expect.arrayContaining(['iv30_reading', 'iv30_gap']))
    expect(listAppliedMigrations(db)).toContain('016_create_iv30_history.sql')
  })
})

describe('migration 017 — legs.fees', () => {
  it("adds legs.fees as NOT NULL TEXT defaulting to '0.0000'", () => {
    const db = makeTestDb()
    const fees = columnInfo(db, 'legs').find((c) => c.name === 'fees')

    expect(fees).toMatchObject({ type: 'TEXT', notnull: 1 })
    expect(columnDefault(db, 'legs', 'fees')).toBe("'0.0000'")
  })

  it("backfills a leg that existed before 017 with fees = '0.0000'", () => {
    const db = makeDbThrough('016_create_iv30_history.sql')
    insertPosition(db)
    insertLeg(db)

    runMigrations(db, MIGRATIONS_DIR)

    const row = db.prepare(`SELECT fees FROM legs WHERE id = 'leg-1'`).get() as { fees: string }
    expect(row.fees).toBe('0.0000')
    expect(listAppliedMigrations(db)).toContain('017_add_leg_fees.sql')
  })
})
