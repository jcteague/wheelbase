// Builds the wheel positions-list row for a position the renderer has just recorded, from the
// create handler's response, so the create hook can insert it into the cached list instead
// of refetching every row. The shape mirrors `toWheelItem` in
// `src/main/services/list-positions.ts`; the next list fetch replaces the row anyway. A new
// PMCC needs no copy here: its create response carries the list's own row (`listItem`).
import { computeDte } from '../../../main/core/dte'
import { sortPositionsByDte } from '../../../main/core/position-order'
import { isOptionInstrument } from '../../../main/core/types'
import type { CreatePositionResponse, PositionListItem, WheelListItem } from '../api/positions'

export function toWheelListItem(res: CreatePositionResponse, now = new Date()): WheelListItem {
  const { position, leg, costBasisSnapshot: snapshot } = res
  return {
    id: position.id,
    ticker: position.ticker,
    phase: position.phase,
    status: position.status,
    premiumCollected: snapshot.totalPremiumCollected,
    effectiveCostBasis: snapshot.basisPerShare,
    profitTargetPercent: null,
    strategyType: 'WHEEL',
    pmcc: null,
    strike: leg.strike,
    expiration: leg.expiration,
    dte: computeDte(leg.expiration, now),
    instrumentType: isOptionInstrument(leg.instrumentType) ? leg.instrumentType : null,
    contracts: leg.contracts,
    entryPremiumPerContract: leg.premiumPerContract,
    nextEarnings: null
  }
}

/** The cached list with `item` slotted in, in the same order `positions:list` would return. */
export function insertPositionListItem(
  items: readonly PositionListItem[],
  item: PositionListItem
): PositionListItem[] {
  return sortPositionsByDte([...items, item])
}
