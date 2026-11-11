import type { PositionListItem } from '../api/positions'
import type { OccLegInput } from '../../../shared/option-symbol'

function legsForItem(item: PositionListItem): OccLegInput[] {
  if (item.strategyType === 'PMCC') {
    return item.pmcc.legs.map(({ expiration, strike }) => ({
      ticker: item.ticker,
      expiration,
      strike,
      instrumentType: 'CALL'
    }))
  }
  const { ticker, expiration, strike, instrumentType } = item
  return [{ ticker, expiration, strike, instrumentType }]
}

/** The option legs to quote for the list: a wheel's current leg, or every PMCC leg as a CALL. */
export function legsForSnapshots(items: readonly PositionListItem[]): OccLegInput[] {
  return items.flatMap(legsForItem)
}
