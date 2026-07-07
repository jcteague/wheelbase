// [US-57] Global alert-defaults service
import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { makeTestDb } from '../test-utils'
import { getAlertDefaults, saveAlertDefaults } from './alert-defaults'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('getAlertDefaults', () => {
  it('returns the hardcoded defaults on a fresh DB with no app_settings rows', () => {
    const db = makeTestDb()

    expect(getAlertDefaults(db)).toEqual({ profitTargetPercent: 50, managementWindowDte: 21 })
  })
})

describe('saveAlertDefaults', () => {
  it('persists both values and a subsequent getAlertDefaults returns them', () => {
    const db = makeTestDb()

    saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 14 })

    expect(getAlertDefaults(db)).toEqual({ profitTargetPercent: 40, managementWindowDte: 14 })
  })

  it('rejects a profitTargetPercent of 0 and leaves app_settings unchanged', () => {
    const db = makeTestDb()
    saveAlertDefaults(db, { profitTargetPercent: 45, managementWindowDte: 18 })

    expect(() =>
      saveAlertDefaults(db, { profitTargetPercent: 0, managementWindowDte: 14 })
    ).toThrow(ValidationError)
    expect(() =>
      saveAlertDefaults(db, { profitTargetPercent: 0, managementWindowDte: 14 })
    ).toThrow('Profit target must be between 1 and 99')

    // No partial write — prior saved values remain
    expect(getAlertDefaults(db)).toEqual({ profitTargetPercent: 45, managementWindowDte: 18 })
  })

  it('rejects a managementWindowDte of 100 and writes neither row (no partial write)', () => {
    const db = makeTestDb()
    saveAlertDefaults(db, { profitTargetPercent: 45, managementWindowDte: 18 })

    expect(() =>
      saveAlertDefaults(db, { profitTargetPercent: 40, managementWindowDte: 100 })
    ).toThrow('Management window must be between 6 and 45 DTE')

    // profitTargetPercent must be unchanged too — proves no partial write
    expect(getAlertDefaults(db)).toEqual({ profitTargetPercent: 45, managementWindowDte: 18 })
  })

  it('accepts the boundary values 1, 99, 6, and 45 without throwing', () => {
    const db = makeTestDb()

    expect(() =>
      saveAlertDefaults(db, { profitTargetPercent: 1, managementWindowDte: 6 })
    ).not.toThrow()
    expect(() =>
      saveAlertDefaults(db, { profitTargetPercent: 99, managementWindowDte: 45 })
    ).not.toThrow()

    expect(getAlertDefaults(db)).toEqual({ profitTargetPercent: 99, managementWindowDte: 45 })
  })
})
