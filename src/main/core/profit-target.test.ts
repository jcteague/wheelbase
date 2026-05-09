import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFIT_TARGET_PERCENT, resolveProfitTarget } from './profit-target'

describe('DEFAULT_PROFIT_TARGET_PERCENT', () => {
  it('is 50', () => {
    expect(DEFAULT_PROFIT_TARGET_PERCENT).toBe(50)
  })
})

describe('resolveProfitTarget', () => {
  it('returns the override when provided', () => {
    expect(resolveProfitTarget(25)).toBe(25)
  })

  it('returns the default when override is null', () => {
    expect(resolveProfitTarget(null)).toBe(50)
  })

  it('treats 0 as a real override', () => {
    expect(resolveProfitTarget(0)).toBe(0)
  })
})
