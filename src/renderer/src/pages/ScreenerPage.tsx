import { useState } from 'react'
import { useLocation } from 'wouter'
import type { ScreenerCandidate, ScreenerResults } from '../api/screener'
import { MarketStatusPill } from '../components/MarketStatusPill'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { ScreenerCriteriaStrip } from '../components/ScreenerCriteriaStrip'
import { ScreenerExcludedSection } from '../components/ScreenerExcludedSection'
import { ScreenerResultsTable } from '../components/ScreenerResultsTable'
import { ScreenerStateCard } from '../components/ScreenerStateCard'
import { ScreeningCriteriaSheet } from '../components/ScreeningCriteriaSheet'
import { Badge } from '../components/ui/Badge'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { useScreenerResults } from '../hooks/useScreenerResults'
import { useScreeningCriteria } from '../hooks/useScreeningCriteria'
import { useWatchlist } from '../hooks/useWatchlist'
import { buildPromoteSearch } from '../lib/promote'
import { fmtQuoteTime } from '../lib/screener-format'

export const SCREENER_PAGE_TITLE = 'Screener'

/** Header entry point into the criteria sheet; gold-tinted while the sheet is open. */
function CriteriaButton({
  active,
  disabled,
  onClick
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-[11px] py-1 font-wb-mono text-[0.68rem] font-semibold tracking-[0.04em] disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'border-wb-gold-border bg-wb-gold-dim text-wb-gold'
          : 'border-wb-border bg-wb-bg-elevated text-wb-text-secondary'
      ].join(' ')}
    >
      <span>⚙</span>
      Criteria
    </button>
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

type ScreenerResultsBodyProps = {
  results: ScreenerResults
  /** The quote time to badge as stale, or null when the marks are current. */
  staleQuoteTime: string | null
  onRetry: () => void
  onAdjustCriteria: () => void
  /** The criteria sheet cannot open, so its entry point must not invite a click. */
  adjustDisabled: boolean
  onPromote: (candidate: ScreenerCandidate) => void
}

function ScreenerResultsBody({
  results,
  staleQuoteTime,
  onRetry,
  onAdjustCriteria,
  adjustDisabled,
  onPromote
}: ScreenerResultsBodyProps): React.JSX.Element {
  if (results.status === 'provider_unavailable') {
    return (
      <ScreenerStateCard
        data-testid="screener-unavailable"
        tone="error"
        title="Market data unavailable"
        body="Massive couldn't be reached on the last refresh. Candidates can't be scored until chain data is available."
        actionLabel="Retry refresh"
        onAction={onRetry}
      />
    )
  }

  const { ranked, excluded } = results

  return (
    <>
      {ranked.length === 0 && (
        <ScreenerStateCard
          data-testid="screener-empty"
          tone="neutral"
          title="No candidates match your criteria"
          body="Every strike on your watchlist was filtered out. Loosen your delta band or DTE window."
          actionLabel="Adjust criteria"
          onAction={onAdjustCriteria}
          actionDisabled={adjustDisabled}
        />
      )}
      {ranked.length > 0 && (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="m-0 text-lg font-semibold text-wb-text-primary">Candidate Results</h2>
            <span
              data-testid="screener-count"
              className="font-wb-mono text-[0.72rem] text-wb-text-secondary"
            >
              {ranked.length} candidates ·{' '}
              {staleQuoteTime ? `quoted ${staleQuoteTime}` : `${excluded.length} excluded`}
            </span>
          </div>
          {staleQuoteTime && (
            <p
              data-testid="screener-stale-caption"
              className="m-0 font-wb-mono text-[0.7rem] leading-relaxed text-wb-gold"
            >
              Quoted {staleQuoteTime} · after-hours option marks are unreliable — treat these as a
              stale snapshot.
            </p>
          )}
          <ScreenerResultsTable candidates={ranked} onPromote={onPromote} />
        </>
      )}
      <ScreenerExcludedSection exclusions={excluded} />
    </>
  )
}

