import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { sortPositionsByDte } from './position-order'

const dteValue = fc.integer({ min: -30, max: 1200 })

// A wheel row carries its own DTE (null once shares are held); a PMCC row carries none and
// is ordered by its short call's DTE.
const item = fc.oneof(
  fc.record({ id: fc.uuid(), dte: fc.option(dteValue, { nil: null }), pmcc: fc.constant(null) }),
  fc.record({
    id: fc.uuid(),
    dte: fc.constant(null),
    pmcc: fc.record({ short: fc.record({ dte: dteValue }) })
  })
)

type Item = { dte: number | null; pmcc: { short: { dte: number } } | null }

// Independent statement of the order key, written from the list's documented rule.
function orderDte(i: Item): number | null {
  return i.pmcc !== null ? i.pmcc.short.dte : i.dte
}

describe('sortPositionsByDte — properties', () => {
  it('is a permutation of its input', () => {
    fc.assert(
      fc.property(fc.array(item), (items) => {
        const sorted = sortPositionsByDte(items)
        expect(sorted).toHaveLength(items.length)
        expect([...sorted].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
          [...items].sort((a, b) => a.id.localeCompare(b.id))
        )
      })
    )
  })

  it('places every undated row after every dated one, and dated rows non-decreasing', () => {
    fc.assert(
      fc.property(fc.array(item), (items) => {
        const keys = sortPositionsByDte(items).map(orderDte)
        const firstNull = keys.indexOf(null)
        const dated = firstNull === -1 ? keys : keys.slice(0, firstNull)
        expect(keys.slice(dated.length).every((k) => k === null)).toBe(true)
        dated.forEach((cur, idx) => {
          if (idx === 0) return
          expect(cur!).toBeGreaterThanOrEqual(dated[idx - 1]!)
        })
      })
    )
  })

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.array(item), (items) => {
        const once = sortPositionsByDte(items)
        expect(sortPositionsByDte(once)).toEqual(once)
      })
    )
  })
})
