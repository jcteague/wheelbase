import { describe, expect, it } from 'vitest'
import { toFiniteDecimal } from './finite-decimal'

describe('toFiniteDecimal', () => {
  it.each([
    { value: '180.0000', expected: '180.0000' },
    { value: '-0.0001', expected: '-0.0001' },
    { value: '0.54', expected: '0.5400' },
    { value: '0', expected: '0.0000' }
  ])('$value parses to $expected', ({ value, expected }) => {
    expect(toFiniteDecimal(value)?.toFixed(4)).toBe(expected)
  })

  it.each([null, '', 'n/a', 'Infinity', '-Infinity', 'NaN'])('%s is null', (value) => {
    expect(toFiniteDecimal(value)).toBeNull()
  })
})
