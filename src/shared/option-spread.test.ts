import { describe, it, expect } from 'vitest'
import { hasNoBid, isWideSpread, spreadPercentOfMid } from './option-spread'

describe('isWideSpread', () => {
  it('is false when the spread is exactly 10% of the mid', () => {
    expect(isWideSpread({ bid: '0.95', ask: '1.05', mid: '1.00' })).toBe(false)
  })

  it('is true when the spread is 10.01% of the mid', () => {
    expect(isWideSpread({ bid: '0.9499', ask: '1.0500', mid: '1.00' })).toBe(true)
  })

  it('is false when the spread is 9.99% of the mid', () => {
    expect(isWideSpread({ bid: '0.9501', ask: '1.0500', mid: '1.00' })).toBe(false)
  })

  it('is false when the mid is 0, even with a non-zero spread', () => {
    expect(isWideSpread({ bid: '0', ask: '0.10', mid: '0' })).toBe(false)
  })
})

describe('spreadPercentOfMid', () => {
  it('is (ask − bid) / mid × 100, unrounded', () => {
    expect(spreadPercentOfMid({ bid: '24.6000', ask: '27.6000', mid: '26.1000' })?.toFixed(6)).toBe(
      '11.494253'
    )
  })

  it('is 0 for a locked market', () => {
    expect(spreadPercentOfMid({ bid: '1.00', ask: '1.00', mid: '1.00' })?.toFixed(4)).toBe('0.0000')
  })

  it.each(['0', '-0.0100'])('is null for a mid of %s', (mid) => {
    expect(spreadPercentOfMid({ bid: '0', ask: '0.10', mid })).toBeNull()
  })

  it('is defined for the smallest positive mid', () => {
    expect(spreadPercentOfMid({ bid: '0', ask: '0.0001', mid: '0.0001' })?.toFixed(4)).toBe(
      '100.0000'
    )
  })
})

describe('hasNoBid', () => {
  it.each(['0', '0.00', '0.0000'])('is true for a bid of %s', (bid) => {
    expect(hasNoBid({ bid })).toBe(true)
  })

  it('is false for the smallest 4-dp bid, 0.0001', () => {
    expect(hasNoBid({ bid: '0.0001' })).toBe(false)
  })
})
