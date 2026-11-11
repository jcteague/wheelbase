// Pure engine — no database or broker imports allowed here.
//
// The positions list's display order: soonest expiration first, undated rows (shares held)
// last. A PMCC carries no position-level DTE, so it is ordered by its next decision: its
// nearest short call — the leg that needs managing first — or its LEAPS while no short call
// is open. `listPositions` sorts its result with it, and the renderer's create hooks use the
// same comparator to slot a freshly recorded position into the cached list without
// refetching the whole query.

export interface PmccOrderLeg {
  side: 'LONG' | 'SHORT'
  dte: number
}

/** A PMCC always holds its LEAPS, so its legs are never empty. */
export type PmccOrderLegs = readonly [PmccOrderLeg, ...PmccOrderLeg[]]

export interface PositionOrderInput {
  dte: number | null
  pmcc?: { legs: PmccOrderLegs } | null
}

/** The DTE of a PMCC's next decision: its nearest short call, else its LEAPS. */
export function pmccNextDecisionDte(legs: PmccOrderLegs): number {
  const shorts = legs.filter((leg) => leg.side === 'SHORT')
  return Math.min(...(shorts.length > 0 ? shorts : legs).map((leg) => leg.dte))
}

function orderDte(item: PositionOrderInput): number | null {
  return item.pmcc ? pmccNextDecisionDte(item.pmcc.legs) : item.dte
}

function compareByDte(a: PositionOrderInput, b: PositionOrderInput): number {
  const [left, right] = [orderDte(a), orderDte(b)]
  if ((left === null) !== (right === null)) return left === null ? 1 : -1
  return (left ?? 0) - (right ?? 0)
}

/** A new array in list order; the input is never mutated. Stable for equal DTEs. */
export function sortPositionsByDte<T extends PositionOrderInput>(items: readonly T[]): T[] {
  return [...items].sort(compareByDte)
}
