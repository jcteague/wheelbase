import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { rollCspPosition } from './roll-csp-position'
import { createPosition } from './positions'
import { getPosition } from './get-position'

function makeOpenPosition(db: ReturnType<typeof makeTestDb>): ReturnType<typeof createPosition> {
  return createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: 3.5,
    fillDate: isoDate(0)
  })
}

describe('rollCspPosition', () => {
  it('happy path (net credit): creates linked ROLL_FROM and ROLL_TO legs, snapshot has lower basisPerShare', () => {
    const db = makeTestDb()
    const { position, costBasisSnapshot: originalSnapshot } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    expect(result.position.phase).toBe('CSP_OPEN')
    expect(result.position.status).toBe('ACTIVE')

    expect(result.rollFromLeg.legRole).toBe('ROLL_FROM')
    expect(result.rollFromLeg.action).toBe('BUY')
    expect(result.rollFromLeg.strike).toBe('180.0000')
    expect(result.rollFromLeg.expiration).toBe(isoDate(30))
    expect(result.rollFromLeg.premiumPerContract).toBe('1.2000')

    expect(result.rollToLeg.legRole).toBe('ROLL_TO')
    expect(result.rollToLeg.action).toBe('SELL')
    expect(result.rollToLeg.expiration).toBe(isoDate(60))
    expect(result.rollToLeg.premiumPerContract).toBe('2.8000')

    // Both legs share the same roll_chain_id (verified via DB query in separate test)
    expect(result.rollChainId).toBeDefined()

    // Net credit reduces basis
    expect(parseFloat(result.costBasisSnapshot.basisPerShare)).toBeLessThan(
      parseFloat(originalSnapshot.basisPerShare)
    )
  })

  it('snapshot has triggerEvent CSP_ROLL', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    expect(result.costBasisSnapshot.triggerEvent).toBe('CSP_ROLL')
  })

  it('happy path (net debit): snapshot has higher basisPerShare', () => {
    const db = makeTestDb()
    const { position, costBasisSnapshot: originalSnapshot } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 3.0,
      newPremiumPerContract: 2.5,
      newExpiration: isoDate(60)
    })

    // Net debit increases basis
    expect(parseFloat(result.costBasisSnapshot.basisPerShare)).toBeGreaterThan(
      parseFloat(originalSnapshot.basisPerShare)
    )
  })

  it('throws ValidationError(not_found) when position does not exist', () => {
    const db = makeTestDb()
    const fakeId = '00000000-0000-0000-0000-000000000000'

    try {
      rollCspPosition(db, fakeId, {
        positionId: fakeId,
        costToClosePerContract: 1.2,
        newPremiumPerContract: 2.8,
        newExpiration: isoDate(60)
      })
      expect.fail('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__root__')
      expect((err as ValidationError).code).toBe('not_found')
    }
  })

  it('throws ValidationError(no_active_leg) when position has no active leg', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    // Delete the active leg directly so getPosition returns position but activeLeg is null
    db.prepare('DELETE FROM legs WHERE position_id = ?').run(position.id)

    try {
      rollCspPosition(db, position.id, {
        positionId: position.id,
        costToClosePerContract: 1.2,
        newPremiumPerContract: 2.8,
        newExpiration: isoDate(60)
      })
      expect.fail('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__root__')
      expect((err as ValidationError).code).toBe('no_active_leg')
    }
  })

  it('throws ValidationError(no_snapshot) when position has no cost basis snapshot', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    // Delete snapshots so costBasisSnapshot is null
    db.prepare('DELETE FROM cost_basis_snapshots WHERE position_id = ?').run(position.id)

    try {
      rollCspPosition(db, position.id, {
        positionId: position.id,
        costToClosePerContract: 1.2,
        newPremiumPerContract: 2.8,
        newExpiration: isoDate(60)
      })
      expect.fail('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('__root__')
      expect((err as ValidationError).code).toBe('no_snapshot')
    }
  })

  it('throws ValidationError from lifecycle when newExpiration is not after current', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    try {
      rollCspPosition(db, position.id, {
        positionId: position.id,
        costToClosePerContract: 1.2,
        newPremiumPerContract: 2.8,
        newExpiration: isoDate(20) // before current expiration of isoDate(30)
      })
      expect.fail('Expected ValidationError')
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError)
      expect((err as ValidationError).field).toBe('newExpiration')
      expect((err as ValidationError).code).toBe('must_be_after_current')
    }
  })

  it('rollFromLeg fields match the current CSP leg', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    expect(result.rollFromLeg.strike).toBe('180.0000')
    expect(result.rollFromLeg.expiration).toBe(isoDate(30))
    expect(result.rollFromLeg.premiumPerContract).toBe('1.2000')
    expect(result.rollFromLeg.instrumentType).toBe('PUT')
  })

  it('rollToLeg fields use new values', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    expect(result.rollToLeg.expiration).toBe(isoDate(60))
    expect(result.rollToLeg.premiumPerContract).toBe('2.8000')
    expect(result.rollToLeg.instrumentType).toBe('PUT')
  })

  it('newStrike defaults to current strike when omitted', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    expect(result.rollToLeg.strike).toBe('180.0000')
  })

  it('second roll uses ROLL_TO strike/expiration from the first roll as ROLL_FROM', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    // First roll: 180 strike → 175 strike, isoDate(30) → isoDate(60)
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60),
      newStrike: 175
    })

    // Second roll: should use 175 strike and isoDate(60) as current leg
    const result2 = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.8,
      newPremiumPerContract: 2.0,
      newExpiration: isoDate(90),
      newStrike: 170
    })

    // ROLL_FROM should reference the first ROLL_TO's strike and expiration
    expect(result2.rollFromLeg.strike).toBe('175.0000')
    expect(result2.rollFromLeg.expiration).toBe(isoDate(60))

    // ROLL_TO should use the new values
    expect(result2.rollToLeg.strike).toBe('170.0000')
    expect(result2.rollToLeg.expiration).toBe(isoDate(90))
  })

  it('second roll cost basis reflects cumulative premiums', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    // First roll: net credit of 1.60 (2.80 - 1.20)
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    // Second roll: net credit of 1.20 (2.00 - 0.80)
    const result2 = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.8,
      newPremiumPerContract: 2.0,
      newExpiration: isoDate(90)
    })

    // Total premium = initial 3.50 + roll1 net 1.60 + roll2 net 1.20 = 6.30
    // Total collected (per contract * 100) = 630.0000
    expect(result2.costBasisSnapshot.totalPremiumCollected).toBe('630.0000')
  })

  it('getPosition.activeLeg points to latest ROLL_TO after two rolls', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60),
      newStrike: 175
    })

    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.8,
      newPremiumPerContract: 2.0,
      newExpiration: isoDate(90),
      newStrike: 170
    })

    const detail = getPosition(db, position.id)
    expect(detail).not.toBeNull()
    expect(detail!.activeLeg).not.toBeNull()
    expect(detail!.activeLeg!.legRole).toBe('ROLL_TO')
    expect(detail!.activeLeg!.strike).toBe('170.0000')
    expect(detail!.activeLeg!.expiration).toBe(isoDate(90))
  })

  it('roll-down to lower strike — basisPerShare reflects strike delta + net credit', () => {
    // Initial: strike $180, premium $3.50 → basis $176.50
    // Roll to $175: 176.50 + (175 - 180) - (1.50 - 1.20) = 176.50 - 5 - 0.30 = 171.20
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 1.5,
      newExpiration: isoDate(60),
      newStrike: 175
    })

    expect(result.costBasisSnapshot.basisPerShare).toBe('171.2000')
    expect(result.rollToLeg.strike).toBe('175.0000')
  })

  it('roll-up to higher strike — basisPerShare reflects positive strike delta minus net credit', () => {
    // Initial: strike $180, premium $3.50 → basis $176.50
    // Roll to $185: 176.50 + (185 - 180) - (1.50 - 1.00) = 176.50 + 5 - 0.50 = 181.00
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.0,
      newPremiumPerContract: 1.5,
      newExpiration: isoDate(60),
      newStrike: 185
    })

    expect(result.costBasisSnapshot.basisPerShare).toBe('181.0000')
    expect(result.rollToLeg.strike).toBe('185.0000')
  })

  it('same-strike roll — basisPerShare uses simple formula (prevBasis minus net credit)', () => {
    // Initial: strike $180, premium $3.50 → basis $176.50
    // Same-strike roll: 176.50 - (1.50 - 0.80) = 176.50 - 0.70 = 175.80
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.8,
      newPremiumPerContract: 1.5,
      newExpiration: isoDate(60)
    })

    expect(result.costBasisSnapshot.basisPerShare).toBe('175.8000')
    expect(result.rollToLeg.strike).toBe('180.0000')
  })

  it('persists ROLL_FROM and ROLL_TO legs in DB with matching roll_chain_id', () => {
    const db = makeTestDb()
    const { position } = makeOpenPosition(db)

    const result = rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 2.8,
      newExpiration: isoDate(60)
    })

    const rollFromRow = db
      .prepare(`SELECT * FROM legs WHERE position_id = ? AND leg_role = 'ROLL_FROM'`)
      .get(position.id) as Record<string, unknown> | undefined
    expect(rollFromRow).toBeDefined()
    expect(rollFromRow!.action).toBe('BUY')
    expect(rollFromRow!.roll_chain_id).toBe(result.rollChainId)

    const rollToRow = db
      .prepare(`SELECT * FROM legs WHERE position_id = ? AND leg_role = 'ROLL_TO'`)
      .get(position.id) as Record<string, unknown> | undefined
    expect(rollToRow).toBeDefined()
    expect(rollToRow!.action).toBe('SELL')
    expect(rollToRow!.roll_chain_id).toBe(result.rollChainId)
  })
})
