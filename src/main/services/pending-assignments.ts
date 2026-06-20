import Database from 'better-sqlite3'
import Decimal from 'decimal.js'
import { logger } from '../logger'
import { assignCspPosition } from './assign-csp-position'

export class PendingAssignmentError extends Error {
  code: 'NOT_PENDING' | 'NOT_FOUND'
  constructor(code: 'NOT_PENDING' | 'NOT_FOUND', message?: string) {
    super(message ?? code)
    this.name = 'PendingAssignmentError'
    this.code = code
  }
}

export type PendingAssignmentNotification = {
  id: number
  ticker: string
  strike: string
  expiration: string
  contractType: 'put' | 'call'
  qty: number
  transactionTime: string
  positionId: string
}

interface PendingRow {
  id: number
  position_id: string
  transaction_time: string
  qty: number
  ticker: string
  strike: string
  expiration: string
  instrument_type: string
}

const LIST_PENDING_QUERY = `
  SELECT
    pa.id,
    pa.position_id,
    pa.qty,
    pa.transaction_time,
    p.ticker,
    l.strike,
    l.expiration,
    l.instrument_type
  FROM pending_assignments pa
  JOIN positions p ON p.id = pa.position_id
  JOIN legs l ON l.id = pa.leg_id
  WHERE pa.status = 'pending'
  ORDER BY pa.detected_at ASC
`

export function listPending(db: Database.Database): PendingAssignmentNotification[] {
  const rows = db.prepare(LIST_PENDING_QUERY).all() as PendingRow[]
  return rows.map((row) => ({
    id: row.id,
    ticker: row.ticker,
    strike: new Decimal(row.strike).toFixed(2),
    expiration: row.expiration,
    contractType: row.instrument_type.toLowerCase() as 'put' | 'call',
    qty: row.qty,
    transactionTime: row.transaction_time,
    positionId: row.position_id
  }))
}

interface PendingAssignmentRow {
  id: number
  position_id: string
  transaction_time: string
  status: string
}

const FETCH_PENDING_QUERY =
  'SELECT id, position_id, transaction_time, status FROM pending_assignments WHERE id = ?'

const FETCH_STATUS_QUERY = 'SELECT status FROM pending_assignments WHERE id = ?'

const CONFIRM_PENDING_QUERY = `
  UPDATE pending_assignments SET status = 'confirmed', confirmed_at = ? WHERE id = ?
`

const DISMISS_PENDING_QUERY = `
  UPDATE pending_assignments SET status = 'dismissed', dismissed_at = ? WHERE id = ?
`

export function confirmPending(
  db: Database.Database,
  id: number
): { id: string; phase: 'HOLDING_SHARES'; assignedAt: string } {
  return db.transaction(() => {
    const row = db.prepare(FETCH_PENDING_QUERY).get(id) as PendingAssignmentRow | undefined

    if (!row) {
      throw new PendingAssignmentError('NOT_FOUND', `Pending assignment ${id} not found`)
    }
    if (row.status !== 'pending') {
      throw new PendingAssignmentError('NOT_PENDING', `Pending assignment ${id} is not pending`)
    }

    const assignmentDate = row.transaction_time.substring(0, 10)

    logger.debug({ id, positionId: row.position_id, assignmentDate }, 'confirm_pending_assignment')

    assignCspPosition(db, row.position_id, {
      positionId: row.position_id,
      assignmentDate
    })

    const now = new Date().toISOString()
    db.prepare(CONFIRM_PENDING_QUERY).run(now, id)

    return { id: row.position_id, phase: 'HOLDING_SHARES' as const, assignedAt: now }
  })()
}

export function dismissPending(db: Database.Database, id: number): void {
  const row = db.prepare(FETCH_STATUS_QUERY).get(id) as { status: string } | undefined

  if (!row) {
    throw new PendingAssignmentError('NOT_FOUND', `Pending assignment ${id} not found`)
  }
  if (row.status === 'dismissed') {
    // Idempotent: re-dismissing a dismissed row preserves the original
    // dismissed_at timestamp.
    return
  }
  if (row.status !== 'pending') {
    throw new PendingAssignmentError('NOT_PENDING', `Pending assignment ${id} is not pending`)
  }

  const now = new Date().toISOString()
  db.prepare(DISMISS_PENDING_QUERY).run(now, id)
}
