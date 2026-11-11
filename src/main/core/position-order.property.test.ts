import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  pmccNextDecisionDte,
  sortPositionsByDte,
  type PmccOrderLeg,
  type PmccOrderLegs
} from './position-order'

const dteValue = fc.integer({ min: -30, max: 1200 })

// A PMCC holds at least one LEAPS and any number of short calls, in no particular order.
const pmccLegs: fc.Arbitrary<PmccOrderLegs> = fc
  .tuple(fc.array(dteValue, { minLength: 1, maxLength: 2 }), fc.array(dteValue, { maxLength: 3 }))
  .chain(([longDtes, shortDtes]) => {
    const legs: PmccOrderLeg[] = [
      ...longDtes.map((dte): PmccOrderLeg => ({ side: 'LONG', dte })),
      ...shortDtes.map((dte): PmccOrderLeg => ({ side: 'SHORT', dte }))
    ]
    // At least one LEAPS above, so the shuffle always has a head.
    return fc
      .shuffledSubarray(legs, { minLength: legs.length, maxLength: legs.length })
      .map(([head, ...tail]): PmccOrderLegs => [head, ...tail])
  })

// A wheel row carries its own DTE (null once shares are held); a PMCC row carries none and
// is ordered by its legs.
const item = fc.oneof(
  fc.record({ id: fc.uuid(), dte: fc.option(dteValue, { nil: null }), pmcc: fc.constant(null) }),
  fc.record({ id: fc.uuid(), dte: fc.constant(null), pmcc: fc.record({ legs: pmccLegs }) })
)

type Item = { dte: number | null; pmcc: { legs: PmccOrderLegs } | null }

const dtesOf = (legs: readonly PmccOrderLeg[], side: PmccOrderLeg['side']): number[] =>
  legs.filter((l) => l.side === side).map((l) => l.dte)

// Independent statement of the order key, written from the list's documented rule: the
// nearest short call, or the nearest LEAPS while no short call is open.
function nextDecisionOracle(legs: readonly PmccOrderLeg[]): number {
  const shorts = dtesOf(legs, 'SHORT')
  return Math.min(...(shorts.length > 0 ? shorts : dtesOf(legs, 'LONG')))
}

const orderDte = (i: Item): number | null =>
  i.pmcc === null ? i.dte : nextDecisionOracle(i.pmcc.legs)

describe('pmccNextDecisionDte — properties', () => {
  it('is the smallest short call DTE when any short is open, else the smallest LEAPS DTE', () => {
    fc.assert(
      fc.property(pmccLegs, (legs) => {
        expect(pmccNextDecisionDte(legs)).toBe(nextDecisionOracle(legs))
      })
    )
  })
})

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
