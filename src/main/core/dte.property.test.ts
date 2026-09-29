// Property tests: DTE counts whole calendar days, shifts with the expiration, and
// ignores the time of day.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { addDays, format, parseISO } from 'date-fns'
import { computeDte } from './dte'
import { isoDay } from './test-fixtures/arbitraries'

const DAY_FORMAT = 'yyyy-MM-dd'
const shift = (day: string, days: number): string =>
  format(addDays(parseISO(day), days), DAY_FORMAT)

/** Any instant on the given local calendar day. */
const instantOn = (day: string): fc.Arbitrary<Date> =>
  fc
    .record({ hours: fc.integer({ min: 0, max: 23 }), minutes: fc.integer({ min: 0, max: 59 }) })
    .map(({ hours, minutes }) => {
      const at = parseISO(day)
      at.setHours(hours, minutes)
      return at
    })

describe('computeDte', () => {
  it('is zero on the expiration day itself, at any time of day', () => {
    fc.assert(
      fc.property(
        isoDay.chain((day) => fc.tuple(fc.constant(day), instantOn(day))),
        ([day, now]) => {
          expect(computeDte(day, now)).toBe(0)
        }
      )
    )
  })

  it('moves one-for-one with the expiration date', () => {
    fc.assert(
      fc.property(
        isoDay.chain((day) => fc.tuple(fc.constant(day), instantOn(day))),
        fc.integer({ min: -3000, max: 3000 }),
        ([day, now], days) => {
          expect(computeDte(shift(day, days), now)).toBe(days)
        }
      )
    )
  })

  it('returns an integer or null for any string, never NaN', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), isoDay), isoDay.chain(instantOn), (expiration, now) => {
        const dte = computeDte(expiration, now)
        expect(dte === null || Number.isInteger(dte)).toBe(true)
      })
    )
  })
})
