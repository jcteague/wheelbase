import { useState } from 'react'
import { useLocation } from 'wouter'

import { firstErrorMessage } from '../api/error'
import type { ScreenerCandidate } from '../api/screener'
import { BenchGrid } from '../components/BenchGrid'
import { BenchHeader } from '../components/BenchHeader'
import { MarketDataOutage } from '../components/MarketDataOutage'
import { PageLayout } from '../components/PageLayout'
import { ScreeningCriteriaSheet } from '../components/ScreeningCriteriaSheet'
import { WatchlistEntryForm } from '../components/WatchlistEntryForm'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { useRemoveFromWatchlist } from '../hooks/useRemoveFromWatchlist'
import { useScreenerResults } from '../hooks/useScreenerResults'
import { useScreeningCriteria } from '../hooks/useScreeningCriteria'
import { useSettingsStatus } from '../hooks/useSettings'
import { useWatchlistSnapshot } from '../hooks/useWatchlistSnapshot'
import { type Bench, buildBench } from '../lib/bench'
import { buildPromoteSearch } from '../lib/promote'
import { fmtQuoteTime } from '../lib/screener-format'

// [US-96] One live bench. The watchlist and the screener answer halves of the same
// question — "what am I watching?" and "what is worth selling today?" — so they share
// one page: two sections of cards on the left, the selected stock's detail on the right.
//
// The page itself only holds the sheet/add/selection/editing state and decides which of
// the bench's states to show; the header, the grid and the outage state each own their
// own markup and copy.
//
// [US-69] One entry form at a time. Opening either form closes the other, and leaving a
// stock — by selecting another or removing it — closes the edit rather than leaving it
// pointing at something the trader is no longer looking at.

export const WATCHLIST_PAGE_TITLE = 'Watchlist'

const EMPTY_BENCH: Bench = { meets: [], waiting: [] }

const FOOTER_COPY =
  'Meets criteria = saved stock conditions pass on a usable IV reading + a qualifying put. Aging readings (2–3 sessions) still count; a stale, earnings-predating, or missing reading is unknown and never satisfies a condition. Stocks without personal conditions use screening defaults.'

function EmptyGuidance(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-wb-gold-border bg-wb-bg-surface px-8 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-wb-gold-border bg-wb-gold-dim text-xl text-wb-gold">
        ☰
      </div>
      <div className="text-base font-semibold text-wb-text-primary">No tickers yet</div>
      <div className="max-w-[420px] text-sm leading-relaxed text-wb-text-secondary">
        Add tickers you&rsquo;d consider selling puts on, with the conditions you&rsquo;re waiting
        for. The screener pulls option chains for every name and ranks the best entries.
      </div>
    </div>
  )
}

/** Confirms a save on the page itself — the sheet closes, so it cannot confirm its own success. */
function SavedBanner(): React.JSX.Element {
  return (
    <div className="flex items-center gap-[10px] rounded-md border border-wb-green-border bg-wb-green-subtle px-[14px] py-[10px]">
      <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-wb-green-dim font-wb-mono text-[0.7rem] font-bold text-wb-green">
        ✓
      </span>
      <span className="text-[0.8125rem] font-semibold text-wb-green">Screening criteria saved</span>
    </div>
  )
}

