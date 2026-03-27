import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { expireCcPosition } from './expire-cc-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { createPosition } from './positions'

const CC_EXPIRATION = '2026-02-21'

function makeCcOpenPosition(
  db: ReturnType<typeof makeTestDb>
): ReturnType<typeof openCoveredCallPosition> {
  const created = createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: 3.5,
    fillDate: '2026-01-03'
  })
  const assigned = assignCspPosition(db, created.position.id, {
    positionId: created.position.id,
    assignmentDate: '2026-01-17'
  })
  const ccOpen = openCoveredCallPosition(db, assigned.position.id, {
    positionId: assigned.position.id,
    strike: 182,
    expiration: CC_EXPIRATION,
    contracts: 1,
    premiumPerContract: 2.3,
    fillDate: '2026-01-20'
  })
  return ccOpen
}

describe('expireCcPosition', () => {
  it('happy path: returns position.phase = HOLDING_SHARES, status = ACTIVE, closedDate = null', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)

    const result = expireCcPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: CC_EXPIRATION
    })

    expect(result.position.phase).toBe('HOLDING_SHARES')
    expect(result.position.status).toBe('ACTIVE')
    expect(result.position.closedDate).toBeNull()
  })

  it('happy path: returned leg has legRole=EXPIRE, action=EXPIRE, instrumentType=CALL, premiumPerContract=0.0000, fillPrice=null', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)

    const result = expireCcPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: CC_EXPIRATION
    })

    expect(result.leg.legRole).toBe('EXPIRE')
    expect(result.leg.action).toBe('EXPIRE')
    expect(result.leg.instrumentType).toBe('CALL')
    expect(result.leg.premiumPerContract).toBe('0.0000')
    expect(result.leg.fillPrice).toBeNull()
    expect(result.leg.fillDate).toBe(CC_EXPIRATION)
  })

  it('happy path: returns sharesHeld = 100 for 1-contract position', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)

    const result = expireCcPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: CC_EXPIRATION
    })

    expect(result.sharesHeld).toBe(100)
  })

  it('happy path: cost_basis_snapshots table has NOT gained a new row', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)

    const countBefore = (
      db
        .prepare(`SELECT COUNT(*) as c FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(position.id) as { c: number }
    ).c

    expireCcPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: CC_EXPIRATION
    })

    const countAfter = (
      db
        .prepare(`SELECT COUNT(*) as c FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(position.id) as { c: number }
    ).c

    expect(countAfter).toBe(countBefore)
  })

  it('happy path: positions row has phase=HOLDING_SHARES, status=ACTIVE, closed_date=NULL', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)

    expireCcPosition(db, position.id, {
      positionId: position.id,
      expirationDateOverride: CC_EXPIRATION
    })

    const row = db
      .prepare(`SELECT phase, status, closed_date FROM positions WHERE id = ?`)
      .get(position.id) as Record<string, unknown>

    expect(row.phase).toBe('HOLDING_SHARES')
    expect(row.status).toBe('ACTIVE')
    expect(row.closed_date).toBeNull()
  })

  it('throws ValidationError with code=not_found when positionId does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    try {
      expireCcPosition(db, fakeId, { positionId: fakeId })
      throw new Error('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('not_found')
    }
  })

  it('throws ValidationError with code=invalid_phase when phase is HOLDING_SHARES', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 3.5,
      fillDate: '2026-01-03'
    })
    const assigned = assignCspPosition(db, created.position.id, {
      positionId: created.position.id,
      assignmentDate: '2026-01-17'
    })

    try {
      expireCcPosition(db, assigned.position.id, {
        positionId: assigned.position.id,
        expirationDateOverride: CC_EXPIRATION
      })
      throw new Error('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('invalid_phase')
      expect((err as ValidationError).message).toBe('No open covered call on this position')
    }
  })

  it('throws ValidationError with code=too_early when expirationDateOverride is one day before CC expiration', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)
    const oneDayEarly = '2026-02-20' // one day before CC_EXPIRATION 2026-02-21

    try {
      expireCcPosition(db, position.id, {
        positionId: position.id,
        expirationDateOverride: oneDayEarly
      })
      throw new Error('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('too_early')
    }
  })
})
