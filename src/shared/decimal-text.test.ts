import Decimal from 'decimal.js'
import { describe, it, expect, afterEach } from 'vitest'
import { fixed4, money4 } from './decimal-text'

describe('money4', () => {
  afterEach(() => {
    Decimal.set({ rounding: Decimal.ROUND_HALF_UP })
  })

  it('formats strings, numbers and Decimals as 4-dp text', () => {
    expect(money4('1.5')).toBe('1.5000')
    expect(money4(2)).toBe('2.0000')
    expect(money4(new Decimal('-3.25'))).toBe('-3.2500')
  })

  it('rounds half up regardless of the global Decimal rounding mode', () => {
    Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN })
    expect(money4('0.00005')).toBe('0.0001')
    expect(money4('0.00025')).toBe('0.0003')
    expect(money4('-0.00005')).toBe('-0.0001')
  })

  it('formats a tiny negative that rounds to zero as 0.0000, never -0.0000', () => {
    expect(money4('-0.0000495')).toBe('0.0000')
    expect(money4(new Decimal('-0.00001'))).toBe('0.0000')
  })
})

describe('fixed4', () => {
  afterEach(() => {
    Decimal.set({ rounding: Decimal.ROUND_HALF_UP })
  })

  it('rounds non-money ratios half up to 4 dp', () => {
    Decimal.set({ rounding: Decimal.ROUND_DOWN })
    expect(fixed4('0.123456')).toBe('0.1235')
    expect(fixed4(0.5)).toBe('0.5000')
  })

  it('formats a tiny negative that rounds to zero as 0.0000, never -0.0000', () => {
    expect(fixed4('-0.00001')).toBe('0.0000')
  })
})
