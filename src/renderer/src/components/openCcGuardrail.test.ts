import { describe, expect, it } from 'vitest'
import { computeGuardrail, computeGuardrailComparison } from './openCcGuardrail'

describe('computeGuardrailComparison', () => {
  it('returns type "below" when strike < basis', () => {
    const result = computeGuardrailComparison('175.00', '176.50')
    expect(result?.type).toBe('below')
    expect(result?.diffPerShare).toBeCloseTo(-1.5)
  })

  it('returns type "at" when strike === basis', () => {
    const result = computeGuardrailComparison('176.50', '176.50')
    expect(result?.type).toBe('at')
    expect(result?.diffPerShare).toBe(0)
  })

  it('returns type "above" when strike > basis', () => {
    const result = computeGuardrailComparison('190.00', '176.50')
    expect(result?.type).toBe('above')
    expect(result?.diffPerShare).toBeCloseTo(13.5)
  })

  it('returns null when strike is not a valid number', () => {
    expect(computeGuardrailComparison('', '176.50')).toBeNull()
    expect(computeGuardrailComparison('abc', '176.50')).toBeNull()
  })

  it('returns null when basis is not a valid number', () => {
    expect(computeGuardrailComparison('185.00', '')).toBeNull()
  })
})

describe('computeGuardrail (regression)', () => {
  it('returns below message when strike < basis', () => {
    const result = computeGuardrail('175.00', '176.50')
    expect(result?.type).toBe('below')
    expect(result?.message).toMatch(/lock in a loss/)
    expect(result?.message).toMatch(/\$1\.50\/share/)
  })

  it('returns at message when strike === basis', () => {
    const result = computeGuardrail('176.50', '176.50')
    expect(result?.type).toBe('at')
    expect(result?.message).toMatch(/break even/)
  })

  it('returns above message when strike > basis', () => {
    const result = computeGuardrail('190.00', '176.50')
    expect(result?.type).toBe('above')
    expect(result?.message).toMatch(/profit/)
  })

  it('returns null for invalid inputs', () => {
    expect(computeGuardrail('', '176.50')).toBeNull()
  })
})
