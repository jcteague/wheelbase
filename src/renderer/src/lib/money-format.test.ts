// [US-108] Signed money: `+` on a gain, the app's U+2212 `−` on a loss. [US-109] Unsigned money
// that still reads a negative with the U+2212 `−`.
import { describe, expect, it } from 'vitest'
import { minusMoneyGrouped, signedMoneyGrouped } from './money-format'

describe('signedMoneyGrouped', () => {
  it.each([
    ['1215.0000', '+$1,215.00'],
    ['0.0000', '+$0.00'],
    ['-500.0000', '−$500.00'],
    ['-0.0100', '−$0.01'],
    ['-2120.0000', '−$2,120.00']
  ])('%s reads %s', (value, expected) => {
    expect(signedMoneyGrouped(value)).toBe(expected)
  })
})

describe('minusMoneyGrouped', () => {
  it.each([
    ['1215.0000', '$1,215.00'],
    ['0.0000', '$0.00'],
    ['-0.6100', '−$0.61'],
    ['-0.0049', '−$0.00'],
    ['-2120.0000', '−$2,120.00']
  ])('%s reads %s', (value, expected) => {
    expect(minusMoneyGrouped(value)).toBe(expected)
  })
})
