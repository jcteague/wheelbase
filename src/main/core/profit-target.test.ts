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

  it('returns the explicit default when override is null and a default is passed (US-57)', () => {
    expect(resolveProfitTarget(null, 40)).toBe(40)
  })

  it('still prefers the per-position override over a passed-in default (US-58)', () => {
    expect(resolveProfitTarget(25, 40)).toBe(25)
  })

  it('falls back to the hardcoded 50 when no default argument is passed (backward compatibility)', () => {
    expect(resolveProfitTarget(null)).toBe(50)
  })
})
