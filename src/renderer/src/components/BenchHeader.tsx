import type { ScreeningCriteria } from '../api/screening-criteria'
import { type MarketStatusDisplay, MarketStatusPill } from './MarketStatusPill'
import { PageHeader } from './PageLayout'
import { ScreenerCriteriaStrip } from './ScreenerCriteriaStrip'
import { Badge } from './ui/Badge'
import { Button } from './ui/button'

// [US-96] The bench's header band: what is on the bench on the left, the actions that
// change it on the right, and the screening criteria in a strip underneath.
//
// Staleness is marked twice on purpose — a badge beside the count, so the state is
// unmissable, and the quote time beside the criteria, so the trader can see how old the
// marks behind those criteria actually are.

const HEADER_BUTTON = 'font-wb-mono border-wb-border bg-wb-bg-elevated text-wb-text-secondary'

type BenchHeaderProps = {
  title: string
  /** Saved stocks, not bench cards: the count answers "how many am I watching?". */
  watchlistCount: number
  /** Undefined until the criteria load — only the strip needs them. */
  criteria: ScreeningCriteria | undefined
  /** Keeps every entry point into the sheet inert while the criteria cannot be loaded. */
  criteriaUnloadable: boolean
  /** The formatted time the marks were quoted, or null while they are current. */
  staleQuoteTime: string | null
  marketStatus: MarketStatusDisplay
  addOpen: boolean
  onOpenCriteria: () => void
  onRefresh: () => void
  onToggleAdd: () => void
}

export function BenchHeader({
  title,
  watchlistCount,
  criteria,
  criteriaUnloadable,
  staleQuoteTime,
  marketStatus,
  addOpen,
  onOpenCriteria,
  onRefresh,
  onToggleAdd
}: BenchHeaderProps): React.JSX.Element {
  return (
    <>
      <PageHeader
        left={
          <div className="flex items-center gap-[10px]">
            <h1 className="m-0 text-sm font-semibold text-wb-text-primary">{title}</h1>
            <Badge data-testid="bench-count">{watchlistCount}</Badge>
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
            <Button
              data-testid="bench-criteria"
              size="sm"
              variant="outline"
              disabled={criteriaUnloadable}
              onClick={onOpenCriteria}
              className={HEADER_BUTTON}
            >
              Screening criteria
            </Button>
            <Button
              data-testid="bench-refresh"
              size="sm"
              variant="outline"
              onClick={onRefresh}
              className={HEADER_BUTTON}
            >
              ↻ Refresh
            </Button>
            <Button
              data-testid="bench-add-toggle"
              size="sm"
              aria-expanded={addOpen}
              onClick={onToggleAdd}
              className="border border-wb-gold-border bg-wb-gold-dim font-wb-mono text-wb-gold hover:bg-wb-gold-dim"
            >
              + Add stock
            </Button>
            <MarketStatusPill state={marketStatus} />
          </div>
        }
      />
      {(criteria || staleQuoteTime) && (
        <div className="flex shrink-0 items-center gap-3 border-b border-wb-border bg-wb-bg-surface px-6 py-3">
          {criteria && <ScreenerCriteriaStrip criteria={criteria} onClick={onOpenCriteria} />}
          {staleQuoteTime && (
            <span
              data-testid="screener-stale-caption"
              className="ml-auto shrink-0 font-wb-mono text-[0.7rem] text-wb-gold"
            >
              quoted {staleQuoteTime}
            </span>
          )}
        </div>
      )}
    </>
  )
}
