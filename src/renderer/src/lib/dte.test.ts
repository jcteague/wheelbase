import { describe, expect, it } from 'vitest'
import { DTE_URGENT_THRESHOLD, isDteUrgent } from './dte'

describe('isDteUrgent', () => {
  it('is true at and below the urgent threshold', () => {
    expect(isDteUrgent(0)).toBe(true)
    expect(isDteUrgent(DTE_URGENT_THRESHOLD)).toBe(true)
  })

  it('is false above the urgent threshold', () => {
    expect(isDteUrgent(DTE_URGENT_THRESHOLD + 1)).toBe(false)
    expect(isDteUrgent(8)).toBe(false)
  })

  it('is false when dte is null', () => {
    expect(isDteUrgent(null)).toBe(false)
  })
})
