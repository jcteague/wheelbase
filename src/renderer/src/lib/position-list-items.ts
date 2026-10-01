// Builds the positions-list row for a position the renderer has just recorded, from the
// create handler's response, so the create hooks can insert it into the cached list instead
// of refetching every row. The shapes mirror `toWheelItem` / `toPmccItem` in
// `src/main/services/list-positions.ts`; the next list fetch replaces these rows anyway.
import { computeDte } from '../../../main/core/dte'
import { sortPositionsByDte } from '../../../main/core/position-order'
import { isOptionInstrument } from '../../../main/core/types'
import type {
  CreatePmccPositionResponse,
  CreatePositionResponse,
  PmccLegSummary,
  PmccListItem,
  PositionListItem,
  WheelListItem
} from '../api/positions'

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
    entryPremiumPerContract: leg.premiumPerContract
  }
}

function legSummary(
  leg: CreatePmccPositionResponse['longLeg'] | CreatePmccPositionResponse['shortLeg'],
  now: Date
): PmccLegSummary | null {
  const dte = computeDte(leg.expiration, now)
  if (dte === null) return null
  return { strike: leg.strike, expiration: leg.expiration, dte, contracts: leg.contracts }
}

/** `null` when a leg's expiration yields no DTE — the list omits such a position as well. */
export function toPmccListItem(
  res: CreatePmccPositionResponse,
  now = new Date()
): PmccListItem | null {
  const long = legSummary(res.longLeg, now)
  const short = legSummary(res.shortLeg, now)
  if (!long || !short) return null
  const { position, costBasisSnapshot: snapshot } = res
  return {
    id: position.id,
    ticker: position.ticker,
    phase: position.phase,
    status: position.status,
    premiumCollected: snapshot.totalPremiumCollected,
    effectiveCostBasis: snapshot.basisPerShare,
    profitTargetPercent: position.profitTargetPercent,
    strategyType: 'PMCC',
    pmcc: { long, short, initialNetDebit: res.openingDebit.initialNetDebit },
    strike: null,
    expiration: null,
    dte: null,
    instrumentType: null,
    contracts: null,
    entryPremiumPerContract: null
  }
}

/** The cached list with `item` slotted in, in the same order `positions:list` would return. */
export function insertPositionListItem(
  items: readonly PositionListItem[],
  item: PositionListItem
): PositionListItem[] {
  return sortPositionsByDte([...items, item])
}
