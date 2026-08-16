// [US-67] Configure screening defaults — shared bounds, messages, and predicates
// for the screening-criteria sheet. Pure module: no DB, no broker, no I/O.

import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import {
  DELTA_INVERTED_MESSAGE,
  DELTA_RANGE_MESSAGE,
  DTE_INVERTED_MESSAGE,
  DTE_MAX_MESSAGE,
  DTE_MIN_MESSAGE,
  IV_RANK_MESSAGE,
  OPEN_INTEREST_MESSAGE,
  PRICE_CEILING_MESSAGE,
  SPREAD_PERCENT_MESSAGE,
  isAscending,
  isDeltaInRange,
  isDteInRange,
  isIvRankFloorInRange,
  isOpenInterestInRange,
  isPriceCeilingInRange,
  isSpreadAbsoluteInRange,
  isSpreadPercentInRange
} from './screening-criteria'

describe('isDeltaInRange', () => {
  it('returns true at the lower bound 0.01', () => {
    expect(isDeltaInRange('0.01')).toBe(true)
  })

  it('returns true at the upper bound 0.99', () => {
    expect(isDeltaInRange('0.99')).toBe(true)
  })

  it('returns false at 0 (below the lower bound)', () => {
    expect(isDeltaInRange('0')).toBe(false)
  })

  it('returns false at 1 (above the upper bound)', () => {
    expect(isDeltaInRange('1')).toBe(false)
  })

  it('returns false at 1.5 (well above the upper bound)', () => {
    expect(isDeltaInRange('1.5')).toBe(false)
  })
})

describe('isDteInRange', () => {
  it('returns true at the lower bound 1', () => {
    expect(isDteInRange(1)).toBe(true)
  })

  it('returns true at the upper bound 365', () => {
    expect(isDteInRange(365)).toBe(true)
  })

  it('returns false at 0 (below the lower bound)', () => {
    expect(isDteInRange(0)).toBe(false)
  })

  it('returns false at 366 (above the upper bound)', () => {
    expect(isDteInRange(366)).toBe(false)
  })

  it('returns false for a non-integer inside the bounds', () => {
    expect(isDteInRange(30.5)).toBe(false)
  })
})

describe('isOpenInterestInRange', () => {
  it('returns true at the lower bound 0', () => {
    expect(isOpenInterestInRange(0)).toBe(true)
  })

  it('returns true for a typical floor of 500', () => {
    expect(isOpenInterestInRange(500)).toBe(true)
  })

  it('returns false for -1', () => {
    expect(isOpenInterestInRange(-1)).toBe(false)
  })

  it('returns false for -100', () => {
    expect(isOpenInterestInRange(-100)).toBe(false)
  })
})

describe('isSpreadPercentInRange', () => {
  it('returns true at the lower bound 1', () => {
    expect(isSpreadPercentInRange('1')).toBe(true)
  })

  it('returns true at the upper bound 50', () => {
    expect(isSpreadPercentInRange('50')).toBe(true)
  })

  it('returns false at 0 (below the lower bound)', () => {
    expect(isSpreadPercentInRange('0')).toBe(false)
  })

  it('returns false at 51 (above the upper bound)', () => {
    expect(isSpreadPercentInRange('51')).toBe(false)
  })
})

describe('isPriceCeilingInRange', () => {
  it('returns true for a positive ceiling', () => {
    expect(isPriceCeilingInRange('75')).toBe(true)
  })

  it('returns false for 0 — the ceiling must be greater than zero', () => {
    expect(isPriceCeilingInRange('0')).toBe(false)
  })

  it('returns false for a negative ceiling', () => {
    expect(isPriceCeilingInRange('-5')).toBe(false)
  })
})

describe('isIvRankFloorInRange', () => {
  it('returns true at the lower bound 0', () => {
    expect(isIvRankFloorInRange('0')).toBe(true)
  })

  it('returns true for a mid-range floor of 30', () => {
    expect(isIvRankFloorInRange('30')).toBe(true)
  })

  it('returns true at the upper bound 100', () => {
    expect(isIvRankFloorInRange('100')).toBe(true)
  })

  it('returns false for -1 (below the lower bound)', () => {
    expect(isIvRankFloorInRange('-1')).toBe(false)
  })

  it('returns false for 101 (above the upper bound)', () => {
    expect(isIvRankFloorInRange('101')).toBe(false)
  })
})

describe('isSpreadAbsoluteInRange', () => {
  it('returns true for the shipped default of 0.10', () => {
    expect(isSpreadAbsoluteInRange('0.10')).toBe(true)
  })

  it('returns true at the lower bound 0', () => {
    expect(isSpreadAbsoluteInRange('0')).toBe(true)
  })

  it('returns false for a negative dollar amount', () => {
    expect(isSpreadAbsoluteInRange('-0.10')).toBe(false)
  })

  it('returns false for a value decimal.js cannot parse', () => {
    expect(isSpreadAbsoluteInRange('wide')).toBe(false)
  })
})

describe('isAscending', () => {
  it('returns true when the minimum is strictly less than the maximum', () => {
    expect(isAscending('0.20', '0.30')).toBe(true)
  })

  it('returns false when the band is inverted', () => {
    expect(isAscending('0.30', '0.20')).toBe(false)
  })

  it('returns false when the band is collapsed (strict comparison)', () => {
    expect(isAscending('0.20', '0.20')).toBe(false)
  })
})

