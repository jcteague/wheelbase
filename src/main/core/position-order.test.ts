import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  pmccNextDecisionDte,
  sortPositionsByDte,
  type PmccOrderLeg,
  type PmccOrderLegs,
  type PositionOrderInput
} from './position-order'

describe('pmccNextDecisionDte', () => {
  it('takes a non-empty legs tuple, so a PMCC with no legs is a type error', () => {
    expectTypeOf<[]>().not.toExtend<Parameters<typeof pmccNextDecisionDte>[0]>()
    expectTypeOf<[PmccOrderLeg]>().toExtend<Parameters<typeof pmccNextDecisionDte>[0]>()
  })

  it('is the short call DTE while a short call is open', () => {
    const legs: PmccOrderLegs = [
      { side: 'LONG', dte: 315 },
      { side: 'SHORT', dte: 14 }
    ]

    expect(pmccNextDecisionDte(legs)).toBe(14)
  })

  it('is the LEAPS DTE while no short call is open', () => {
    expect(pmccNextDecisionDte([{ side: 'LONG', dte: 333 }])).toBe(333)
  })

  it.each([
    ['nearer short first', [14, 42]],
    ['nearer short last', [42, 14]]
  ])('is the nearest of two short calls (%s)', (_order, shortDtes) => {
    const legs: PmccOrderLegs = [
      { side: 'LONG', dte: 315 },
      ...shortDtes.map((dte): PmccOrderLeg => ({ side: 'SHORT', dte }))
    ]

    expect(pmccNextDecisionDte(legs)).toBe(14)
  })

  it('takes the short call over a LEAPS that expires sooner', () => {
    const legs: PmccOrderLegs = [
      { side: 'LONG', dte: 10 },
      { side: 'SHORT', dte: 14 }
    ]

    expect(pmccNextDecisionDte(legs)).toBe(14)
  })
})

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

  it('orders a PMCC by its nearest short call, among the dated wheel rows', () => {
    const items = [
      { id: 'AAPL', dte: 30, pmcc: null },
      {
        id: 'XYZ',
        dte: null,
        pmcc: {
          legs: [
            { side: 'LONG', dte: 315 },
            { side: 'SHORT', dte: 14 }
          ]
        }
      },
      { id: 'MSFT', dte: 10, pmcc: null }
    ] satisfies (PositionOrderInput & { id: string })[]

    expect(sortPositionsByDte(items).map((i) => i.id)).toEqual(['MSFT', 'XYZ', 'AAPL'])
  })

  it('orders a PMCC with only its LEAPS open by the LEAPS DTE, ahead of held shares', () => {
    const items = [
      { id: 'SHARES', dte: null, pmcc: null },
      { id: 'XYZ', dte: null, pmcc: { legs: [{ side: 'LONG', dte: 333 }] } },
      { id: 'AAPL', dte: 30, pmcc: null },
      { id: 'MSFT', dte: 10, pmcc: null }
    ] satisfies (PositionOrderInput & { id: string })[]

    expect(sortPositionsByDte(items).map((i) => i.id)).toEqual(['MSFT', 'AAPL', 'XYZ', 'SHARES'])
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
