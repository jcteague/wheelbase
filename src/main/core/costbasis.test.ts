import { describe, expect, it } from 'vitest'
import { calculateInitialCspBasis } from './costbasis'
import type { CostBasisResult, CspLegInput } from './costbasis'

describe('calculateInitialCspBasis', () => {
  it('calculates basis per share', () => {
    const leg: CspLegInput = { strike: '150.00', premiumPerContract: '3.50', contracts: 1 }
    const result = calculateInitialCspBasis(leg)
    expect(result.basisPerShare).toBe('146.5')
  })

  it('calculates total premium collected', () => {
    const leg: CspLegInput = { strike: '150.00', premiumPerContract: '3.50', contracts: 1 }
    const result = calculateInitialCspBasis(leg)
    expect(result.totalPremiumCollected).toBe('350')
  })

  it('scales total premium by contract count', () => {
    const leg: CspLegInput = { strike: '100.00', premiumPerContract: '2.00', contracts: 5 }
    const result = calculateInitialCspBasis(leg)
    expect(result.basisPerShare).toBe('98')
    expect(result.totalPremiumCollected).toBe('1000')
  })

  it('produces negative basis when premium exceeds strike', () => {
    const leg: CspLegInput = { strike: '10.00', premiumPerContract: '12.00', contracts: 1 }
    const result = calculateInitialCspBasis(leg)
    expect(result.basisPerShare).toBe('-2')
    expect(result.totalPremiumCollected).toBe('1200')
  })

  it('rounds basis per share HALF_UP to 4 decimal places', () => {
    // 100.00 - 0.33333 = 99.66667 → ROUND_HALF_UP → 99.6667
    const leg: CspLegInput = { strike: '100.00', premiumPerContract: '0.33333', contracts: 1 }
    const result = calculateInitialCspBasis(leg)
    expect(result.basisPerShare).toBe('99.6667')
  })

  it('rounds total premium collected HALF_UP to 4 decimal places', () => {
    // 1.33335 * 3 * 100 = 400.005 → ROUND_HALF_UP → 400.005 (5 decimal place not needed)
    const leg: CspLegInput = { strike: '50.00', premiumPerContract: '1.33335', contracts: 3 }
    const result = calculateInitialCspBasis(leg)
    expect(result.totalPremiumCollected).toBe('400.005')
  })

  it('handles high-precision inputs', () => {
    const leg: CspLegInput = {
      strike: '245.6789',
      premiumPerContract: '4.1234',
      contracts: 2
    }
    const result = calculateInitialCspBasis(leg)
    expect(result.basisPerShare).toBe('241.5555')
    expect(result.totalPremiumCollected).toBe('824.68')
  })

  it('returns an object with basisPerShare and totalPremiumCollected', () => {
    const leg: CspLegInput = { strike: '100.00', premiumPerContract: '2.00', contracts: 1 }
    const result: CostBasisResult = calculateInitialCspBasis(leg)
    expect(result).toHaveProperty('basisPerShare')
    expect(result).toHaveProperty('totalPremiumCollected')
  })
})
