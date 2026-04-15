import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { closeCspPosition } from './close-csp-position'
import { createPosition } from './positions'

function makeOpenPosition(db: ReturnType<typeof makeTestDb>): ReturnType<typeof createPosition> {
  return createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: 2.5,
    fillDate: isoDate(0)
  })
}

describe('closeCspPosition', () => {
  it('closes at profit and returns CSP_CLOSED_PROFIT result', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.0,
      fillDate: isoDate(5)
    })

    expect(result.position.phase).toBe('CSP_CLOSED_PROFIT')
    expect(result.position.status).toBe('CLOSED')
    expect(result.position.closedDate).toBe(isoDate(5))
    expect(result.leg.legRole).toBe('CSP_CLOSE')
    expect(result.leg.action).toBe('BUY')
    expect(result.leg.fillDate).toBe(isoDate(5))
    expect(result.leg.premiumPerContract).toBe('1.0000')
    expect(result.costBasisSnapshot.finalPnl).toBe('150.0000')
  })

  it('closes at loss and returns CSP_CLOSED_LOSS result', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 3.5,
      fillDate: isoDate(5)
    })

    expect(result.position.phase).toBe('CSP_CLOSED_LOSS')
    expect(result.costBasisSnapshot.finalPnl).toBe('-100.0000')
  })

  it('persists the close leg in the DB', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.0,
      fillDate: isoDate(5)
    })

    const row = db
      .prepare(`SELECT * FROM legs WHERE position_id = ? AND leg_role = 'CSP_CLOSE'`)
      .get(position.id) as Record<string, unknown> | undefined
    expect(row).toBeDefined()
    expect(row!.action).toBe('BUY')
    expect(row!.fill_price).toBe('1.0000')
  })

  it('persists updated position phase in the DB', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.0,
      fillDate: isoDate(5)
    })

    const row = db
      .prepare(`SELECT phase, status, closed_date FROM positions WHERE id = ?`)
      .get(position.id) as Record<string, unknown>
    expect(row.phase).toBe('CSP_CLOSED_PROFIT')
    expect(row.status).toBe('CLOSED')
    expect(row.closed_date).toBe(isoDate(5))
  })

  it('persists cost basis snapshot with finalPnl in the DB', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.0,
      fillDate: isoDate(5)
    })

    const row = db
      .prepare(
        `SELECT final_pnl FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at DESC LIMIT 1`
      )
      .get(position.id) as Record<string, unknown>
    expect(row.final_pnl).toBe('150.0000')
  })

  it('throws ValidationError when closePricePerContract is 0', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    expect(() =>
      closeCspPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 0,
        fillDate: isoDate(5)
      })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError(closePricePerContract) for price 0', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    try {
      closeCspPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 0,
        fillDate: isoDate(5)
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('closePricePerContract')
    }
  })

  it('throws ValidationError(fillDate, close_date_before_open) when fillDate precedes open', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    expect(() =>
      closeCspPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 1.0,
        fillDate: isoDate(-1)
      })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError(fillDate, close_date_before_open) code', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    try {
      closeCspPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 1.0,
        fillDate: isoDate(-1)
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('fillDate')
      expect((err as ValidationError).code).toBe('close_date_before_open')
    }
  })

  it('throws ValidationError(fillDate, close_date_after_expiration) when fillDate is after expiry', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    try {
      closeCspPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 1.0,
        fillDate: isoDate(31)
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('fillDate')
      expect((err as ValidationError).code).toBe('close_date_after_expiration')
    }
  })

  it('throws ValidationError(__root__, not_found) when position does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    try {
      closeCspPosition(db, fakeId, {
        positionId: fakeId,
        closePricePerContract: 1.0,
        fillDate: isoDate(5)
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__root__')
      expect((err as ValidationError).code).toBe('not_found')
    }
  })

  it('defaults fillDate to today when omitted', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)
    const today = isoDate(0)

    const result = closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.0
    })

    expect(result.position.closedDate).toBe(today)
    expect(result.leg.fillDate).toBe(today)
  })
})
