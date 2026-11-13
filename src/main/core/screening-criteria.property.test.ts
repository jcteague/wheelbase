// [US-110] Property tests: the PMCC criteria predicates admit exactly their
// documented bounds. Oracles use literal bounds, not the exported constants, so a
// drifted constant fails here rather than moving the oracle with it.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  isDebitToWidthInRange,
  isIvRankCeilingInRange,
  isIvRankFloorInRange,
  isLongDteInRange
} from './screening-criteria'

/** A 2-dp decimal string between `minHundredths` and `maxHundredths` hundredths. */
function twoDpString(minHundredths: number, maxHundredths: number): fc.Arbitrary<string> {
  return fc.integer({ min: minHundredths, max: maxHundredths }).map((n) => (n / 100).toFixed(2))
}

describe('isLongDteInRange', () => {
  it('accepts an integer exactly when it is within 1..730', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 1000 }), (n) => {
        expect(isLongDteInRange(n)).toBe(n >= 1 && n <= 730)
      })
    )
  })
})

describe('isDebitToWidthInRange', () => {
  it('accepts a 2-dp percent exactly when it is within 1..100', () => {
    fc.assert(
      fc.property(twoDpString(0, 15_000), (s) => {
        const percent = Number(s)
        expect(isDebitToWidthInRange(s)).toBe(percent >= 1 && percent <= 100)
      })
    )
  })
})

describe('isIvRankCeilingInRange', () => {
  it('agrees with isIvRankFloorInRange on every input — one domain, two names', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          twoDpString(-5_000, 15_000),
          fc.integer({ min: -50, max: 150 }).map(String),
          fc.string()
        ),
        (s) => {
          expect(isIvRankCeilingInRange(s)).toBe(isIvRankFloorInRange(s))
        }
      )
    )
  })
})
