import { describe, expect, it } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { assignCspPosition } from './assign-csp-position'
import { getPosition } from './get-position'
import { createPosition } from './positions'
import { rollCspPosition } from './roll-csp-position'

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

  it('returns a premiumWaterfall with CSP premium and roll net credit entries', () => {
    const db = makeTestDb()
    const created = createPosition(db, {
      ticker: 'AAPL',
      strike: 175,
      expiration: '2026-01-31',
      contracts: 1,
      premiumPerContract: 2,
      fillDate: '2026-01-03'
    })

    // net credit = 1.50 - 1.00 = 0.50
    rollCspPosition(db, created.position.id, {
      positionId: created.position.id,
      costToClosePerContract: 1.0,
      newPremiumPerContract: 1.5,
      newExpiration: '2026-02-28',
      fillDate: '2026-01-10'
    })

    const result = assignCspPosition(db, created.position.id, {
      positionId: created.position.id,
      assignmentDate: '2026-01-17'
    })

    expect(result.premiumWaterfall).toEqual([
      { label: 'CSP premium', amount: '2.0000' },
      { label: 'Roll #1 credit', amount: '0.5000' }
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
    expect.assertions(2)
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
    expect.assertions(2)
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

describe('assignCspPosition — rolled positions', () => {
  function makeRolledPosition(
    db: ReturnType<typeof makeTestDb>
  ): ReturnType<typeof createPosition> {
    return createPosition(db, {
      ticker: 'AAPL',
      strike: 50,
      expiration: '2026-01-31',
      contracts: 1,
      premiumPerContract: 2,
      fillDate: '2026-01-03'
    })
  }

  it('assignment after one same-strike CSP roll — basis uses net credit not gross ROLL_TO premium', () => {
    const db = makeTestDb()
    const { position } = makeRolledPosition(db)

    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.8,
      newPremiumPerContract: 1.5,
      newExpiration: '2026-02-28',
      fillDate: '2026-01-10'
    })

    const result = assignCspPosition(db, position.id, {
      positionId: position.id,
      assignmentDate: '2026-01-17'
    })

    // net credit = 1.50 - 0.80 = 0.70; correct basis = 50 - 2.00 - 0.70 = 47.30
    // buggy value: 50 - 2.00 - 1.50 (gross ROLL_TO) = 46.50
    expect(result.costBasisSnapshot.basisPerShare).toBe('47.3000')
    expect(result.costBasisSnapshot.triggerEvent).toBe('CSP_ASSIGN')
  })

  it('assignment after one CSP roll — waterfall shows Roll #1 credit label', () => {
    const db = makeTestDb()
    const { position } = makeRolledPosition(db)

    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.8,
      newPremiumPerContract: 1.5,
      newExpiration: '2026-02-28',
      fillDate: '2026-01-10'
    })

    const result = assignCspPosition(db, position.id, {
      positionId: position.id,
      assignmentDate: '2026-01-17'
    })

    expect(result.premiumWaterfall).toContainEqual({ label: 'Roll #1 credit', amount: '0.7000' })
  })

  it('assignment after two CSP rolls — basis reflects cumulative net credits', () => {
    const db = makeTestDb()
    const { position } = makeRolledPosition(db)

    // Roll 1: net credit = 1.50 - 0.80 = 0.70
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.8,
      newPremiumPerContract: 1.5,
      newExpiration: '2026-02-28',
      fillDate: '2026-01-10'
    })

    // Roll 2: net credit = 1.40 - 0.60 = 0.80
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 0.6,
      newPremiumPerContract: 1.4,
      newExpiration: '2026-03-31',
      fillDate: '2026-01-17'
    })

    const result = assignCspPosition(db, position.id, {
      positionId: position.id,
      assignmentDate: '2026-01-24'
    })

    // 50 - 2.00 - 0.70 - 0.80 = 46.50
    expect(result.costBasisSnapshot.basisPerShare).toBe('46.5000')
  })

  it('assignment after CSP roll with net debit — waterfall shows Roll #1 debit and basis increases', () => {
    const db = makeTestDb()
    const { position } = makeRolledPosition(db)

    // net debit = 2.00 - 2.50 = -0.50
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 2.5,
      newPremiumPerContract: 2.0,
      newExpiration: '2026-02-28',
      fillDate: '2026-01-10'
    })

    const result = assignCspPosition(db, position.id, {
      positionId: position.id,
      assignmentDate: '2026-01-17'
    })

    // 50 - 2.00 - (-0.50) = 48.50
    expect(result.costBasisSnapshot.basisPerShare).toBe('48.5000')
    expect(result.premiumWaterfall).toContainEqual({ label: 'Roll #1 debit', amount: '-0.5000' })
  })

  it('assignment after CSP roll-down to different strike — basisPerShare uses rolled-to strike $47', () => {
    const db = makeTestDb()
    const { position } = makeRolledPosition(db)

    // Roll down to $47; net credit = 1.50 - 1.20 = 0.30
    rollCspPosition(db, position.id, {
      positionId: position.id,
      costToClosePerContract: 1.2,
      newPremiumPerContract: 1.5,
      newStrike: 47,
      newExpiration: '2026-02-28',
      fillDate: '2026-01-10'
    })

    const result = assignCspPosition(db, position.id, {
      positionId: position.id,
      assignmentDate: '2026-01-17'
    })

    // activeLeg.strike = 47; 47 - 2.00 - 0.30 = 44.70
    expect(result.costBasisSnapshot.basisPerShare).toBe('44.7000')
  })
})
