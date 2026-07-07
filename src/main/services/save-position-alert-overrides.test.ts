// [US-58] Per-position alert-overrides service
import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { isoDate, makeTestDb } from '../test-utils'
import { createPosition } from './positions'
import { getPosition } from './get-position'
import { savePositionAlertOverrides } from './save-position-alert-overrides'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

function seedPosition(db: ReturnType<typeof makeTestDb>): string {
  const result = createPosition(db, {
    ticker: 'AAPL',
    strike: 180,
    expiration: isoDate(30),
    contracts: 1,
    premiumPerContract: 2.5,
    fillDate: isoDate(0)
  })
  return result.position.id
}

describe('savePositionAlertOverrides', () => {
  it('writes both columns and getPosition reflects the saved overrides', () => {
    const db = makeTestDb()
    const positionId = seedPosition(db)

    savePositionAlertOverrides(db, positionId, {
      profitTargetPercent: 25,
      managementWindowDte: 14
    })

    const detail = getPosition(db, positionId)
    expect(detail!.position.profitTargetPercent).toBe(25)
    expect(detail!.position.managementWindowDteOverride).toBe(14)
  })

  it('clears both columns back to null (US-58 Scenario 3)', () => {
    const db = makeTestDb()
    const positionId = seedPosition(db)
    savePositionAlertOverrides(db, positionId, {
      profitTargetPercent: 25,
      managementWindowDte: 14
    })

    savePositionAlertOverrides(db, positionId, {
      profitTargetPercent: null,
      managementWindowDte: null
    })

    const detail = getPosition(db, positionId)
    expect(detail!.position.profitTargetPercent).toBeNull()
    expect(detail!.position.managementWindowDteOverride).toBeNull()
  })

  it('rejects an out-of-range profitTargetPercent and leaves both columns unchanged', () => {
    const db = makeTestDb()
    const positionId = seedPosition(db)

    expect(() =>
      savePositionAlertOverrides(db, positionId, {
        profitTargetPercent: 100,
        managementWindowDte: 14
      })
    ).toThrow(ValidationError)
    expect(() =>
      savePositionAlertOverrides(db, positionId, {
        profitTargetPercent: 100,
        managementWindowDte: 14
      })
    ).toThrow('Profit target must be between 1 and 99')

    const detail = getPosition(db, positionId)
    expect(detail!.position.profitTargetPercent).toBeNull()
    expect(detail!.position.managementWindowDteOverride).toBeNull()
  })

  it('rejects an out-of-range managementWindowDte with the exact AC message', () => {
    const db = makeTestDb()
    const positionId = seedPosition(db)

    expect(() =>
      savePositionAlertOverrides(db, positionId, {
        profitTargetPercent: 25,
        managementWindowDte: 60
      })
    ).toThrow('Management window must be between 6 and 45 DTE')

    const detail = getPosition(db, positionId)
    expect(detail!.position.profitTargetPercent).toBeNull()
    expect(detail!.position.managementWindowDteOverride).toBeNull()
  })

  it('throws a not-found error for an unknown positionId', () => {
    const db = makeTestDb()

    expect(() =>
      savePositionAlertOverrides(db, 'nonexistent-id', {
        profitTargetPercent: 25,
        managementWindowDte: 14
      })
    ).toThrow(ValidationError)
    expect(() =>
      savePositionAlertOverrides(db, 'nonexistent-id', {
        profitTargetPercent: 25,
        managementWindowDte: 14
      })
    ).toThrow('Position not found')
  })

  it('accepts the boundary values 1, 99, 6, and 45 without throwing', () => {
    const db = makeTestDb()
    const positionId = seedPosition(db)

    expect(() =>
      savePositionAlertOverrides(db, positionId, {
        profitTargetPercent: 1,
        managementWindowDte: 6
      })
    ).not.toThrow()
    expect(() =>
      savePositionAlertOverrides(db, positionId, {
        profitTargetPercent: 99,
        managementWindowDte: 45
      })
    ).not.toThrow()

    const detail = getPosition(db, positionId)
    expect(detail!.position.profitTargetPercent).toBe(99)
    expect(detail!.position.managementWindowDteOverride).toBe(45)
  })
})
