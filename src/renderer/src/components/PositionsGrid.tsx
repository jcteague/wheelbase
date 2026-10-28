import type {
  MarketStatus,
  OptionSnapshot,
  OptionSnapshotsBySymbol,
  StockQuotesByTicker
} from '../api/market-data'
import type { PositionListItem, WheelListItem } from '../api/positions'
import { occSymbolForLeg } from '../../../shared/option-symbol'
import type { CardAction } from '../lib/card-actions'
import { PmccCard } from './position-card/PmccCard'
import { WheelCard } from './position-card/WheelCard'

export type PositionsGridProps = {
  items: PositionListItem[]
  isClosed?: boolean
  quotes?: StockQuotesByTicker
  session?: MarketStatus['session']
  snapshots?: OptionSnapshotsBySymbol
  pendingPositionIds?: ReadonlySet<string>
  profitTargetDefault?: number
  /** Each wheel position's open queue rows as card actions; a position with none is absent. */
  actionsByPosition?: ReadonlyMap<string, CardAction[]>
}

function snapshotForItem(
  item: WheelListItem,
  snapshots: OptionSnapshotsBySymbol | undefined
): OptionSnapshot | undefined {
  const symbol = occSymbolForLeg(item)
  return symbol === null ? undefined : snapshots?.[symbol]
}

/** The positions list's card grid: a wheel card or a PMCC card per item, in input order. */
export function PositionsGrid({
  items,
  isClosed,
  quotes = {},
  session,
  snapshots,
  pendingPositionIds,
  profitTargetDefault,
  actionsByPosition
}: PositionsGridProps): React.JSX.Element {
  return (
    <div
      className={`grid grid-cols-[repeat(auto-fill,minmax(min(400px,100%),1fr))] gap-3 px-[24px]${isClosed ? ' pb-[24px]' : ''}`}
    >
      {items.map((item) =>
        item.strategyType === 'PMCC' ? (
          <PmccCard
            key={item.id}
            item={item}
            quote={quotes[item.ticker]}
            session={session}
            isClosed={isClosed}
          />
        ) : (
          <WheelCard
            key={item.id}
            item={item}
            actions={actionsByPosition?.get(item.id) ?? []}
            isClosed={isClosed}
            quote={quotes[item.ticker]}
            session={session}
            snapshot={isClosed ? undefined : snapshotForItem(item, snapshots)}
            hasPendingAssignment={pendingPositionIds?.has(item.id) ?? false}
            profitTargetDefault={profitTargetDefault}
          />
        )
      )}
    </div>
  )
}
