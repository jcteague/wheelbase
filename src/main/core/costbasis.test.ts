import { describe, expect, it } from 'vitest'
import {
  calculateInitialCspBasis,
  calculateCspClose,
  calculateCspExpiration,
  calculateAssignmentBasis,
  calculateCcOpenBasis
} from './costbasis'
import type { CostBasisResult, CspLegInput, CcOpenBasisInput } from './costbasis'

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

  it('rounds to 4 decimal places ROUND_HALF_UP', () => {
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

describe('calculateCspExpiration', () => {
  it('1 contract at $2.50 → finalPnl $250 and 100% captured', () => {
    const result = calculateCspExpiration({ openPremiumPerContract: '2.50', contracts: 1 })
    expect(result.finalPnl).toBe('250.0000')
    expect(result.pnlPercentage).toBe('100.0000')
  })

  it('3 contracts at $1.35 → finalPnl $405 and 100% captured', () => {
    const result = calculateCspExpiration({ openPremiumPerContract: '1.35', contracts: 3 })
    expect(result.finalPnl).toBe('405.0000')
    expect(result.pnlPercentage).toBe('100.0000')
  })

  it('edge case: $0.005 premium with ROUND_HALF_UP → finalPnl $0.5000', () => {
    // 0.005 * 1 * 100 = 0.5 → 0.5000 (ROUND_HALF_UP)
    const result = calculateCspExpiration({ openPremiumPerContract: '0.005', contracts: 1 })
    expect(result.finalPnl).toBe('0.5000')
    expect(result.pnlPercentage).toBe('100.0000')
  })
})

describe('calculateAssignmentBasis', () => {
  it('calculates basis per share and shares held for a single CSP leg', () => {
    const result = calculateAssignmentBasis({
      strike: '180.00',
      contracts: 1,
      premiumLegs: [{ legRole: 'CSP_OPEN', premiumPerContract: '3.50', contracts: 1 }]
    })

    expect(result.basisPerShare).toBe('176.5000')
    expect(result.sharesHeld).toBe(100)
  })

  it('accounts for CSP premium and roll credit in assignment basis', () => {
    const result = calculateAssignmentBasis({
      strike: '175.00',
      contracts: 1,
      premiumLegs: [
        { legRole: 'CSP_OPEN', premiumPerContract: '2.00', contracts: 1 },
        { legRole: 'ROLL_TO', premiumPerContract: '1.50', contracts: 1 }
      ]
    })

    expect(result.basisPerShare).toBe('171.5000')
    expect(result.sharesHeld).toBe(100)
  })

  it('scales shares held by contract count while keeping basis per share unchanged', () => {
    const result = calculateAssignmentBasis({
      strike: '180.00',
      contracts: 2,
      premiumLegs: [{ legRole: 'CSP_OPEN', premiumPerContract: '3.50', contracts: 2 }]
    })

    expect(result.basisPerShare).toBe('176.5000')
    expect(result.sharesHeld).toBe(200)
  })

  it('builds a premium waterfall with CSP and roll credit labels', () => {
    const result = calculateAssignmentBasis({
      strike: '175.00',
      contracts: 1,
      premiumLegs: [
        { legRole: 'CSP_OPEN', premiumPerContract: '2.00', contracts: 1 },
        { legRole: 'ROLL_TO', premiumPerContract: '1.50', contracts: 1 }
      ]
    })

    expect(result.premiumWaterfall).toEqual([
      { label: 'CSP premium', amount: '2.00' },
      { label: 'Roll credit', amount: '1.50' }
    ])
  })

  it('sums total premium collected across all premium legs', () => {
    const result = calculateAssignmentBasis({
      strike: '175.00',
      contracts: 1,
      premiumLegs: [
        { legRole: 'CSP_OPEN', premiumPerContract: '2.00', contracts: 1 },
        { legRole: 'ROLL_TO', premiumPerContract: '1.50', contracts: 1 }
      ]
    })

    expect(result.totalPremiumCollected).toBe('350.0000')
  })
})

// ---------------------------------------------------------------------------
// calculateCcOpenBasis
// ---------------------------------------------------------------------------

describe('calculateCcOpenBasis', () => {
  function validCcBasisInput(overrides: Partial<CcOpenBasisInput> = {}): CcOpenBasisInput {
    return {
      prevBasisPerShare: '176.5000',
      prevTotalPremiumCollected: '350.0000',
      ccPremiumPerContract: '2.3000',
      contracts: 1,
      positionContracts: 1,
      ...overrides
    }
  }

  it('reduces basis per share by CC premium', () => {
    const result = calculateCcOpenBasis(validCcBasisInput())
    expect(result.basisPerShare).toBe('174.2000')
  })

  it('adds CC premium to total premium collected', () => {
    // prevTotalPremium 350.0000 + 2.30 × 1 × 100 = 350 + 230 = 580
    const result = calculateCcOpenBasis(validCcBasisInput())
    expect(result.totalPremiumCollected).toBe('580.0000')
  })

  it('handles multi-contract CC — per-share basis unchanged when fully covered, total increases by full amount', () => {
    // Selling 2 CC on 2-contract position (fully covered)
    // basisPerShare = 176.5 - 2.3 = 174.2 (same per-share regardless of contracts)
    // totalPremiumCollected = 350 + 2.3 × 2 × 100 = 350 + 460 = 810
    const result = calculateCcOpenBasis(validCcBasisInput({ contracts: 2, positionContracts: 2 }))
    expect(result.basisPerShare).toBe('174.2000')
    expect(result.totalPremiumCollected).toBe('810.0000')
  })

  it('prorates basis reduction for partial coverage', () => {
    // Selling 1 CC on 2-contract position (200 shares)
    // Premium income = 2.30 × 1 × 100 = $230 across 200 shares = $1.15/share
    // basisPerShare = 176.5 - 1.15 = 175.35
    // totalPremiumCollected = 350 + 230 = 580
    const result = calculateCcOpenBasis(
      validCcBasisInput({ contracts: 1, positionContracts: 2 })
    )
    expect(result.basisPerShare).toBe('175.3500')
    expect(result.totalPremiumCollected).toBe('580.0000')
  })

  it('returns 4dp precision for fractional premium', () => {
    const result = calculateCcOpenBasis(
      validCcBasisInput({ ccPremiumPerContract: '1.1111', prevBasisPerShare: '176.5000' })
    )
    // 176.5000 - 1.1111 = 175.3889
    expect(result.basisPerShare).toBe('175.3889')
  })
})
