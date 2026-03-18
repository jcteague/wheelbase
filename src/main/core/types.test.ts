import { describe, expect, it } from 'vitest'
import { InstrumentType, LegAction } from './types'

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
})
