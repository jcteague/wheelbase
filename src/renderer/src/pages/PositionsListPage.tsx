import type { PositionListItem } from '../api/positions'
import { PositionRow } from '../components/PositionCard'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { Badge } from '../components/ui/Badge'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { TableHeader } from '../components/ui/TablePrimitives'
import { usePositions } from '../hooks/usePositions'

const TABLE_COLUMNS = ['Ticker', 'Phase', 'Strike', 'Expiration', 'DTE', 'Premium', 'Cost Basis']

function PositionsHeader({ count }: { count?: number }): React.JSX.Element {
  return (
    <PageHeader
      left={
        <div className="flex items-center gap-[10px]">
          <h1 className="text-sm font-semibold text-wb-text-primary m-0">Active Positions</h1>
          {count != null && count > 0 && <Badge>{count}</Badge>}
        </div>
      }
      right={
        <a
          href="#/new"
          className="wb-hover-opacity flex items-center gap-[6px] px-[14px] py-[5px] rounded-md text-xs font-medium text-wb-bg-base bg-wb-gold no-underline tracking-[0.02em]"
        >
          + New Wheel
        </a>
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

type PositionTableProps = {
  items: PositionListItem[]
  isClosed?: boolean
}

function PositionTable({ items, isClosed }: PositionTableProps): React.JSX.Element {
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
          <PositionRow key={item.id} item={item} index={i} isClosed={isClosed} />
        ))}
      </tbody>
    </table>
  )
}

export function PositionsListPage(): React.JSX.Element {
  const { data, isLoading, isError } = usePositions()

  const activePositions = data?.filter((p) => p.status === 'ACTIVE') ?? []
  const closedPositions = data?.filter((p) => p.status === 'CLOSED') ?? []

  return (
    <PageLayout header={<PositionsHeader count={activePositions.length} />}>
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
          <SectionHeader title="Active" />
          <PositionTable items={activePositions} />

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
