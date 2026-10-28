import { useMemo, useRef, useState, type Ref } from 'react'
import { useLocation, useSearch } from 'wouter'
import type { ApiError } from '../api/error'
import { MarketStatusPill, type MarketStatusDisplay } from '../components/MarketStatusPill'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { PositionsGrid } from '../components/PositionsGrid'
import { StaleDataBanner } from '../components/StaleDataBanner'
import { Badge } from '../components/ui/Badge'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { useManagementQueue } from '../hooks/useManagementQueue'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { useOptionSnapshots, type ActiveLegSummary } from '../hooks/useOptionSnapshots'
import { usePositions } from '../hooks/usePositions'
import { useAlertDefaults } from '../hooks/useSettings'
import { useStockQuotes } from '../hooks/useStockQuotes'
import { AssignmentNotificationBanner } from '../components/AssignmentNotificationBanner'
import { ManagementQueue } from '../components/ManagementQueue'
import { NewPositionSheet } from '../components/NewPositionSheet'
import type { PmccRecorded } from '../components/new-position-shared'
import { AlertBox } from '../components/ui/AlertBox'
import { actionsByPosition, type LaneContext } from '../lib/card-actions'
import { PHASE_LABEL } from '../lib/phase'
import { usePendingAssignments } from '../api/assignments'

type PositionsHeaderProps = {
  count?: number
  marketStatusDisplay: MarketStatusDisplay
  newWheelRef?: Ref<HTMLAnchorElement>
}

function getErrorCode(error: ApiError | Error | null): string | null {
  if (!error || !('body' in error)) return null
  const detail = (error.body as { detail?: Array<{ code?: string }> }).detail
  return detail?.[0]?.code ?? null
}

function PositionsHeader({
  count,
  marketStatusDisplay,
  newWheelRef
}: PositionsHeaderProps): React.JSX.Element {
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
            ref={newWheelRef}
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

/** [US-101] The list-level confirmation once the PMCC sheet has closed on success. */
function PositionsRecordedBanner({ recorded }: { recorded: PmccRecorded }): React.JSX.Element {
  return (
    <div role="status" className="mx-[24px] mt-[16px]">
      <AlertBox variant="success" data-testid="positions-recorded-banner">
        <div className="flex items-center justify-between gap-4">
          <span>
            PMCC recorded — {recorded.ticker} · {PHASE_LABEL.PMCC_OPEN}
          </span>
          <a href={`#/positions/${recorded.id}`} className="text-wb-green">
            View position →
          </a>
        </div>
      </AlertBox>
    </div>
  )
}

function SectionHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="px-[24px] pt-[16px] pb-[8px] text-xs font-medium tracking-[0.08em] uppercase text-wb-text-muted font-wb-mono">
      {title}
    </div>
  )
}

export function PositionsListPage(): React.JSX.Element {
  // [US-101] `/new` is this page with the New position sheet open, so the list (and its
  // scroll) survives opening and closing it.
  const [location, navigate] = useLocation()
  // wouter's `navigate('/new?…')` puts the query in `location.search`; a hash written
  // directly (`#/new?ticker=`, CallAwaySuccess) keeps it in the location instead.
  const [path, hashQuery] = location.split('?')
  const browserSearch = useSearch()
  const search = hashQuery ?? browserSearch
  const sheetOpen = path === '/new'
  const newWheelRef = useRef<HTMLAnchorElement>(null)
  const [recorded, setRecorded] = useState<PmccRecorded | null>(null)
  // The banner belongs to the last save; opening the sheet again retires it.
  const [wasOpen, setWasOpen] = useState(sheetOpen)
  if (sheetOpen !== wasOpen) {
    setWasOpen(sheetOpen)
    if (sheetOpen) setRecorded(null)
  }
  const closeSheet = (): void => navigate('/', { replace: true })

  const { data, isLoading, isError } = usePositions()
  const alertDefaultsQuery = useAlertDefaults()

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
  const { settingsQuery, hasMarketData, statusQuery, display } = useMarketStatusDisplay(
    quotesQuery.stale
  )
  const snapshotsQuery = useOptionSnapshots(legs, { session: statusQuery.data?.session })
  const pendingAssignmentsQuery = usePendingAssignments()
  const pendingPositionIds = useMemo(
    () => new Set((pendingAssignmentsQuery.data ?? []).map((a) => a.positionId)),
    [pendingAssignmentsQuery.data]
  )

  const queueQuery = useManagementQueue()
  const cardActions = useMemo(() => {
    const ctxById = new Map<string, LaneContext>(
      activePositions.flatMap((p) =>
        p.strategyType === 'WHEEL'
          ? [[p.id, { price: quotesQuery.data?.[p.ticker]?.price ?? null, strike: p.strike }]]
          : []
      )
    )
    return actionsByPosition(queueQuery.data ?? [], ctxById)
  }, [activePositions, quotesQuery.data, queueQuery.data])

  const { stale, minutesAgo } = quotesQuery
  const showNoBrokerBanner = settingsQuery.data?.activeBrokerEnv === 'none'
  // Market data and the broker share one set of Alpaca keys, so a rejection from either
  // source is the same problem and gets a single prompt.
  // Only surface an auth error when credentials ARE configured but rejected — not when none are saved
  const authPrompt =
    quotesQuery.streamError?.code === 'auth_failed' ||
    (hasMarketData && getErrorCode(statusQuery.error) === 'auth_failed')
      ? 'Alpaca authentication failed — check your key in Settings'
      : null

  return (
    <PageLayout
      header={
        <PositionsHeader
          count={activePositions.length}
          marketStatusDisplay={display}
          newWheelRef={newWheelRef}
        />
      }
    >
      <AssignmentNotificationBanner />

      {recorded && <PositionsRecordedBanner recorded={recorded} />}

      <div className="mx-[24px] my-[16px]">
        <ManagementQueue />
      </div>

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

      {showNoBrokerBanner && (
        <div className="mx-[24px] mt-[16px] rounded-md border border-wb-blue/25 bg-wb-blue-dim px-4 py-3 font-wb-mono text-[0.74rem] text-wb-text-primary">
          <span>Connect Alpaca to enable market data, broker activity and buying power.</span>{' '}
          <a href="#/settings" className="text-wb-gold">
            Alpaca setup
          </a>
        </div>
      )}
      {authPrompt && (
        <div className="mx-[24px] mt-[16px] rounded-md border border-wb-red/25 bg-wb-red/10 px-4 py-3 font-wb-mono text-[0.74rem] text-wb-red">
          {authPrompt}
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
          <PositionsGrid
            items={activePositions}
            quotes={quotesQuery.data}
            session={statusQuery.data?.session}
            snapshots={snapshotsQuery.data}
            pendingPositionIds={pendingPositionIds}
            profitTargetDefault={alertDefaultsQuery.data?.profitTargetPercent}
            actionsByPosition={cardActions}
          />

          {closedPositions.length > 0 && (
            <>
              <SectionHeader title="Closed" />
              <PositionsGrid
                items={closedPositions}
                isClosed
                profitTargetDefault={alertDefaultsQuery.data?.profitTargetPercent}
              />
            </>
          )}
        </>
      )}

      <NewPositionSheet
        open={sheetOpen}
        search={search}
        onClose={closeSheet}
        onRecorded={(r) => {
          setRecorded(r)
          closeSheet()
        }}
        returnFocusRef={newWheelRef}
      />
    </PageLayout>
  )
}
