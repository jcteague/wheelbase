import type { BenchStock } from '../lib/bench'
import { benchConditions } from '../lib/bench-conditions'
import { fmtDate, fmtMoney } from '../lib/format'
import { fmtScore, fmtYieldPercent } from '../lib/screener-format'
import { EarningsBadge } from './EarningsBadge'
import { IvrCell } from './IvrCell'
import { SectionCard } from './ui/SectionCard'
import { Button } from './ui/button'

// [US-96] One watchlist stock as a card on the bench, per mockup concept B.
//
// The card is the whole watchlist row now: it keeps every US-63 e2e seam
// (`watchlist-row-{t}`, `watchlist-ticker`, `watchlist-remove-{t}`) so the specs written
// against the table keep working, and adds what the table never had — a price, an IV
// reading with its age, and either the put on offer or the reason there is none.
//
// The whole card selects the stock, not just the ticker. The card is deliberately *not*
// a button or given `role="button"`: it contains real buttons, and nesting interactive
// roles is invalid ARIA that leaves a screen reader unsure what it is announcing. The
// ticker button stays the keyboard path — it carries the accessible name and
// `aria-pressed`, and its click bubbles here like any other — so pointer users get the
// whole surface without costing keyboard users the semantics.

/** [US-70] The rank pill, and the muted treatment a demoted candidate falls back to. */
const RANK_PILL =
  'inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-[5px] bg-wb-gold-dim text-wb-gold text-[0.68rem] font-bold'
const DEMOTED_RANK = 'font-wb-mono text-[0.72rem] text-wb-text-muted'

type BenchCardProps = {
  stock: BenchStock
  selected: boolean
  onSelect: (ticker: string) => void
  onRemove: (ticker: string) => void
}

export function BenchCard({
  stock,
  selected,
  onSelect,
  onRemove
}: BenchCardProps): React.JSX.Element {
  const { ticker, row, candidate, rank, reason } = stock
  // A rank is exactly what a stock gets for clearing both halves, so it is also what
  // decides which section the card sits in and which second line it shows.
  const meets = rank !== null
  // [US-70] A demoted candidate gives up its rank number: the number would claim a
  // standing among the clean candidates that its earnings tier explicitly denies it.
  const demoted = candidate !== null && candidate.earnings.status !== 'clear'
  const conditions = benchConditions(row.entry)
  const conditionText = [conditions.price, conditions.iv, conditions.earnings]
    .filter((condition): condition is string => condition !== null)
    .join(' · ')

  return (
    <SectionCard className={selected ? 'ring-1 ring-wb-gold' : undefined}>
      <div
        data-testid={`watchlist-row-${ticker}`}
        data-bench-section={meets ? 'meets' : 'waiting'}
        onClick={() => onSelect(ticker)}
        className="relative flex cursor-pointer flex-col gap-2 p-4"
      >
        <button
          type="button"
          title="Remove"
          data-testid={`watchlist-remove-${ticker}`}
          // Remove is the one control here that means something else. Without this the
          // click would also select, leaving the detail panel on a stock just deleted.
          onClick={(event) => {
            event.stopPropagation()
            onRemove(ticker)
          }}
          className="absolute right-3 top-3 h-6 w-6 rounded-md border border-wb-border bg-transparent text-wb-text-muted"
        >
          ✕
        </button>

        <div className="flex items-center justify-between gap-2 pr-8">
          <span className="flex items-center gap-2">
            {meets && (
              <span
                data-testid="watchlist-rank"
                title={candidate === null ? undefined : fmtScore(candidate.yieldPerDelta)}
                className={demoted ? DEMOTED_RANK : RANK_PILL}
              >
                {demoted ? '—' : `#${rank}`}
              </span>
            )}
            {/* No `onClick` of its own: the click it raises — by pointer, or by Enter or
                Space from the keyboard — bubbles to the card, which owns selection. One
                handler, so the two paths cannot drift apart. */}
            <Button
              data-testid="watchlist-ticker"
              variant="link"
              size="sm"
              aria-pressed={selected}
              className="h-auto p-0 font-bold tracking-[0.03em] text-wb-gold"
            >
              {ticker} →
            </Button>
          </span>
          <span data-testid="watchlist-price" className="font-wb-mono text-sm">
            {row.quote === null ? '—' : fmtMoney(row.quote.price)}
          </span>
        </div>

        {meets && candidate !== null ? (
          <p data-testid="watchlist-contract" className="text-xs text-wb-text-secondary">
            {`${fmtMoney(candidate.strike)} put · ${fmtDate(candidate.expiration)} · ${fmtYieldPercent(candidate.periodYield)} yield`}
          </p>
        ) : (
          <p data-testid="watchlist-reason" className="text-xs text-wb-text-secondary">
            {reason}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 text-[11px] text-wb-text-muted">
          {/* The mockup fills this slot with a company name, which nothing in the app can
              supply. The thesis is the better occupant anyway: it is the trader's own
              reason for watching, and the one thing on the card a provider outage cannot
              take away — which is exactly what the outage AC asks the card to keep. */}
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            {meets && conditionText !== '' && <span>{conditionText}</span>}
            {!meets && row.entry.notes !== null && (
              <span data-testid="watchlist-card-thesis" className="truncate">
                {row.entry.notes}
              </span>
            )}
            {candidate !== null && <EarningsBadge earnings={candidate.earnings} />}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-wb-mono">
            IVR <IvrCell ivRank={row.ivRank} />
          </span>
        </div>
      </div>
    </SectionCard>
  )
}
