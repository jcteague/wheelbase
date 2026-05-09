import { describe, it, expect } from 'vitest'
import {
  formatPnlPercentForDisplay,
  isWideSpread,
  hasNoBid,
  formatTargetTooltip
} from './option-display'

describe('formatPnlPercentForDisplay', () => {
  it('rounds to one decimal place', () => {
    expect(formatPnlPercentForDisplay('62.8571')).toBe('62.9')
  })

  it('strips trailing zeros where natural', () => {
    expect(formatPnlPercentForDisplay('50.0000')).toBe('50')
  })
})

describe('isWideSpread', () => {
  it('returns true when (ask - bid) / mid > 0.10', () => {
    expect(isWideSpread({ bid: '0.50', ask: '1.50', mid: '1.00' })).toBe(true)
  })

  it('returns false when spread <= 10% of mid', () => {
    expect(isWideSpread({ bid: '1.25', ask: '1.35', mid: '1.30' })).toBe(false)
  })

  it('returns false when mid is 0', () => {
    expect(isWideSpread({ bid: '0', ask: '0', mid: '0' })).toBe(false)
  })
})

describe('hasNoBid', () => {
  it.each([['0'], ['0.00'], ['0.0000']])('returns true for %s', (bid) => {
    expect(hasNoBid({ bid })).toBe(true)
  })

  it('returns false for 0.05', () => {
    expect(hasNoBid({ bid: '0.05' })).toBe(false)
  })
})

describe('formatTargetTooltip', () => {
  it('composes tooltip text exactly', () => {
    expect(
      formatTargetTooltip({
        pnlPercent: '62.8571',
        maxProfit: '350.0000',
        targetPercent: 50
      })
    ).toBe('62.9% of max profit ($350) — target is 50%')
  })
})
