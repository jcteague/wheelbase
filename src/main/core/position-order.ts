// Pure engine — no database or broker imports allowed here.
//
// The positions list's display order: soonest expiration first, undated rows (shares held)
// last. A PMCC carries no position-level DTE, so it is ordered by its short call — the leg
// that needs managing first. `listPositions` sorts its result with it, and the renderer's
// create hooks use the same comparator to slot a freshly recorded position into the cached
// list without refetching the whole query.

export interface PositionOrderInput {
  dte: number | null
  pmcc?: { short: { dte: number } } | null
}

function orderDte(item: PositionOrderInput): number | null {
  return item.pmcc ? item.pmcc.short.dte : item.dte
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
