import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { AlertMatch } from '../core/alerts'
import type { CreatePositionPayload } from '../schemas'
import { makeTestDb, isoDate } from '../test-utils'
import {
  alertKey,
  listManagementQueue,
  listOpenAlerts,
  resolveAlertsNotIn,
  upsertOpenAlert
} from './alerts'
import { createPosition } from './positions'

const VALID_PAYLOAD: CreatePositionPayload = {
  ticker: 'AAPL',
  strike: 180,
  expiration: isoDate(37),
  contracts: 1,
  premiumPerContract: 2.5
}

function seedPositionId(db: Database.Database): string {
  return createPosition(db, VALID_PAYLOAD).position.id
}

// Raw insert that bypasses the service layer — used to assert the schema/index
// behaviour directly.
function rawInsertAlert(
  db: Database.Database,
  positionId: string,
  overrides: Partial<{
    ruleCode: string
    status: string
  }> = {}
): void {
  const now = '2026-06-25T12:00:00.000Z'
  db.prepare(
    `INSERT INTO alerts (
       id, position_id, rule_code, urgency, summary, quick_action,
       status, triggered_at, last_evaluated_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    positionId,
    overrides.ruleCode ?? 'EXPIRATION_IMMINENT',
    'high',
    'Expires in 5 days at $180.00 strike',
    'Review position',
    overrides.status ?? 'open',
    now,
    now,
    now,
    now
  )
}

describe('alerts schema', () => {
  it('has an alerts table that accepts a minimal open row', () => {
    const db = makeTestDb()
    const positionId = seedPositionId(db)
    expect(() => rawInsertAlert(db, positionId)).not.toThrow()
    const count = db.prepare('SELECT COUNT(*) AS c FROM alerts').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('rejects a second open row for the same (position_id, rule_code) via the partial unique index', () => {
    const db = makeTestDb()
    const positionId = seedPositionId(db)
    rawInsertAlert(db, positionId, { ruleCode: 'EXPIRATION_IMMINENT' })
    expect(() => rawInsertAlert(db, positionId, { ruleCode: 'EXPIRATION_IMMINENT' })).toThrow()
  })

  it('allows an open and a resolved row for the same (position_id, rule_code)', () => {
    const db = makeTestDb()
    const positionId = seedPositionId(db)
    rawInsertAlert(db, positionId, { ruleCode: 'EXPIRATION_IMMINENT', status: 'resolved' })
    expect(() =>
      rawInsertAlert(db, positionId, { ruleCode: 'EXPIRATION_IMMINENT', status: 'open' })
    ).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Service primitives (Area 3)
// ---------------------------------------------------------------------------

const EXPIRATION_MATCH: AlertMatch = {
  ruleCode: 'EXPIRATION_IMMINENT',
  urgency: 'high',
  summary: 'Expires in 5 days at $180.00 strike',
  quickAction: 'Review position'
}

interface AlertRow {
  id: string
  position_id: string
  rule_code: string
  urgency: string
  summary: string
  quick_action: string
  status: string
  triggered_at: string
  last_evaluated_at: string
  resolved_at: string | null
}

function readAlertRows(db: Database.Database): AlertRow[] {
  return db.prepare('SELECT * FROM alerts ORDER BY rowid').all() as AlertRow[]
}

const NOW = '2026-06-25T12:00:00.000Z'
const LATER = '2026-06-26T12:00:00.000Z'

describe('upsertOpenAlert', () => {
  it('inserts a new open row with equal triggered_at/last_evaluated_at and stored fields', () => {
    const db = makeTestDb()
    const positionId = seedPositionId(db)

    upsertOpenAlert(db, EXPIRATION_MATCH, positionId, NOW)

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.position_id).toBe(positionId)
    expect(row.rule_code).toBe('EXPIRATION_IMMINENT')
    expect(row.urgency).toBe('high')
    expect(row.summary).toBe('Expires in 5 days at $180.00 strike')
    expect(row.quick_action).toBe('Review position')
    expect(row.status).toBe('open')
    expect(row.triggered_at).toBe(NOW)
    expect(row.last_evaluated_at).toBe(NOW)
    expect(row.resolved_at).toBeNull()
  })

  it('updates the existing open row in place: no second row, triggered_at preserved, summary + last_evaluated_at advanced', () => {
    const db = makeTestDb()
    const positionId = seedPositionId(db)
    upsertOpenAlert(db, EXPIRATION_MATCH, positionId, NOW)

    upsertOpenAlert(
      db,
      { ...EXPIRATION_MATCH, summary: 'Expires in 4 days at $180.00 strike' },
      positionId,
      LATER
    )

    const rows = readAlertRows(db)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.triggered_at).toBe(NOW)
    expect(row.last_evaluated_at).toBe(LATER)
    expect(row.summary).toBe('Expires in 4 days at $180.00 strike')
  })
})

describe('resolveAlertsNotIn', () => {
  it('resolves open alerts absent from matchedKeys, leaves matched ones open, ignores already-resolved', () => {
    const db = makeTestDb()
    const matchedPos = seedPositionId(db)
    const stalePos = seedPositionId(db)
    upsertOpenAlert(db, EXPIRATION_MATCH, matchedPos, NOW)
    upsertOpenAlert(db, EXPIRATION_MATCH, stalePos, NOW)
    // An already-resolved row that must stay untouched.
    rawInsertAlert(db, matchedPos, { ruleCode: 'MANAGEMENT_WINDOW', status: 'resolved' })

    const matchedKeys = new Set([alertKey(matchedPos, 'EXPIRATION_IMMINENT')])
    const resolvedCount = resolveAlertsNotIn(db, matchedKeys, LATER)

    expect(resolvedCount).toBe(1)
    const rows = readAlertRows(db)
    const matched = rows.find(
      (r) => r.position_id === matchedPos && r.rule_code === 'EXPIRATION_IMMINENT'
    )!
    const stale = rows.find((r) => r.position_id === stalePos)!
    const preResolved = rows.find((r) => r.rule_code === 'MANAGEMENT_WINDOW')!

    expect(matched.status).toBe('open')
    expect(matched.resolved_at).toBeNull()
    expect(stale.status).toBe('resolved')
    expect(stale.resolved_at).toBe(LATER)
    // already-resolved row keeps its original (null resolved_at from the raw seed)
    expect(preResolved.status).toBe('resolved')
    expect(preResolved.resolved_at).toBeNull()
  })
})

describe('listManagementQueue', () => {
  function seedPositionWithTicker(db: Database.Database, ticker: string): string {
    return createPosition(db, { ...VALID_PAYLOAD, ticker }).position.id
  }

  it('returns open alerts joined with ticker and phase from positions', () => {
    const db = makeTestDb()
    const aaplId = seedPositionWithTicker(db, 'AAPL')
    const tslaId = seedPositionWithTicker(db, 'TSLA')
    upsertOpenAlert(db, EXPIRATION_MATCH, aaplId, NOW)
    upsertOpenAlert(db, EXPIRATION_MATCH, tslaId, NOW)

    const queue = listManagementQueue(db)

    expect(queue).toHaveLength(2)
    const aapl = queue.find((item) => item.positionId === aaplId)!
    expect(aapl).toEqual({
      alertId: expect.any(String),
      positionId: aaplId,
      ticker: 'AAPL',
      phase: 'CSP_OPEN',
      urgency: 'high',
      summary: 'Expires in 5 days at $180.00 strike',
      quickAction: 'Review position',
      triggeredAt: NOW
    })
    const tsla = queue.find((item) => item.positionId === tslaId)!
    expect(tsla.ticker).toBe('TSLA')
    expect(tsla.phase).toBe('CSP_OPEN')
  })

  it('orders by urgency tier high → medium → low', () => {
    const db = makeTestDb()
    const lowId = seedPositionWithTicker(db, 'LOW')
    const highId = seedPositionWithTicker(db, 'HIGH')
    const medId = seedPositionWithTicker(db, 'MED')
    upsertOpenAlert(db, { ...EXPIRATION_MATCH, urgency: 'low' }, lowId, NOW)
    upsertOpenAlert(db, { ...EXPIRATION_MATCH, urgency: 'high' }, highId, NOW)
    upsertOpenAlert(db, { ...EXPIRATION_MATCH, urgency: 'medium' }, medId, NOW)

    const queue = listManagementQueue(db)

    expect(queue.map((item) => item.urgency)).toEqual(['high', 'medium', 'low'])
  })

  it('breaks urgency ties by triggered_at ascending', () => {
    const db = makeTestDb()
    const laterId = seedPositionWithTicker(db, 'LATE')
    const earlierId = seedPositionWithTicker(db, 'EARLY')
    upsertOpenAlert(db, { ...EXPIRATION_MATCH, urgency: 'medium' }, laterId, LATER)
    upsertOpenAlert(db, { ...EXPIRATION_MATCH, urgency: 'medium' }, earlierId, NOW)

    const queue = listManagementQueue(db)

    expect(queue.map((item) => item.positionId)).toEqual([earlierId, laterId])
  })

  it('excludes non-open alerts', () => {
    const db = makeTestDb()
    const positionId = seedPositionWithTicker(db, 'AAPL')
    upsertOpenAlert(db, EXPIRATION_MATCH, positionId, NOW)
    rawInsertAlert(db, positionId, { ruleCode: 'MANAGEMENT_WINDOW', status: 'resolved' })
    rawInsertAlert(db, positionId, { ruleCode: 'STRIKE_PROXIMITY', status: 'dismissed' })

    const queue = listManagementQueue(db)

    expect(queue).toHaveLength(1)
    expect(queue[0].positionId).toBe(positionId)
  })

  it('returns an empty array when there are no open alerts', () => {
    const db = makeTestDb()
    expect(listManagementQueue(db)).toEqual([])
  })
})

describe('listOpenAlerts', () => {
  it('returns only open rows mapped to camelCase AlertRecord, excluding resolved/dismissed', () => {
    const db = makeTestDb()
    const positionId = seedPositionId(db)
    upsertOpenAlert(db, EXPIRATION_MATCH, positionId, NOW)
    rawInsertAlert(db, positionId, { ruleCode: 'MANAGEMENT_WINDOW', status: 'resolved' })
    rawInsertAlert(db, positionId, { ruleCode: 'STRIKE_PROXIMITY', status: 'dismissed' })

    const open = listOpenAlerts(db)

    expect(open).toHaveLength(1)
    expect(open[0]).toEqual({
      id: expect.any(String),
      positionId,
      ruleCode: 'EXPIRATION_IMMINENT',
      urgency: 'high',
      summary: 'Expires in 5 days at $180.00 strike',
      quickAction: 'Review position',
      status: 'open',
      triggeredAt: NOW,
      lastEvaluatedAt: NOW,
      resolvedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String)
    })
  })
})
