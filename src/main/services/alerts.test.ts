import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { CreatePositionPayload } from '../schemas'
import { makeTestDb, isoDate } from '../test-utils'
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