export function WatchlistPage(): React.JSX.Element {
  const snapshotQuery = useWatchlistSnapshot()
  const screenerQuery = useScreenerResults()
  const { data: criteria, isError: isCriteriaError } = useScreeningCriteria()
  const { data: credentialStatus } = useSettingsStatus()
  const { display } = useMarketStatusDisplay()
  const removeMutation = useRemoveFromWatchlist()
  const [, navigate] = useLocation()

  const [sheetOpen, setSheetOpen] = useState(false)
  const [savedConfirmed, setSavedConfirmed] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const snapshot = snapshotQuery.data
  const rows = snapshot?.rows ?? []
  const results = screenerQuery.data
  const bench = snapshot === undefined ? EMPTY_BENCH : buildBench(snapshot, results)

  // Both conditions, not just the flag: a query that has succeeded once keeps serving its
  // data when a later refetch fails, so `isError` alone would call usable criteria
  // unloadable and disable every entry point into the sheet.
  const criteriaUnloadable = isCriteriaError && criteria === undefined
  // `!== 'missing'`, not `=== 'configured'`: an unresolved status must not claim the trader
  // has no credentials, since that swaps a usable Retry for a pointless trip to Settings.
  const marketDataConfigured = credentialStatus?.marketData !== 'missing'
  // Marks are only badged stale when the market is closed and something was actually marked.
  const staleQuoteTime =
    display === 'CLOSED' && bench.meets.length > 0 && results?.quoteTimestamp
      ? fmtQuoteTime(results.quoteTimestamp)
      : null

  // Every entry point opens the same sheet, and re-opening it retires the confirmation
  // from the previous edit session.
  function openSheet(): void {
    setSavedConfirmed(false)
    setSheetOpen(true)
  }

  function handleEdit(ticker: string): void {
    // Editing a stock selects it. The Edit button is reachable on the stock the bench
    // defaulted to, which the trader never clicked — leaving `selected` null there would
    // let a background refetch that re-sections the bench move the default elsewhere and
    // unmount the open form, discarding what was typed without saying so.
    setSelected(ticker)
    setEditing(ticker)
    setAddOpen(false)
  }

  function handleEditDone(): void {
    setEditing(null)
  }

  function handleToggleAdd(): void {
    setAddOpen((open) => !open)
    setEditing(null)
  }

  function handleSelect(ticker: string): void {
    setSelected(ticker)
    setEditing(null)
  }

  function handleRemove(ticker: string): void {
    removeMutation.mutate(ticker)
    // Not redundant with the panel deriving its content from `editing === current.ticker`:
    // the mutation is async, so the card stays on the bench for the whole IPC + refetch
    // round trip. Without this the form would sit open over a stock already being deleted.
    if (editing === ticker) setEditing(null)
  }

  function refreshBench(): void {
    void snapshotQuery.refetch()
    void screenerQuery.refetch()
  }

  // Saving re-screens through the criteria mutation's own invalidation; the snapshot is
  // refetched here because its verdicts are read against the same refreshed marks.
  function handleSaved(): void {
    setSavedConfirmed(true)
    void snapshotQuery.refetch()
  }

  function handleReview(candidate: ScreenerCandidate): void {
    const notes = rows.find((row) => row.entry.ticker === candidate.ticker)?.entry.notes
    navigate(`/new?${buildPromoteSearch(candidate, notes)}`)
  }

  return (
    <PageLayout
      header={
        <BenchHeader
          title={WATCHLIST_PAGE_TITLE}
          watchlistCount={rows.length}
          criteria={criteria}
          criteriaUnloadable={criteriaUnloadable}
          staleQuoteTime={staleQuoteTime}
          marketStatus={display}
          addOpen={addOpen}
          onOpenCriteria={openSheet}
          onRefresh={refreshBench}
          onToggleAdd={handleToggleAdd}
        />
      }
    >
      <div className="flex flex-col gap-5 p-6">
        {savedConfirmed && <SavedBanner />}

        {(addOpen || rows.length === 0) && <WatchlistEntryForm />}

        {criteriaUnloadable && (
          <ErrorAlert message="Failed to load your screening criteria — the criteria sheet can't be opened until they load." />
        )}

        {(snapshotQuery.isLoading || screenerQuery.isLoading) && (
          <LoadingState message="Loading watchlist…" />
        )}

        {snapshotQuery.isError && (
          <ErrorAlert message="Failed to load the watchlist — check that the database is accessible." />
        )}

        {screenerQuery.isError && (
          <ErrorAlert message="Failed to screen the watchlist — check that market data is reachable." />
        )}

        {removeMutation.isError && (
          <ErrorAlert
            message={firstErrorMessage(
              removeMutation.error,
              'Failed to remove the ticker — please try again.'
            )}
          />
        )}

        {results?.status === 'provider_unavailable' && (
          <MarketDataOutage
            marketDataConfigured={marketDataConfigured}
            onRetry={() => void screenerQuery.refetch()}
            onOpenSettings={() => navigate('/settings')}
          />
        )}

        {rows.length === 0 && snapshot !== undefined && <EmptyGuidance />}

        {rows.length > 0 && (
          <BenchGrid
            bench={bench}
            selected={selected}
            onSelect={handleSelect}
            onRemove={handleRemove}
            onReview={handleReview}
            editing={editing}
            onEdit={handleEdit}
            onEditDone={handleEditDone}
            onAdjustCriteria={openSheet}
            criteriaUnloadable={criteriaUnloadable}
            screened={results?.status === 'ok'}
          />
        )}
      </div>

      <footer className="border-t border-wb-border px-6 py-3 text-xs text-wb-text-muted">
        {FOOTER_COPY}
      </footer>

      {criteria && (
        <ScreeningCriteriaSheet
          open={sheetOpen}
          criteria={criteria}
          watchlistCount={rows.length}
          onClose={() => setSheetOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </PageLayout>
  )
}
