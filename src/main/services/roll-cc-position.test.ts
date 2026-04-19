import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { openCoveredCallPosition } from './open-covered-call-position'
import { createPosition } from './positions'
import { rollCcPosition } from './roll-cc-position'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOpenCcPosition(db: ReturnType<typeof makeTestDb>): {
  positionId: string
  ccStrike: string
  ccExpiration: string
} {
  const { position } = createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: 2.5,
    fillDate: '2026-01-03'
  })

  assignCspPosition(db, position.id, {
    positionId: position.id,
    assignmentDate: '2026-01-17'
  })

  const ccExpiration = isoDate(30)
  openCoveredCallPosition(db, position.id, {
    positionId: position.id,
    strike: 185,
    expiration: ccExpiration,
    contracts: 1,
    premiumPerContract: 1.0,
    fillDate: isoDate(0)
  })

  return { positionId: position.id, ccStrike: '185.0000', ccExpiration }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('rollCcPosition', () => {
  it('happy path (net credit) — creates ROLL_FROM BUY CALL and ROLL_TO SELL CALL with lower basisPerShare', () => {
    const db = makeTestDb()
    const { positionId, ccExpiration } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.2,
      newExpiration: isoDate(60),
      newStrike: 188
    })

    expect(result.position.phase).toBe('CC_OPEN')
    expect(result.position.status).toBe('ACTIVE')

    expect(result.rollFromLeg.legRole).toBe('ROLL_FROM')
    expect(result.rollFromLeg.action).toBe('BUY')
    expect(result.rollFromLeg.instrumentType).toBe('CALL')
    expect(result.rollFromLeg.strike).toBe('185.0000')
    expect(result.rollFromLeg.expiration).toBe(ccExpiration)
    expect(result.rollFromLeg.premiumPerContract).toBe('1.5000')

    expect(result.rollToLeg.legRole).toBe('ROLL_TO')
    expect(result.rollToLeg.action).toBe('SELL')
    expect(result.rollToLeg.instrumentType).toBe('CALL')
    expect(result.rollToLeg.expiration).toBe(isoDate(60))
    expect(result.rollToLeg.premiumPerContract).toBe('2.2000')

    // Net credit reduces basis
    const prevBasis = 176.5 // 180 - 2.50 (CSP) - 1.00 (CC open)
    expect(parseFloat(result.costBasisSnapshot.basisPerShare)).toBeLessThan(prevBasis)
  })

  it('happy path (net debit) — snapshot has higher basisPerShare', () => {
    const db = makeTestDb()
    const { positionId } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 3.0,
      newPremiumPerContract: 2.0,
      newExpiration: isoDate(60)
    })

    // Net debit increases basis
    const prevBasis = 176.5
    expect(parseFloat(result.costBasisSnapshot.basisPerShare)).toBeGreaterThan(prevBasis)
  })

  it('roll preserves contracts count', () => {
    const db = makeTestDb()
    const { positionId } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.2,
      newExpiration: isoDate(60),
      newStrike: 188
    })

    expect(result.rollFromLeg.contracts).toBe(1)
    expect(result.rollToLeg.contracts).toBe(1)
  })

  it('throws not_found when positionId does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    try {
      rollCcPosition(db, fakeId, {
        positionId: fakeId,
        costToClosePerContract: 1.5,
        newPremiumPerContract: 2.2,
        newExpiration: isoDate(60)
      })
      expect.fail('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__root__')
      expect((err as ValidationError).code).toBe('not_found')
    }
  })

  it('throws invalid_phase when position is not CC_OPEN', () => {
    const db = makeTestDb()
    const { position } = createPosition(db, {
      ticker: 'AAPL',
      strike: 180,
      expiration: isoDate(30),
      contracts: 1,
      premiumPerContract: 3.5
    })

    try {
      rollCcPosition(db, position.id, {
        positionId: position.id,
        costToClosePerContract: 1.5,
        newPremiumPerContract: 2.2,
        newExpiration: isoDate(60)
      })
      expect.fail('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__phase__')
      expect((err as ValidationError).code).toBe('invalid_phase')
    }
  })

  it('throws no_change when both strike and expiration unchanged', () => {
    const db = makeTestDb()
    const { positionId, ccStrike, ccExpiration } = makeOpenCcPosition(db)
    const strikeNum = parseFloat(ccStrike)

    try {
      rollCcPosition(db, positionId, {
        positionId,
        costToClosePerContract: 1.5,
        newPremiumPerContract: 2.2,
        newExpiration: ccExpiration,
        newStrike: strikeNum
      })
      expect.fail('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__roll__')
      expect((err as ValidationError).code).toBe('no_change')
    }
  })

  it('newStrike defaults to current CC strike when omitted', () => {
    const db = makeTestDb()
    const { positionId, ccStrike } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.2,
      newExpiration: isoDate(60)
    })

    expect(result.rollToLeg.strike).toBe(ccStrike)
  })

  it('uses today as fillDate when not provided', () => {
    const db = makeTestDb()
    const { positionId } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.2,
      newExpiration: isoDate(60)
    })

    const today = isoDate(0)
    expect(result.rollFromLeg.fillDate).toBe(today)
    expect(result.rollToLeg.fillDate).toBe(today)
  })

  it('both legs have the same roll_chain_id in the DB', () => {
    const db = makeTestDb()
    const { positionId } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.2,
      newExpiration: isoDate(60)
    })

    const rollFromRow = db
      .prepare(`SELECT roll_chain_id FROM legs WHERE position_id = ? AND leg_role = 'ROLL_FROM'`)
      .get(positionId) as Record<string, unknown> | undefined
    const rollToRow = db
      .prepare(`SELECT roll_chain_id FROM legs WHERE position_id = ? AND leg_role = 'ROLL_TO'`)
      .get(positionId) as Record<string, unknown> | undefined

    expect(rollFromRow?.roll_chain_id).toBe(result.rollChainId)
    expect(rollToRow?.roll_chain_id).toBe(result.rollChainId)
  })

  it('CC roll up to higher strike — basis decreases only by net credit, strike delta ignored', () => {
    // makeOpenCcPosition: CSP 180/-2.50 → assign → CC 185/-1.00
    // Assignment basis: 180 - 2.50 = 177.50
    // After CC open: 177.50 - 1.00 = 176.50
    // Roll CC from 185 → 190: net credit = 2.80 - 2.00 = 0.80
    // Expected: 176.50 - 0.80 = 175.70 (NOT 175.70 + 5 from strike delta)
    const db = makeTestDb()
    const { positionId } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 2.0,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60),
      newStrike: 190
    })

    expect(result.costBasisSnapshot.basisPerShare).toBe('175.7000')
    expect(result.rollToLeg.strike).toBe('190.0000')
  })

  it('CC roll down to lower strike — strike change still does not affect basis', () => {
    // makeOpenCcPosition: basis after CC open = 176.50
    // Roll CC from 185 → 180: net credit = 2.00 - 1.50 = 0.50
    // Expected: 176.50 - 0.50 = 176.00 (NOT affected by -5 strike delta)
    const db = makeTestDb()
    const { positionId } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.0,
      newExpiration: isoDate(60),
      newStrike: 180
    })

    expect(result.costBasisSnapshot.basisPerShare).toBe('176.0000')
    expect(result.rollToLeg.strike).toBe('180.0000')
  })

  it('cost basis snapshot is correct — $176.50 → $175.80 with net credit $0.70', () => {
    // CSP: strike 180, premium 2.50 → assignment basis = 180 - 2.50 = 177.50
    // Open CC: premium 1.00 → basis = 177.50 - 1.00 = 176.50
    // Roll CC: costToClose 1.50, newPremium 2.20 → net credit 0.70 → basis = 176.50 - 0.70 = 175.80
    const db = makeTestDb()
    const { positionId } = makeOpenCcPosition(db)

    const result = rollCcPosition(db, positionId, {
      positionId,
      costToClosePerContract: 1.5,
      newPremiumPerContract: 2.2,
      newExpiration: isoDate(60),
      newStrike: 188
    })

    expect(result.costBasisSnapshot.basisPerShare).toBe('175.8000')
  })
})
