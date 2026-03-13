import { describe, expect, it } from 'vitest'
import { calculateInitialCspBasis, calculateCspClose } from './costbasis'
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

describe('calculateCspClose', () => {
  it('calculates profit: open 2.50, close 1.00, 1 contract', () => {
    const result = calculateCspClose({
      openPremiumPerContract: '2.50',
      closePricePerContract: '1.00',
      contracts: 1
    })
    expect(result.finalPnl).toBe('150.0000')
    expect(result.pnlPercentage).toBe('60.0000')
  })

  it('calculates loss: open 2.50, close 3.50, 1 contract', () => {
    const result = calculateCspClose({
      openPremiumPerContract: '2.50',
      closePricePerContract: '3.50',
      contracts: 1
    })
    expect(result.finalPnl).toBe('-100.0000')
    expect(result.pnlPercentage).toBe('-40.0000')
  })

  it('scales total P&L by contract count (percentage is per-contract)', () => {
    const result = calculateCspClose({
      openPremiumPerContract: '2.50',
      closePricePerContract: '1.00',
      contracts: 2
    })
    expect(result.finalPnl).toBe('300.0000')
    expect(result.pnlPercentage).toBe('60.0000')
  })

  it('returns zero for breakeven close', () => {
    const result = calculateCspClose({
      openPremiumPerContract: '2.50',
      closePricePerContract: '2.50',
      contracts: 1
    })
    expect(result.finalPnl).toBe('0.0000')
    expect(result.pnlPercentage).toBe('0.0000')
  })

  it('rounds to 4 decimal places with ROUND_HALF_UP', () => {
    // netPnlPerContract = 1.33 - 0.66 = 0.67
    // finalPnl = 0.67 * 1 * 100 = 67.00 → 67.0000
    // pnlPercentage = 0.67 / 1.33 * 100 = 50.3759398... → 50.3759 (ROUND_HALF_UP)
    const result = calculateCspClose({
      openPremiumPerContract: '1.33',
      closePricePerContract: '0.66',
      contracts: 1
    })
    expect(result.finalPnl).toBe('67.0000')
    expect(result.pnlPercentage).toBe('50.3759')
  })
})
