import { useMemo } from 'react'
import type { PositionListItem } from '../api/positions'
import type {
  OptionSnapshot,
  OptionSnapshotsBySymbol,
  StockQuote,
  StockQuotesByTicker
} from '../api/market-data'
import { buildOccSymbol } from '../../../shared/option-symbol'
import { PositionRow } from '../components/PositionCard'
import { MarketStatusPill, type MarketStatusDisplay } from '../components/MarketStatusPill'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { StaleDataBanner } from '../components/StaleDataBanner'
import { Badge } from '../components/ui/Badge'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { TableHeader } from '../components/ui/TablePrimitives'
import { useMarketStatus } from '../hooks/useMarketStatus'
import { useOptionSnapshots, type ActiveLegSummary } from '../hooks/useOptionSnapshots'
import { usePositions } from '../hooks/usePositions'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { deriveMarketStatusDisplay } from '../lib/market-status'
import { AssignmentNotificationBanner } from '../components/AssignmentNotificationBanner'
import { usePendingAssignments } from '../api/assignments'

const TABLE_COLUMNS = [
  'Ticker',
  'Phase',
  'Price',
  'Opt Mid',
  'P&L',
  'Strike',
  'Expiration',
  'DTE',
  'Premium',
  'Cost Basis'
]

type PositionsHeaderProps = {
  count?: number
  marketStatusDisplay: MarketStatusDisplay
}

function PositionsHeader({ count, marketStatusDisplay }: PositionsHeaderProps): React.JSX.Element {
  return (
    <PageHeader
      left={
        <div className="flex items-center gap-[10px]">
          <h1 className="text-sm font-semibold text-wb-text-primary m-0">Active Positions</h1>
          {count != null && count > 0 && <Badge>{count}</Badge>}
        </div>
      }
      right={
        <div className="flex items-center gap-[10px]">
          <MarketStatusPill state={marketStatusDisplay} />
          <a
            href="#/new"
            className="wb-hover-opacity flex items-center gap-[6px] px-[14px] py-[5px] rounded-md text-xs font-medium text-wb-bg-base bg-wb-gold no-underline tracking-[0.02em]"
          >
            + New Wheel
          </a>
        </div>
      }
    />
  )
}

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="px-[24px] pt-[16px] pb-[8px] text-xs font-medium tracking-[0.08em] uppercase text-wb-text-muted font-wb-mono">
      {title}
    </div>
  )
}

function snapshotForItem(
  item: PositionListItem,
  snapshots: OptionSnapshotsBySymbol | undefined
): OptionSnapshot | undefined {
  if (!snapshots) return undefined
  if (item.instrumentType !== 'PUT' && item.instrumentType !== 'CALL') return undefined
  if (!item.expiration || !item.strike) return undefined
  try {
    const symbol = buildOccSymbol({
      ticker: item.ticker,
      expiration: item.expiration,
      strike: item.strike,
      instrumentType: item.instrumentType
    })
    return snapshots[symbol]
  } catch {
    return undefined
  }
}

type PositionTableProps = {
  items: PositionListItem[]
  isClosed?: boolean
  quotes?: StockQuotesByTicker
  session?: string
  snapshots?: OptionSnapshotsBySymbol
  pendingPositionIds?: ReadonlySet<string>
}

function PositionTable({
  items,
  isClosed,
  quotes = {},
  session,
  snapshots,
  pendingPositionIds
}: PositionTableProps): React.JSX.Element {
  return (
    <table
      className={['w-full border-collapse text-[0.8125rem]', isClosed ? 'opacity-[0.55]' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <thead>
        <tr className="bg-wb-bg-surface border-b border-wb-border">
          {TABLE_COLUMNS.map((col) => (
            <TableHeader key={col} className="px-[16px] py-[8px]">
              {col}
            </TableHeader>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <PositionRow
            key={item.id}
            item={item}
            index={i}
            isClosed={isClosed}
            quote={quotes[item.ticker] as StockQuote | undefined}
            session={session}
            snapshot={isClosed ? undefined : snapshotForItem(item, snapshots)}
            hasPendingAssignment={pendingPositionIds?.has(item.id) ?? false}
          />
        ))}
      </tbody>
    </table>
  )
}

export function PositionsListPage(): React.JSX.Element {
  const { data, isLoading, isError } = usePositions()

  const activePositions = useMemo(() => data?.filter((p) => p.status === 'ACTIVE') ?? [], [data])
  const closedPositions = useMemo(() => data?.filter((p) => p.status === 'CLOSED') ?? [], [data])

  const tickers = useMemo(
    () => Array.from(new Set(activePositions.map((p) => p.ticker))).sort(),
    [activePositions]
  )

  const legs = useMemo<ActiveLegSummary[]>(
    () =>
      activePositions.map((p) => ({
        ticker: p.ticker,
        expiration: p.expiration,
        strike: p.strike,
        instrumentType: p.instrumentType
      })),
    [activePositions]
  )

  const quotesQuery = useStockQuotes(tickers)
  const statusQuery = useMarketStatus()
  const snapshotsQuery = useOptionSnapshots(legs, { session: statusQuery.data?.session })
  const pendingAssignmentsQuery = usePendingAssignments()
  const pendingPositionIds = useMemo(
    () => new Set((pendingAssignmentsQuery.data ?? []).map((a) => a.positionId)),
    [pendingAssignmentsQuery.data]
  )

  const { stale, minutesAgo } = quotesQuery
  const display = deriveMarketStatusDisplay(statusQuery.data?.session, stale)

  return (
    <PageLayout
      header={<PositionsHeader count={activePositions.length} marketStatusDisplay={display} />}
    >
      <AssignmentNotificationBanner />

      {isLoading && <LoadingState message="Loading positions…" />}

      {isError && (
        <div className="mx-[24px] my-[16px]">
          <ErrorAlert message="Failed to load positions — check that the database is accessible." />
        </div>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <div className="px-[24px] py-[64px] flex flex-col items-start gap-[16px]">
          <p className="text-wb-text-muted text-sm m-0">No positions yet</p>
          <a
            href="#/new"
            className="px-[16px] py-[6px] rounded-md text-xs font-medium text-wb-gold bg-wb-gold-dim border border-wb-gold-border no-underline"
          >
            Open your first wheel →
          </a>
        </div>
      )}

      {data && data.length > 0 && (
        <>
          <StaleDataBanner stale={stale} minutesAgo={minutesAgo} />
          {snapshotsQuery.unavailable && (
            <div className="flex items-center gap-2 border-b border-wb-gold/30 bg-wb-gold/10 px-4 py-2 font-wb-mono text-[0.75rem] text-wb-gold">
              <span className="text-[0.85rem]">⚠</span>
              Options data unavailable — OPRA market data subscription required
            </div>
          )}
          <SectionHeader title="Active" />
          <PositionTable
            items={activePositions}
            quotes={quotesQuery.data}
            session={statusQuery.data?.session}
            snapshots={snapshotsQuery.data}
            pendingPositionIds={pendingPositionIds}
          />

          {closedPositions.length > 0 && (
            <>
              <SectionHeader title="Closed" />
              <PositionTable items={closedPositions} isClosed />
            </>
          )}
        </>
      )}
    </PageLayout>
  )
}
