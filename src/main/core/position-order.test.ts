import { describe, expect, it } from 'vitest'
import { sortPositionsByDte } from './position-order'

describe('sortPositionsByDte', () => {
  it('orders by DTE ascending with null DTE last', () => {
    const items = [
      { id: 'c', dte: null },
      { id: 'a', dte: 40 },
      { id: 'b', dte: 5 },
      { id: 'd', dte: null }
    ]

    expect(sortPositionsByDte(items).map((i) => i.id)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('returns a new array and leaves the input untouched', () => {
    const items = [
      { id: 'a', dte: 40 },
      { id: 'b', dte: 5 }
    ]

    const sorted = sortPositionsByDte(items)

    expect(sorted).not.toBe(items)
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('orders a PMCC by its short call DTE, among the dated wheel rows', () => {
    const pmcc = (
      id: string,
      shortDte: number
    ): {
      id: string
      dte: null
      pmcc: { long: { dte: number }; short: { dte: number } }
    } => ({
      id,
      dte: null,
      pmcc: { long: { dte: 400 }, short: { dte: shortDte } }
    })
    const items = [
      { id: 'shares', dte: null, pmcc: null },
      { id: 'csp-40', dte: 40, pmcc: null },
      pmcc('pmcc-21', 21),
      { id: 'csp-5', dte: 5, pmcc: null }
    ]

    expect(sortPositionsByDte(items).map((i) => i.id)).toEqual([
      'csp-5',
      'pmcc-21',
      'csp-40',
      'shares'
    ])
  })

  it('orders a PMCC with no open short call by its LEAPS DTE', () => {
    const items = [
      { id: 'csp-40', dte: 40, pmcc: null },
      { id: 'pmcc-leaps-30', dte: null, pmcc: { long: { dte: 30 }, short: null } },
      { id: 'shares', dte: null, pmcc: null }
    ]

    expect(sortPositionsByDte(items).map((i) => i.id)).toEqual([
      'pmcc-leaps-30',
      'csp-40',
      'shares'
    ])
  })

  it('keeps the relative order of equal DTEs (stable)', () => {
    const items = [
      { id: 'a', dte: 7 },
      { id: 'b', dte: 7 },
      { id: 'c', dte: 7 }
    ]

    expect(sortPositionsByDte(items).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})
