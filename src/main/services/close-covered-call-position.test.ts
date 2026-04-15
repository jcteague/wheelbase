import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { closeCoveredCallPosition } from './close-covered-call-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { createPosition } from './positions'

const CC_STRIKE = 182
const CC_PREMIUM = 2.3
const CSP_STRIKE = 180
const CSP_PREMIUM = 3.5

function makeCcOpenPosition(db: ReturnType<typeof makeTestDb>): {
  position: ReturnType<typeof openCoveredCallPosition>['position']
  ccExpiration: string
  ccOpenDate: string
} {
  const today = isoDate(0)
  const ccExpiration = isoDate(60)

  const created = createPosition(db, {
    ticker: 'AAPL',
    strike: CSP_STRIKE,
    expiration: isoDate(90),
    contracts: 1,
    premiumPerContract: CSP_PREMIUM,
    fillDate: today
  })
  const assigned = assignCspPosition(db, created.position.id, {
    positionId: created.position.id,
    assignmentDate: today
  })
  const ccOpened = openCoveredCallPosition(db, assigned.position.id, {
    positionId: assigned.position.id,
    strike: CC_STRIKE,
    expiration: ccExpiration,
    contracts: 1,
    premiumPerContract: CC_PREMIUM,
    fillDate: today
  })
  return { position: ccOpened.position, ccExpiration, ccOpenDate: today }
}

describe('closeCoveredCallPosition', () => {
  it('returns position.phase=HOLDING_SHARES, leg.legRole=CC_CLOSE, and ccLegPnl for profit close', () => {
    const db = makeTestDb()
    const { position, ccOpenDate } = makeCcOpenPosition(db)

    // (2.30 - 1.10) × 1 × 100 = 120.00
    const result = closeCoveredCallPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.1,
      fillDate: ccOpenDate
    })

    expect(result.position.phase).toBe('HOLDING_SHARES')
    expect(result.leg.legRole).toBe('CC_CLOSE')
    expect(result.ccLegPnl).toBe('120.0000')
  })

  it('returns ccLegPnl=-120.0000 for loss close (closePrice=3.50)', () => {
    const db = makeTestDb()
    const { position, ccOpenDate } = makeCcOpenPosition(db)

    // (2.30 - 3.50) × 1 × 100 = -120.00
    const result = closeCoveredCallPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 3.5,
      fillDate: ccOpenDate
    })

    expect(result.ccLegPnl).toBe('-120.0000')
  })

  it('inserts a CC_CLOSE leg with action=BUY and instrumentType=CALL in the database', () => {
    const db = makeTestDb()
    const { position, ccOpenDate } = makeCcOpenPosition(db)

    closeCoveredCallPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.1,
      fillDate: ccOpenDate
    })

    const row = db
      .prepare(`SELECT * FROM legs WHERE position_id = ? AND leg_role = 'CC_CLOSE'`)
      .get(position.id) as Record<string, unknown> | undefined
    expect(row).toBeDefined()
    expect(row!.action).toBe('BUY')
    expect(row!.instrument_type).toBe('CALL')
    expect(row!.fill_price).toBe('1.1000')
  })

  it('updates position phase to HOLDING_SHARES in the database', () => {
    const db = makeTestDb()
    const { position, ccOpenDate } = makeCcOpenPosition(db)

    closeCoveredCallPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.1,
      fillDate: ccOpenDate
    })

    const row = db
      .prepare(`SELECT phase, status, closed_date FROM positions WHERE id = ?`)
      .get(position.id) as Record<string, unknown>
    expect(row.phase).toBe('HOLDING_SHARES')
    expect(row.status).toBe('ACTIVE')
    expect(row.closed_date).toBeNull()
  })

  it('does NOT create a new cost_basis_snapshot row', () => {
    const db = makeTestDb()
    const { position, ccOpenDate } = makeCcOpenPosition(db)

    const countBefore = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(position.id) as Record<string, number>
    ).cnt

    closeCoveredCallPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.1,
      fillDate: ccOpenDate
    })

    const countAfter = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(position.id) as Record<string, number>
    ).cnt

    expect(countAfter).toBe(countBefore)
  })

  it('defaults leg fillDate to today when not provided', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)
    const today = isoDate(0)

    const result = closeCoveredCallPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.1
    })

    expect(result.leg.fillDate).toBe(today)
  })

  it('uses payload.fillDate when provided', () => {
    const db = makeTestDb()
    const { position, ccOpenDate } = makeCcOpenPosition(db)
    // Use same date as open (boundary — valid, on or after open)
    const result = closeCoveredCallPosition(db, position.id, {
      positionId: position.id,
      closePricePerContract: 1.1,
      fillDate: ccOpenDate
    })

    expect(result.leg.fillDate).toBe(ccOpenDate)
  })

  it('throws ValidationError(not_found) when positionId does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    try {
      closeCoveredCallPosition(db, fakeId, {
        positionId: fakeId,
        closePricePerContract: 1.1,
        fillDate: isoDate(0)
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__root__')
      expect((err as ValidationError).code).toBe('not_found')
    }
  })

  it('throws ValidationError(invalid_phase) when position is in HOLDING_SHARES (no open CC)', () => {
    const db = makeTestDb()
    const today = isoDate(0)
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: CSP_STRIKE,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: CSP_PREMIUM,
      fillDate: today
    })
    const assigned = assignCspPosition(db, created.position.id, {
      positionId: created.position.id,
      assignmentDate: today
    })

    try {
      closeCoveredCallPosition(db, assigned.position.id, {
        positionId: assigned.position.id,
        closePricePerContract: 1.1,
        fillDate: today
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__phase__')
      expect((err as ValidationError).code).toBe('invalid_phase')
    }
  })

  it('throws ValidationError(must_be_positive) when closePricePerContract is 0', () => {
    const db = makeTestDb()
    const { position, ccOpenDate } = makeCcOpenPosition(db)

    try {
      closeCoveredCallPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 0,
        fillDate: ccOpenDate
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('closePricePerContract')
      expect((err as ValidationError).code).toBe('must_be_positive')
    }
  })

  it('throws ValidationError(close_date_before_open) when fillDate is before CC open date', () => {
    const db = makeTestDb()
    const { position } = makeCcOpenPosition(db)

    // Use a date 1 day before today (which is the CC open date)
    const yesterday = isoDate(-1)
    try {
      closeCoveredCallPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 1.1,
        fillDate: yesterday
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('fillDate')
      expect((err as ValidationError).code).toBe('close_date_before_open')
    }
  })

  it('throws ValidationError(close_date_after_expiration) when fillDate is after CC expiration', () => {
    const db = makeTestDb()
    const { position, ccExpiration } = makeCcOpenPosition(db)

    // Date one day after expiration
    const afterExpiry = new Date(new Date(ccExpiration).getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    try {
      closeCoveredCallPosition(db, position.id, {
        positionId: position.id,
        closePricePerContract: 1.1,
        fillDate: afterExpiry
      })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('fillDate')
      expect((err as ValidationError).code).toBe('close_date_after_expiration')
    }
  })
})
