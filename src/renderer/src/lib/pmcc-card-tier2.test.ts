// [US-108] The PMCC card's signed money: `+` on a gain, the app's U+2212 `−` on a loss.
import { describe, expect, it } from 'vitest'
import { signedMoneyGrouped } from './pmcc-card-tier2'

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
