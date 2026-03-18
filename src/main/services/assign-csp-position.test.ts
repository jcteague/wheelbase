import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { getPosition } from './get-position'
import { createPosition } from './positions'

function makeOpenPosition(db: ReturnType<typeof makeTestDb>): ReturnType<typeof createPosition> {
  return createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: 3.5,
    fillDate: '2026-01-03'
  })
}

describe('assignCspPosition', () => {
  it('successfully assigns a CSP_OPEN position and returns the assignment result', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = assignCspPosition(db, position.id, {
      positionId: position.id,
      assignmentDate: '2026-01-17'
    })

    expect(result.position.phase).toBe('HOLDING_SHARES')
    expect(result.position.status).toBe('ACTIVE')
    expect(result.position.closedDate).toBeNull()
    expect(result.leg.legRole).toBe('ASSIGN')
    expect(result.leg.action).toBe('ASSIGN')
    expect(result.leg.instrumentType).toBe('STOCK')
    expect(result.leg.premiumPerContract).toBe('0.0000')
    expect(result.leg.fillPrice).toBeNull()
    expect(result.leg.fillDate).toBe('2026-01-17')
    expect(result.costBasisSnapshot.finalPnl).toBeNull()
  })

  it('returns a premiumWaterfall entry for each CSP premium and roll credit leg', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 175,
      expiration: '2026-01-31',
      contracts: 1,
      premiumPerContract: 2,
      fillDate: '2026-01-03'
    })

    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO legs
        (id, position_id, leg_role, action, instrument_type, strike, expiration, contracts, premium_per_contract, fill_price, fill_date, created_at, updated_at)
       VALUES (?, ?, 'ROLL_TO', 'SELL', 'PUT', '175.0000', '2026-02-14', 1, '1.5000', '1.5000', '2026-01-10', ?, ?)`
    ).run(randomUUID(), created.position.id, now, now)

    const result = assignCspPosition(db, created.position.id, {
      positionId: created.position.id,
      assignmentDate: '2026-01-17'
    })

    expect(result.premiumWaterfall).toEqual([
      { label: 'CSP premium', amount: '2.0000' },
      { label: 'Roll credit', amount: '1.5000' }
    ])
  })

  it('throws ValidationError(not_found) when the position does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    expect(() =>
      assignCspPosition(db, fakeId, {
        positionId: fakeId,
        assignmentDate: '2026-01-17'
      })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError(invalid_phase) when the position is already HOLDING_SHARES', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    db.prepare(`UPDATE positions SET phase = 'HOLDING_SHARES' WHERE id = ?`).run(position.id)

    try {
      assignCspPosition(db, position.id, {
        positionId: position.id,
        assignmentDate: '2026-01-17'
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('invalid_phase')
    }
  })

  it('throws ValidationError(date_before_open) when assignmentDate is before the CSP open fill date', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    try {
      assignCspPosition(db, position.id, {
        positionId: position.id,
        assignmentDate: '2026-01-02'
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('date_before_open')
    }
  })

  it('does not surface the ASSIGN leg as activeLeg after assignment', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    assignCspPosition(db, position.id, {
      positionId: position.id,
      assignmentDate: '2026-01-17'
    })

    const detail = getPosition(db, position.id)

    expect(detail).not.toBeNull()
    expect(detail!.position.phase).toBe('HOLDING_SHARES')
    expect(detail!.activeLeg).toBeNull()
  })
})
