import { describe, expect, it } from 'vitest'
import { InstrumentType, LegAction, LegRole, WheelPhase } from './types'

describe('InstrumentType', () => {
  it('accepts STOCK as a valid instrument type', () => {
    expect(InstrumentType.parse('STOCK')).toBe('STOCK')
  })

  it('continues accepting PUT and CALL instrument types', () => {
    expect(InstrumentType.parse('PUT')).toBe('PUT')
    expect(InstrumentType.parse('CALL')).toBe('CALL')
  })

  it('rejects unsupported instrument types', () => {
    expect(() => InstrumentType.parse('BOND')).toThrow()
    expect(() => InstrumentType.parse('OPTION')).toThrow()
  })
})

describe('LegAction', () => {
  it('accepts ASSIGN as a valid leg action', () => {
    expect(LegAction.parse('ASSIGN')).toBe('ASSIGN')
  })

  it('accepts EXERCISE as a valid leg action', () => {
    expect(LegAction.parse('EXERCISE')).toBe('EXERCISE')
  })

  it('rejects invalid leg actions', () => {
    expect(() => LegAction.parse('INVALID')).toThrow()
  })
})

describe('LegRole', () => {
  it('accepts CC_EXPIRED as a valid leg role', () => {
    expect(LegRole.parse('CC_EXPIRED')).toBe('CC_EXPIRED')
  })

  it('accepts CALLED_AWAY as a valid leg role', () => {
    expect(LegRole.parse('CALLED_AWAY')).toBe('CALLED_AWAY')
  })

  it('accepts the PMCC roles LEAPS_OPEN and SHORT_CALL_OPEN', () => {
    expect(LegRole.parse('LEAPS_OPEN')).toBe('LEAPS_OPEN')
    expect(LegRole.parse('SHORT_CALL_OPEN')).toBe('SHORT_CALL_OPEN')
  })
})

describe('WheelPhase', () => {
  it('accepts PMCC_OPEN as a valid phase', () => {
    expect(WheelPhase.parse('PMCC_OPEN')).toBe('PMCC_OPEN')
  })

  it('rejects the reserved PMCC_LEAPS_ONLY phase, which is not added yet', () => {
    expect(() => WheelPhase.parse('PMCC_LEAPS_ONLY')).toThrow()
  })
})
