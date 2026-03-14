import type { PositionListItem } from '../api/positions'
import { PositionRow } from '../components/PositionCard'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { usePositions } from '../hooks/usePositions'
import { MONO } from '../lib/tokens'
const TABLE_COLUMNS = ['Ticker', 'Phase', 'Strike', 'Expiration', 'DTE', 'Premium', 'Cost Basis']

const thStyle: React.CSSProperties = {
  padding: '8px 16px',
  textAlign: 'left',
  fontWeight: 500,
  fontSize: '0.65rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--wb-text-muted)',
  fontFamily: MONO
}

function PositionsHeader({ count }: { count?: number }): React.JSX.Element {
  return (
    <PageHeader
      left={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--wb-text-primary)',
              margin: 0
            }}
          >
            Active Positions
          </h1>
          {count != null && count > 0 && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 500,
                padding: '1px 7px',
                borderRadius: 10,
                background: 'var(--wb-gold-dim)',
                color: 'var(--wb-gold)',
                border: '1px solid var(--wb-gold-border)',
                fontFamily: MONO
              }}
            >
              {count}
            </span>
          )}
        </div>
      }
      right={
        <a
          href="#/new"
          className="wb-hover-opacity"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 14px',
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 500,
            color: 'var(--wb-bg-base)',
            background: 'var(--wb-gold)',
            textDecoration: 'none',
            letterSpacing: '0.02em',
            transition: 'opacity 0.15s'
          }}
        >
          + New Wheel
        </a>
      }
    />
  )
}

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <div
      style={{
        padding: '16px 24px 8px',
        fontSize: '0.65rem',
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--wb-text-muted)',
        fontFamily: MONO
      }}
    >
      {title}
    </div>
  )
}

type PositionTableProps = {
  items: PositionListItem[]
  isClosed?: boolean
  style?: React.CSSProperties
}

function PositionTable({ items, isClosed, style }: PositionTableProps): React.JSX.Element {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', ...style }}>
      <thead>
        <tr
          style={{ background: 'var(--wb-bg-surface)', borderBottom: '1px solid var(--wb-border)' }}
        >
          {TABLE_COLUMNS.map((col) => (
            <th key={col} style={thStyle}>
              {col}
            </th>
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
        <div style={{ margin: '16px 24px' }}>
          <ErrorAlert message="Failed to load positions — check that the database is accessible." />
        </div>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <div
          style={{
            padding: '64px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 16
          }}
        >
          <p style={{ color: 'var(--wb-text-muted)', fontSize: '0.875rem', margin: 0 }}>
            No positions yet
          </p>
          <a
            href="#/new"
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--wb-gold)',
              background: 'var(--wb-gold-dim)',
              border: '1px solid var(--wb-gold-border)',
              textDecoration: 'none'
            }}
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
              <PositionTable items={closedPositions} isClosed style={{ opacity: 0.55 }} />
            </>
          )}
        </>
      )}
    </PageLayout>
  )
}
