import { format, parseISO } from 'date-fns'

import { firstErrorMessage } from '../api/error'
import type { WatchlistEntry } from '../api/watchlist'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { WatchlistAddForm } from '../components/WatchlistAddForm'
import { Badge } from '../components/ui/Badge'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { TableCell, TableHeader } from '../components/ui/TablePrimitives'
import { buildConditionTags } from '../lib/watchlistConditionTags'
import { useRemoveFromWatchlist } from '../hooks/useRemoveFromWatchlist'
import { useWatchlist } from '../hooks/useWatchlist'

export const WATCHLIST_PAGE_TITLE = 'Watchlist'

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

type WatchlistRowProps = {
  entry: WatchlistEntry
  onRemove: (ticker: string) => void
}

function WatchlistRow({ entry, onRemove }: WatchlistRowProps): React.JSX.Element {
  const tags = buildConditionTags(entry)

  return (
    <tr data-testid={`watchlist-row-${entry.ticker}`} className="hover:bg-wb-bg-hover">
      <TableCell data-testid={`watchlist-ticker-${entry.ticker}`}>
        <span data-testid="watchlist-ticker" className="font-bold tracking-[0.03em] text-wb-gold">
          {entry.ticker}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1.5">
          {entry.notes && <span className="text-wb-text-secondary">{entry.notes}</span>}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  data-testid="watchlist-tag"
                  className="rounded border border-wb-border-subtle px-1.5 py-px text-[0.62rem] text-wb-text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right text-wb-text-muted">
        {format(parseISO(entry.addedAt), 'MMM d')}
      </TableCell>
      <TableCell className="text-right">
        <button
          type="button"
          title="Remove"
          data-testid={`watchlist-remove-${entry.ticker}`}
          onClick={() => onRemove(entry.ticker)}
          className="h-6 w-6 rounded-md border border-wb-border bg-transparent text-wb-text-muted"
        >
          ✕
        </button>
      </TableCell>
    </tr>
  )
}

type WatchlistTableProps = {
  entries: WatchlistEntry[]
  onRemove: (ticker: string) => void
}

function WatchlistTable({ entries, onRemove }: WatchlistTableProps): React.JSX.Element {
  return (
    <table className="w-full border-collapse text-[0.8125rem]">
      <thead>
        <tr className="border-b border-wb-border bg-wb-bg-surface">
          <TableHeader>Ticker</TableHeader>
          <TableHeader>Thesis</TableHeader>
          <TableHeader className="text-right">Added</TableHeader>
          <TableHeader className="text-right"> </TableHeader>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <WatchlistRow key={entry.ticker} entry={entry} onRemove={onRemove} />
        ))}
      </tbody>
    </table>
  )
}

type WatchlistHeaderProps = {
  count: number
}

function WatchlistHeader({ count }: WatchlistHeaderProps): React.JSX.Element {
  return (
    <PageHeader
      left={
        <div className="flex items-center gap-[10px]">
          <h1 className="m-0 text-sm font-semibold text-wb-text-primary">{WATCHLIST_PAGE_TITLE}</h1>
          {count > 0 && <Badge>{count}</Badge>}
        </div>
      }
    />
  )
}

export function WatchlistPage(): React.JSX.Element {
  const { data, isLoading, isError } = useWatchlist()
  const removeMutation = useRemoveFromWatchlist()
  const entries = data ?? []

  return (
    <PageLayout header={<WatchlistHeader count={entries.length} />}>
      <div className="flex flex-col gap-4 p-6">
        {isLoading && <LoadingState message="Loading watchlist…" />}

        {isError && (
          <ErrorAlert message="Failed to load the watchlist — check that the database is accessible." />
        )}

        {!isLoading && !isError && (
          <>
            {removeMutation.isError && (
              <ErrorAlert
                message={firstErrorMessage(
                  removeMutation.error,
                  'Failed to remove the ticker — please try again.'
                )}
              />
            )}
            {entries.length === 0 && <EmptyGuidance />}
            <WatchlistAddForm />
            {entries.length > 0 && (
              <WatchlistTable
                entries={entries}
                onRemove={(ticker) => removeMutation.mutate(ticker)}
              />
            )}
          </>
        )}
      </div>
    </PageLayout>
  )
}
