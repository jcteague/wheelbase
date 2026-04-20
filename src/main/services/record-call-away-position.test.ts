import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { recordCallAwayPosition } from './record-call-away-position'
import { createPosition } from './positions'

const CC_STRIKE = 182
const CSP_STRIKE = 180
// CSP_PREMIUM=3.50 → initial basisPerShare = 176.50
// CC_PREMIUM=2.30 → reduces basisPerShare by 2.30 → final basisPerShare = 174.20
// (182 - 174.20) * 100 = 780 final P&L
const CSP_PREMIUM = 3.5
const CC_PREMIUM = 2.3

function makeCcOpenPosition(db: ReturnType<typeof makeTestDb>): {
  positionId: string
  ccExpiration: string
  ccOpenDate: string
  positionOpenedDate: string
} {
  const today = isoDate(0)
  const ccExpiration = isoDate(60)

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
  const ccOpened = openCoveredCallPosition(db, assigned.position.id, {
    positionId: assigned.position.id,
    strike: CC_STRIKE,
    expiration: ccExpiration,
    contracts: 1,
    premiumPerContract: CC_PREMIUM,
    fillDate: today
  })

  return {
    positionId: ccOpened.position.id,
    ccExpiration,
    ccOpenDate: today,
    positionOpenedDate: today
  }
}

describe('recordCallAwayPosition', () => {
  it('records CALLED_AWAY (EXERCISE) leg with fill_price=ccStrike, fill_date=ccExpiration on valid CC_OPEN position', () => {
    const db = makeTestDb()
    const { positionId, ccExpiration } = makeCcOpenPosition(db)

    const result = recordCallAwayPosition(db, positionId, { positionId })

    expect(result.leg.legRole).toBe('CALLED_AWAY')
    expect(result.leg.action).toBe('EXERCISE')
    expect(result.leg.fillPrice).toBe('182.0000')
    expect(result.leg.fillDate).toBe(ccExpiration)
  })

  it('sets position phase=WHEEL_COMPLETE, status=CLOSED, closed_date=fill_date', () => {
    const db = makeTestDb()
    const { positionId, ccExpiration } = makeCcOpenPosition(db)

    const result = recordCallAwayPosition(db, positionId, { positionId })

    expect(result.position.phase).toBe('WHEEL_COMPLETE')
    expect(result.position.status).toBe('CLOSED')
    expect(result.position.closedDate).toBe(ccExpiration)

    const row = db
      .prepare(`SELECT phase, status, closed_date FROM positions WHERE id = ?`)
      .get(positionId) as Record<string, unknown>
    expect(row.phase).toBe('WHEEL_COMPLETE')
    expect(row.status).toBe('CLOSED')
    expect(row.closed_date).toBe(ccExpiration)
  })

  it('creates cost_basis_snapshot with finalPnl set', () => {
    const db = makeTestDb()
    const { positionId } = makeCcOpenPosition(db)

    const countBefore = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(positionId) as Record<string, number>
    ).cnt

    recordCallAwayPosition(db, positionId, { positionId })

    const countAfter = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(positionId) as Record<string, number>
    ).cnt

    expect(countAfter).toBe(countBefore + 1)

    const snapshot = db
      .prepare(
        `SELECT final_pnl FROM cost_basis_snapshots WHERE position_id = ? AND final_pnl IS NOT NULL LIMIT 1`
      )
      .get(positionId) as Record<string, unknown> | undefined
    expect(snapshot).toBeDefined()
    expect(snapshot!.final_pnl).not.toBeNull()
    expect(snapshot!.final_pnl).not.toBe('0.0000')
  })

  it('returns finalPnl, cycleDays, annualizedReturn in result — ccStrike=182, basis=174.20 → finalPnl=780', () => {
    const db = makeTestDb()
    const { positionId } = makeCcOpenPosition(db)

    const result = recordCallAwayPosition(db, positionId, { positionId })

    // (182 - 174.20) * 100 = 780
    expect(result.finalPnl).toBe('780.0000')
    expect(typeof result.cycleDays).toBe('number')
    expect(typeof result.annualizedReturn).toBe('string')
    expect(result.basisPerShare).toBe('174.2000')
    expect(result.costBasisSnapshot.triggerEvent).toBe('CALL_AWAY')
  })

  it('throws ValidationError (invalid_phase) when position is in HOLDING_SHARES', () => {
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

    // Count snapshots before — should NOT change
    const countBefore = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(assigned.position.id) as Record<string, number>
    ).cnt

    expect(() =>
      recordCallAwayPosition(db, assigned.position.id, { positionId: assigned.position.id })
    ).toThrow(ValidationError)

    try {
      recordCallAwayPosition(db, assigned.position.id, { positionId: assigned.position.id })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('invalid_phase')
    }

    const countAfter = (
      db
        .prepare(`SELECT COUNT(*) as cnt FROM cost_basis_snapshots WHERE position_id = ?`)
        .get(assigned.position.id) as Record<string, number>
    ).cnt
    expect(countAfter).toBe(countBefore)
  })

  it('throws ValidationError (multi_contract_unsupported) when contracts=2', () => {
    const db = makeTestDb()
    const today = isoDate(0)
    const ccExpiration = isoDate(60)

    // Create a position with 2 contracts
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: CSP_STRIKE,
      expiration: isoDate(30),
      contracts: 2,
      premiumPerContract: CSP_PREMIUM,
      fillDate: today
    })
    const assigned = assignCspPosition(db, created.position.id, {
      positionId: created.position.id,
      assignmentDate: today
    })
    openCoveredCallPosition(db, assigned.position.id, {
      positionId: assigned.position.id,
      strike: CC_STRIKE,
      expiration: ccExpiration,
      contracts: 2,
      premiumPerContract: CC_PREMIUM,
      fillDate: today
    })

    try {
      recordCallAwayPosition(db, created.position.id, { positionId: created.position.id })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('multi_contract_unsupported')
    }
  })

  it('throws ValidationError (not_found) when positionId does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    try {
      recordCallAwayPosition(db, fakeId, { positionId: fakeId })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('not_found')
    }
  })

  it('throws ValidationError (no_cc_open_leg) when position is CC_OPEN but no CC_OPEN leg exists', () => {
    const db = makeTestDb()
    const { positionId } = makeCcOpenPosition(db)

    // Manually delete the CC_OPEN leg to simulate the edge case
    db.prepare(`DELETE FROM legs WHERE position_id = ? AND leg_role = 'CC_OPEN'`).run(positionId)

    try {
      recordCallAwayPosition(db, positionId, { positionId })
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).code).toBe('no_cc_open_leg')
    }
  })
})