export function ScreenerPage(): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useScreenerResults()
  const { display } = useMarketStatusDisplay()
  const { data: criteria, isError: isCriteriaError } = useScreeningCriteria()
  const { data: watchlist } = useWatchlist()
  const [, navigate] = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [savedConfirmed, setSavedConfirmed] = useState(false)

  // [US-68] The note is a nicety, so promote never waits on the watchlist query:
  // an unresolved (or note-less) entry simply omits the thesis.
  function handlePromote(candidate: ScreenerCandidate): void {
    const note = watchlist?.find((entry) => entry.ticker === candidate.ticker)?.notes
    navigate(`/new?${buildPromoteSearch(candidate, note)}`)
  }

  // Both conditions, not just the flag: a query that has succeeded once keeps
  // serving its data when a later refetch fails, and the client refetches on every
  // window focus. `isError` alone would disable all three entry points — and claim
  // the criteria were unloadable — while the trader reads a populated summary strip.
  // Pending is deliberately excluded too: there is nothing to open yet, but the
  // criteria are on their way, so the click is honoured once they land.
  const criteriaUnloadable = isCriteriaError && criteria === undefined

  // Every entry point opens the same sheet, and re-opening it retires the
  // confirmation from the previous edit session.
  function openSheet(): void {
    setSavedConfirmed(false)
    setSheetOpen(true)
  }

  const rankedCount = data?.ranked.length ?? 0
  // Marks are only badged stale when the market is closed and there is a snapshot to badge.
  const staleQuoteTime =
    display === 'CLOSED' && rankedCount > 0 && data?.quoteTimestamp
      ? fmtQuoteTime(data.quoteTimestamp)
      : null

  return (
    <PageLayout
      header={
        <PageHeader
          left={
            <div className="flex items-center gap-[10px]">
              <h1 className="m-0 text-sm font-semibold text-wb-text-primary">
                {SCREENER_PAGE_TITLE}
              </h1>
              {rankedCount > 0 && <Badge>{rankedCount}</Badge>}
              {staleQuoteTime && (
                <span
                  data-testid="screener-stale-badge"
                  className="inline-flex items-center rounded-[10px] border border-wb-gold-border bg-wb-gold-dim px-2 py-px font-wb-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-wb-gold"
                >
                  Stale snapshot
                </span>
              )}
            </div>
          }
          right={
            <div className="flex items-center gap-[10px]">
              <CriteriaButton
                active={sheetOpen}
                disabled={criteriaUnloadable}
                onClick={openSheet}
              />
              <MarketStatusPill state={display} />
            </div>
          }
        />
      }
    >
      <div className="flex flex-col gap-4 p-6">
        {savedConfirmed && <SavedBanner />}

        {criteria && <ScreenerCriteriaStrip criteria={criteria} onClick={openSheet} />}

        {criteriaUnloadable && (
          <ErrorAlert message="Failed to load your screening criteria — the criteria sheet can't be opened until they load." />
        )}

        {isLoading && <LoadingState message="Screening watchlist…" />}

        {isError && (
          <ErrorAlert message="Failed to screen the watchlist — check that market data is reachable." />
        )}

        {data && (
          <ScreenerResultsBody
            results={data}
            staleQuoteTime={staleQuoteTime}
            onRetry={() => void refetch()}
            onAdjustCriteria={openSheet}
            adjustDisabled={criteriaUnloadable}
            onPromote={handlePromote}
          />
        )}
      </div>

      {criteria && (
        <ScreeningCriteriaSheet
          open={sheetOpen}
          criteria={criteria}
          // One row per watchlist ticker: the ranked candidates plus every ticker
          // excluded from ranking. A provider outage empties both arrays without
          // emptying the watchlist, so the count is unknown rather than zero.
          watchlistCount={data?.status === 'ok' ? rankedCount + data.excluded.length : undefined}
          onClose={() => setSheetOpen(false)}
          onSaved={() => setSavedConfirmed(true)}
        />
      )}
    </PageLayout>
  )
}
