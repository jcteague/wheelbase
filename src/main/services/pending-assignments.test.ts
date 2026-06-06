// [US-35] pending-assignments service
import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { makeTestDb } from '../test-utils'
import { createPosition } from './positions'
import {
  confirmPending,
  dismissPending,
  listPending,
  PendingAssignmentError
} from './pending-assignments'

function seedPending(
  db: Database.Database,
  positionId: string,
  legId: string,
  overrides: Partial<{
    status: string
    activityId: string
    transactionTime: string
    qty: number
  }> = {}
): number {
  const result = db
    .prepare(
      `INSERT INTO pending_assignments
        (position_id, leg_id, activity_id, broker_symbol, qty, transaction_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      positionId,
      legId,
      overrides.activityId ?? 'act-001',
      'AAPL260119P00180000',
      overrides.qty ?? 100,
      overrides.transactionTime ?? '2026-01-19T20:00:00.000Z',
      overrides.status ?? 'pending'
    )
  return Number(result.lastInsertRowid)
}

function makeAaplPosition(db: Database.Database): ReturnType<typeof createPosition> {
  return createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: '2026-01-19',
    contracts: 1,
    premiumPerContract: 3.5,
    fillDate: '2026-01-03'
  })
}

describe('listPending', () => {
  it('returns only rows with status=pending, joined with position + leg display fields', () => {
    const db = makeTestDb()
    const { position, leg } = makeAaplPosition(db)

    seedPending(db, position.id, leg.id, { qty: 2, transactionTime: '2026-01-19T20:00:00.000Z' })
    seedPending(db, position.id, leg.id, { activityId: 'act-002', status: 'confirmed' })
    seedPending(db, position.id, leg.id, { activityId: 'act-003', status: 'dismissed' })

    const results = listPending(db)

    expect(results).toHaveLength(1)
    const item = results[0]
    expect(item.ticker).toBe('AAPL')
    expect(item.strike).toMatch(/^180/)
    expect(item.expiration).toBe('2026-01-19')
    expect(item.contractType).toBe('put')
    expect(item.qty).toBe(2)
    expect(item.transactionTime).toBe('2026-01-19T20:00:00.000Z')
    expect(item.positionId).toBe(position.id)
    expect(typeof item.id).toBe('number')
  })

  it('returns an empty array when no pending rows exist', () => {
    const db = makeTestDb()
    expect(listPending(db)).toEqual([])
  })
})

describe('confirmPending', () => {
  beforeEach(() => {})

  it('sets status=confirmed and confirmed_at, and calls assignCspPosition with transaction date', () => {
    const db = makeTestDb()
    const { position, leg } = makeAaplPosition(db)
    const transactionTime = '2026-01-19T20:00:00.000Z'
    const id = seedPending(db, position.id, leg.id, { transactionTime })

    const before = Date.now()
    confirmPending(db, id)
    const after = Date.now()

    const row = db.prepare('SELECT * FROM pending_assignments WHERE id = ?').get(id) as Record<
      string,
      string | number
    >
    expect(row.status).toBe('confirmed')
    expect(row.confirmed_at).toBeTruthy()
    const confirmedMs = new Date(row.confirmed_at as string).getTime()
    expect(confirmedMs).toBeGreaterThanOrEqual(before - 100)
    expect(confirmedMs).toBeLessThanOrEqual(after + 100)

    // assignCspPosition was called — position transitioned to HOLDING_SHARES
    const pos = db.prepare('SELECT phase FROM positions WHERE id = ?').get(position.id) as Record<
      string,
      string
    >
    expect(pos.phase).toBe('HOLDING_SHARES')

    // assignmentDate derived from transaction_time date portion
    const assignLeg = db
      .prepare("SELECT fill_date FROM legs WHERE position_id = ? AND leg_role = 'ASSIGN'")
      .get(position.id) as Record<string, string> | undefined
    expect(assignLeg).toBeTruthy()
    expect(assignLeg!.fill_date).toBe('2026-01-19')
  })

  it('throws PendingAssignmentError with code NOT_PENDING when row is already confirmed', () => {
    const db = makeTestDb()
    const { position, leg } = makeAaplPosition(db)
    const id = seedPending(db, position.id, leg.id, { status: 'confirmed' })

    let thrown: unknown
    try {
      confirmPending(db, id)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(PendingAssignmentError)
    expect((thrown as PendingAssignmentError).code).toBe('NOT_PENDING')
  })

  it('propagates the error from assignCspPosition when lifecycle rejects the transition', () => {
    const db = makeTestDb()
    const { position, leg } = makeAaplPosition(db)
    // Force position into HOLDING_SHARES so assignment is rejected
    db.prepare("UPDATE positions SET phase = 'HOLDING_SHARES' WHERE id = ?").run(position.id)
    const id = seedPending(db, position.id, leg.id)

    expect(() => confirmPending(db, id)).toThrow()
  })
})

describe('dismissPending', () => {
  it('sets status=dismissed and dismissed_at', () => {
    const db = makeTestDb()
    const { position, leg } = makeAaplPosition(db)
    const id = seedPending(db, position.id, leg.id)

    const before = Date.now()
    dismissPending(db, id)
    const after = Date.now()

    const row = db.prepare('SELECT * FROM pending_assignments WHERE id = ?').get(id) as Record<
      string,
      string | number
    >
    expect(row.status).toBe('dismissed')
    expect(row.dismissed_at).toBeTruthy()
    const dismissedMs = new Date(row.dismissed_at as string).getTime()
    expect(dismissedMs).toBeGreaterThanOrEqual(before - 100)
    expect(dismissedMs).toBeLessThanOrEqual(after + 100)
  })

  it('is a no-op when the row is already dismissed', () => {
    const db = makeTestDb()
    const { position, leg } = makeAaplPosition(db)
    const id = seedPending(db, position.id, leg.id, { status: 'dismissed' })
    const originalDismissedAt = '2026-01-15T10:00:00.000Z'
    db.prepare('UPDATE pending_assignments SET dismissed_at = ? WHERE id = ?').run(
      originalDismissedAt,
      id
    )

    expect(() => dismissPending(db, id)).not.toThrow()

    const row = db.prepare('SELECT * FROM pending_assignments WHERE id = ?').get(id) as Record<
      string,
      string | number
    >
    expect(row.dismissed_at).toBe(originalDismissedAt)
  })

  it('throws PendingAssignmentError(NOT_PENDING) when the row is already confirmed', () => {
    // A confirmed row represents a completed phase transition. Allowing dismiss
    // to silently overwrite status='confirmed' with status='dismissed' would
    // produce inconsistent records — the position would be HOLDING_SHARES but
    // the audit trail would say the assignment was dismissed.
    const db = makeTestDb()
    const { position, leg } = makeAaplPosition(db)
    const id = seedPending(db, position.id, leg.id, { status: 'confirmed' })
    const originalConfirmedAt = '2026-01-19T20:30:00.000Z'
    db.prepare('UPDATE pending_assignments SET confirmed_at = ? WHERE id = ?').run(
      originalConfirmedAt,
      id
    )

    let thrown: unknown
    try {
      dismissPending(db, id)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(PendingAssignmentError)
    expect((thrown as PendingAssignmentError).code).toBe('NOT_PENDING')

    const row = db.prepare('SELECT * FROM pending_assignments WHERE id = ?').get(id) as Record<
      string,
      string | number
    >
    expect(row.status).toBe('confirmed')
    expect(row.dismissed_at).toBeNull()
    expect(row.confirmed_at).toBe(originalConfirmedAt)
  })

  it('throws PendingAssignmentError(NOT_FOUND) when the row does not exist', () => {
    const db = makeTestDb()

    let thrown: unknown
    try {
      dismissPending(db, 999_999)
    } catch (err) {
      thrown = err
    }

    expect(thrown).toBeInstanceOf(PendingAssignmentError)
    expect((thrown as PendingAssignmentError).code).toBe('NOT_FOUND')
  })
})
