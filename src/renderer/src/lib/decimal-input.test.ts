// [US-68] The money-parsing boundary for live form input. `new Decimal` throws on
// `''` and silently reads `'2.'` as `2`, so neither is safe to point at a value the
// trader is still typing — these helpers are what keeps a mid-keystroke premium from
// registering as a decided price.
import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { parseInputDecimal, parsePositiveInputDecimal } from './decimal-input'

describe('parseInputDecimal', () => {
  it.each([
    ['2.70', '2.7'],
    ['180', '180'],
    ['0', '0'],
    ['-2.65', '-2.65'],
    ['0.05', '0.05']
  ])('reads %s as a decimal', (input, expected) => {
    expect(parseInputDecimal(input)?.toString()).toBe(expected)
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseInputDecimal('  2.65  ')?.equals(new Decimal('2.65'))).toBe(true)
  })

  it.each(['', '   '])('has no value for an empty field (%s)', (input) => {
    expect(parseInputDecimal(input)).toBeNull()
  })

  it.each(['2.', '-', '.', '.5'])('has no value while the field is mid-edit (%s)', (input) => {
    expect(parseInputDecimal(input)).toBeNull()
  })

  it.each(['abc', '2.7.0', '1e3', 'Infinity', '$2.70', '2,700'])(
    'has no value for a non-number (%s)',
    (input) => {
      expect(parseInputDecimal(input)).toBeNull()
    }
  )
})

describe('parsePositiveInputDecimal', () => {
  it('reads a usable price', () => {
    expect(parsePositiveInputDecimal('2.70')?.toString()).toBe('2.7')
  })

  it.each(['0', '0.00', '-0.05', '-180'])(
    'has no value for %s — neither a price nor a count',
    (input) => {
      expect(parsePositiveInputDecimal(input)).toBeNull()
    }
  )

  it('has no value for anything parseInputDecimal rejects', () => {
    expect(parsePositiveInputDecimal('')).toBeNull()
    expect(parsePositiveInputDecimal('2.')).toBeNull()
    expect(parsePositiveInputDecimal('abc')).toBeNull()
  })
})
