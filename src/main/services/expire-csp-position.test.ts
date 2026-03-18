import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { expireCspPosition } from './expire-csp-position'
import { createPosition, closeCspPosition } from './positions'

const EXPIRATION_OFFSET = 30

function makeOpenPosition(db: ReturnType<typeof makeTestDb>): ReturnType<typeof createPosition> {
  return createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(EXPIRATION_OFFSET),
    contracts: 1,
    premiumPerContract: 2.5,
    fillDate: isoDate(0)
  })
}

describe('expireCspPosition', () => {
  it('expires at expiration date and returns WHEEL_COMPLETE result', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)
    const expirationDate = isoDate(EXPIRATION_OFFSET)

    const result = expireCspPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: expirationDate
    })

    expect(result.position.phase).toBe('WHEEL_COMPLETE')
    expect(result.position.status).toBe('CLOSED')
    expect(result.position.closedDate).toBe(expirationDate)
  })

  it('records expire leg with correct role, action, null fill_price, and zero premium', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)
    const expirationDate = isoDate(EXPIRATION_OFFSET)

    const result = expireCspPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: expirationDate
    })

    expect(result.leg.legRole).toBe('EXPIRE')
    expect(result.leg.action).toBe('EXPIRE')
    expect(result.leg.instrumentType).toBe('PUT')
    expect(result.leg.fillPrice).toBeNull()
    expect(result.leg.fillDate).toBe(expirationDate)
    expect(result.leg.premiumPerContract).toBe('0.0000')
  })

  it('defaults closedDate to the contract expiration when no override is provided', () => {
    const db = makeTestDb()
    // Use a past expiry so today passes the too_early check without an override
    const pastExpiry = isoDate(-1)
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: pastExpiry,
      contracts: 1,
      premiumPerContract: 2.5,
      fillDate: isoDate(-30)
    })

    const result = expireCspPosition(db, position.id, { positionId: position.id })

    expect(result.position.closedDate).toBe(pastExpiry)
    expect(result.leg.fillDate).toBe(pastExpiry)
  })

  it('records cost basis snapshot with final_pnl equal to total premium collected', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)
    const expirationDate = isoDate(EXPIRATION_OFFSET)

    const result = expireCspPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: expirationDate
    })

    // 1 contract at $2.50 = $250 total premium
    expect(result.costBasisSnapshot.finalPnl).toBe('250.0000')
  })

  it('persists expire leg in the DB', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)
    const expirationDate = isoDate(EXPIRATION_OFFSET)

    expireCspPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: expirationDate
    })

    const row = db
      .prepare(`SELECT * FROM legs WHERE position_id = ? AND leg_role = 'EXPIRE'`)
      .get(position.id) as Record<string, unknown> | undefined
    expect(row).toBeDefined()
    expect(row!.action).toBe('EXPIRE')
    expect(row!.fill_price).toBeNull()
  })

  it('persists updated position phase and status in the DB', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)
    const expirationDate = isoDate(EXPIRATION_OFFSET)

    expireCspPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: expirationDate
    })

    const row = db
      .prepare(`SELECT phase, status, closed_date FROM positions WHERE id = ?`)
      .get(position.id) as Record<string, unknown>
    expect(row.phase).toBe('WHEEL_COMPLETE')
    expect(row.status).toBe('CLOSED')
    expect(row.closed_date).toBe(expirationDate)
  })

  it('persists cost basis snapshot with final_pnl in the DB', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)
    const expirationDate = isoDate(EXPIRATION_OFFSET)

    expireCspPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: expirationDate
    })

    const row = db
      .prepare(
        `SELECT final_pnl FROM cost_basis_snapshots WHERE position_id = ? ORDER BY snapshot_at DESC LIMIT 1`
      )
      .get(position.id) as Record<string, unknown>
    expect(row.final_pnl).toBe('250.0000')
  })

  it('throws ValidationError(not_found) when positionId does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    try {
      expireCspPosition(db, fakeId, { positionId: fakeId })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('not_found')
    }
  })

  it('throws ValidationError(invalid_phase) when position is not CSP_OPEN', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    // Close the position first so it's no longer CSP_OPEN
    closeCspPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.0,
      fillDate: isoDate(1)
    })

    try {
      expireCspPosition(db, position.id, {
        positionId: position.id,
        expirationDateOverride: isoDate(EXPIRATION_OFFSET)
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('invalid_phase')
    }
  })

  it('throws ValidationError(too_early) when referenceDate is before expiration', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    try {
      expireCspPosition(db, position.id, {
        positionId: position.id,
        expirationDateOverride: isoDate(EXPIRATION_OFFSET - 1) // one day early
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('too_early')
    }
  })
})