describe('message constants', () => {
  it('DELTA_RANGE_MESSAGE matches the acceptance-criteria string', () => {
    expect(DELTA_RANGE_MESSAGE).toBe('Delta must be between 0.01 and 0.99')
  })

  it('DTE_MIN_MESSAGE matches the acceptance-criteria string', () => {
    expect(DTE_MIN_MESSAGE).toBe('DTE must be at least 1')
  })

  it('DTE_MAX_MESSAGE matches the acceptance-criteria string', () => {
    expect(DTE_MAX_MESSAGE).toBe('DTE must be at most 365')
  })

  it('OPEN_INTEREST_MESSAGE matches the acceptance-criteria string', () => {
    expect(OPEN_INTEREST_MESSAGE).toBe('Open interest floor cannot be negative')
  })

  it('SPREAD_PERCENT_MESSAGE matches the acceptance-criteria string', () => {
    expect(SPREAD_PERCENT_MESSAGE).toBe('Max spread must be between 1% and 50%')
  })

  it('PRICE_CEILING_MESSAGE matches the acceptance-criteria string', () => {
    expect(PRICE_CEILING_MESSAGE).toBe('Price ceiling must be greater than zero')
  })

  it('IV_RANK_MESSAGE matches the acceptance-criteria string', () => {
    expect(IV_RANK_MESSAGE).toBe('IV rank floor must be between 0 and 100')
  })

  it('DELTA_INVERTED_MESSAGE matches the acceptance-criteria string', () => {
    expect(DELTA_INVERTED_MESSAGE).toBe('Minimum delta must be less than maximum delta')
  })

  it('DTE_INVERTED_MESSAGE matches the acceptance-criteria string', () => {
    expect(DTE_INVERTED_MESSAGE).toBe('Minimum DTE must be less than maximum DTE')
  })
})

describe('non-numeric input', () => {
  // The renderer calls these predicates on every keystroke, so a half-typed or
  // empty field must return false rather than throw.
  const predicates: ReadonlyArray<[string, (value: string) => boolean]> = [
    ['isDeltaInRange', isDeltaInRange],
    ['isDteInRange', isDteInRange],
    ['isOpenInterestInRange', isOpenInterestInRange],
    ['isSpreadPercentInRange', isSpreadPercentInRange],
    ['isPriceCeilingInRange', isPriceCeilingInRange],
    ['isIvRankFloorInRange', isIvRankFloorInRange],
    ['isSpreadAbsoluteInRange', isSpreadAbsoluteInRange]
  ]

  it.each(predicates)('%s returns false for a non-numeric string', (_name, predicate) => {
    expect(predicate('abc')).toBe(false)
  })

  it.each(predicates)('%s returns false for an empty string', (_name, predicate) => {
    expect(predicate('')).toBe(false)
  })
})

describe('decimal.js parse safety', () => {
  // The invariant every consumer relies on: if a predicate says yes, the value is
  // handed straight to `new Decimal(...)` by the engine and by the criteria-strip
  // formatters, and decimal.js is stricter than `Number` — it throws on padded
  // strings. A predicate must never green-light a value decimal.js would reject.
  const predicates: ReadonlyArray<[string, (value: string) => boolean]> = [
    ['isDeltaInRange', isDeltaInRange],
    ['isDteInRange', isDteInRange],
    ['isOpenInterestInRange', isOpenInterestInRange],
    ['isSpreadPercentInRange', isSpreadPercentInRange],
    ['isPriceCeilingInRange', isPriceCeilingInRange],
    ['isIvRankFloorInRange', isIvRankFloorInRange],
    ['isSpreadAbsoluteInRange', isSpreadAbsoluteInRange]
  ]

  // Values `Number()` happily coerces but `new Decimal()` throws on.
  const paddedValues = [' 0.20', '0.20 ', ' 0.20 ', '\t30', '30\n']

  it.each(predicates)('%s returns false for a leading-space value', (_name, predicate) => {
    expect(predicate(' 0.20')).toBe(false)
  })

  it.each(predicates)('%s returns false for a trailing-space value', (_name, predicate) => {
    expect(predicate('0.20 ')).toBe(false)
  })

  it.each(predicates)('%s returns false for a whitespace-surrounded value', (_name, predicate) => {
    expect(predicate(' 0.20 ')).toBe(false)
  })

  it.each(predicates)(
    '%s returns false for every padded form decimal.js rejects',
    (_n, predicate) =>
      paddedValues.forEach((value) => {
        expect(() => new Decimal(value)).toThrow()
        expect(predicate(value)).toBe(false)
      })
  )

  it('isAscending rejects a whitespace-padded maximum', () => {
    expect(isAscending('0.20', '0.30 ')).toBe(false)
  })

  it('isAscending rejects a whitespace-padded minimum', () => {
    expect(isAscending(' 0.20', '0.30')).toBe(false)
  })

  it.each(predicates)('%s only accepts strings decimal.js can construct', (_name, predicate) =>
    [' 0.20', '0.20 ', '1e2', '0x10', '+5', '.5.', 'Infinity', '1_000', '30 ', '  ', '5,0'].forEach(
      (value) => {
        if (!predicate(value)) return
        expect(() => new Decimal(value)).not.toThrow()
      }
    )
  )

  // All digits, so it clears DECIMAL_STRING, but it overflows `Number` to Infinity.
  // decimal.js would carry it fine — rejecting is the fail-closed choice, since no
  // bound this module guards could sensibly admit it.
  it.each(predicates)('%s returns false for a digit string that overflows', (_n, predicate) => {
    expect(predicate('9'.repeat(400))).toBe(false)
  })

  // The number arm: the service passes DTE and open interest as numbers, so a
  // non-finite one must fall through to false rather than compare its way past a bound.
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'the numeric predicates return false for %p',
    (value) => {
      expect(isDteInRange(value)).toBe(false)
      expect(isOpenInterestInRange(value)).toBe(false)
    }
  )
})
