import type { ScreenerResults } from '../api/screener'
import { MarketStatusPill } from '../components/MarketStatusPill'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { ScreenerExcludedSection } from '../components/ScreenerExcludedSection'
import { ScreenerResultsTable } from '../components/ScreenerResultsTable'
import { ScreenerStateCard } from '../components/ScreenerStateCard'
import { Badge } from '../components/ui/Badge'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { useMarketStatusDisplay } from '../hooks/useMarketStatusDisplay'
import { useScreenerResults } from '../hooks/useScreenerResults'
import { fmtQuoteTime } from '../lib/screener-format'

export const SCREENER_PAGE_TITLE = 'Screener'

type ScreenerResultsBodyProps = {
  results: ScreenerResults
  /** The quote time to badge as stale, or null when the marks are current. */
  staleQuoteTime: string | null
  onRetry: () => void
}

function ScreenerResultsBody({
  results,
  staleQuoteTime,
  onRetry
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
          body="Every strike on your watchlist was filtered out. Loosen your delta band or DTE window in Screener settings."
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
          <ScreenerResultsTable candidates={ranked} />
        </>
      )}
      <ScreenerExcludedSection exclusions={excluded} />
    </>
  )
}

export function ScreenerPage(): React.JSX.Element {
  const { data, isLoading, isError, refetch } = useScreenerResults()
  const { display } = useMarketStatusDisplay()

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
          right={<MarketStatusPill state={display} />}
        />
      }
    >
      <div className="flex flex-col gap-4 p-6">
        {isLoading && <LoadingState message="Screening watchlist…" />}

        {isError && (
          <ErrorAlert message="Failed to screen the watchlist — check that market data is reachable." />
        )}

        {data && (
          <ScreenerResultsBody
            results={data}
            staleQuoteTime={staleQuoteTime}
            onRetry={() => void refetch()}
          />
        )}
      </div>
    </PageLayout>
  )
}
