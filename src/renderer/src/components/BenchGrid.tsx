import type { PmccScreenerCandidate } from '../api/pmcc-screener'
import type { ScreenerCandidate } from '../api/screener'
import { type Bench, type BenchCandidate, type BenchStock, defaultSelection } from '../lib/bench'
import { BenchDetail } from './BenchDetail'
import type { BenchDetailLens } from './BenchDetailMatch'
import { BenchSection } from './BenchSection'
import { type CardSummary, PMCC_CARD_SUMMARY, WHEEL_CARD_SUMMARY } from './bench-card-summary'
import { WatchlistEntryForm } from './WatchlistEntryForm'
import { ScreenerStateCard } from './ScreenerStateCard'
import { AlertBox } from './ui/AlertBox'
import { SectionCard } from './ui/SectionCard'

// [US-96] The bench itself: the two sections of cards beside the sticky detail panel.
//
// Each section owns the message it shows when it is empty, because "nothing meets your
// criteria" and "nothing is waiting" are answers to different questions — the first is a
// prompt to loosen the screen, the second is simply good news.
//
// [US-69] The panel is one slot holding either the read view or the entry form. Which one
// is derived from `editing === current.ticker`, never stored separately, so leaving a
// stock cannot leave a form open over another stock's detail.
//
// [US-110] The grid serves both lenses. `BenchGrid` narrows the lens once — which card
// summary, which empty copy, which detail — and everything below is generic over the
// candidate, so a PMCC bench can never be summarised as puts or offered a Review trade.

/** The bench through one lens. Review trade exists only for the wheel's put; the PMCC
 *  handoff is US-122. */
export type BenchGridLens =
  | {
      strategy: 'WHEEL'
      bench: Bench<ScreenerCandidate>
      onReview: (candidate: ScreenerCandidate) => void
    }
  | { strategy: 'PMCC'; bench: Bench<PmccScreenerCandidate> }

type SharedProps = {
  /** The ticker the trader last clicked, or null while they have clicked nothing. */
  selected: string | null
  onSelect: (ticker: string) => void
  onRemove: (ticker: string) => void
  /** Loosening the screen is the way out of an empty Meets section, so that empty state
   *  carries the same entry point into the sheet as the header — and the same disabled rule. */
  onAdjustCriteria: () => void
  criteriaUnloadable: boolean
  /** False when the provider was unreachable, so no screen ran. An empty Meets section then
   *  means "we could not look", not "we looked and found nothing". */
  screened: boolean
  /** The ticker whose entry form is open, or null while the panel shows the read view. */
  editing: string | null
  onEdit: (ticker: string) => void
  /** Saved or cancelled — either way the panel goes back to the read view. */
  onEditDone: () => void
}

type EmptyCopy = { title: string; body: string }

type LayoutProps<C extends BenchCandidate> = SharedProps & {
  bench: Bench<C>
  summary: CardSummary<C>
  /** What the Meets section says when a screen ran and nothing cleared it. */
  emptyCopy: EmptyCopy
  /** The detail panel's view of a stock, through this lens. */
  detailLens: (stock: BenchStock<C>) => BenchDetailLens
}

const WHEEL_EMPTY: EmptyCopy = {
  title: 'No candidates match your criteria',
  body: 'Every strike on your watchlist was filtered out. Loosen your delta band or DTE window.'
}

const PMCC_EMPTY: EmptyCopy = {
  title: 'No diagonals match your PMCC criteria',
  body: 'Every LEAPS and short-call pair on your watchlist was filtered out. Loosen a delta band, a DTE window, or the debit-to-width limit.'
}

export function BenchGrid(props: BenchGridLens & SharedProps): React.JSX.Element {
  if (props.strategy === 'WHEEL') {
    const { onReview } = props
    return (
      <BenchLayout
        {...props}
        summary={WHEEL_CARD_SUMMARY}
        emptyCopy={WHEEL_EMPTY}
        detailLens={(stock) => ({ strategy: 'WHEEL', stock, onReview })}
      />
    )
  }
  return (
    <BenchLayout
      {...props}
      summary={PMCC_CARD_SUMMARY}
      emptyCopy={PMCC_EMPTY}
      detailLens={(stock) => ({ strategy: 'PMCC', stock })}
    />
  )
}

function BenchLayout<C extends BenchCandidate>({
  bench,
  summary,
  emptyCopy,
  detailLens,
  selected,
  onSelect,
  onRemove,
  onAdjustCriteria,
  criteriaUnloadable,
  screened,
  editing,
  onEdit,
  onEditDone
}: LayoutProps<C>): React.JSX.Element {
  const stocks = [...bench.meets, ...bench.waiting]
  // A stock the trader removed takes its selection with it, so the panel falls back to
  // the bench's own default rather than emptying out.
  const current =
    stocks.find((stock) => stock.ticker === selected) ??
    stocks.find((stock) => stock.ticker === defaultSelection(bench)) ??
    null

  // Both sections render the same cards through the same lens; only their stocks and their
  // empty states differ.
  const cards = {
    summary,
    selected: current?.ticker ?? null,
    onSelect,
    onRemove
  }

  return (
    <div
      data-testid="bench-grid"
      className="grid items-start gap-5 xl:grid-cols-[minmax(300px,0.85fr)_minmax(420px,1.15fr)]"
    >
      <div className="flex flex-col gap-6">
        <BenchSection
          title="Meets criteria"
          accent
          stocks={bench.meets}
          {...cards}
          empty={
            // Only a screen that actually ran can say the criteria are the reason. After an
            // outage the same card would invent a verdict — and send the trader off to
            // loosen a delta band that never rejected anything.
            screened ? (
              <ScreenerStateCard
                data-testid="screener-empty"
                tone="neutral"
                title={emptyCopy.title}
                body={emptyCopy.body}
                actionLabel="Adjust criteria"
                onAction={onAdjustCriteria}
                actionDisabled={criteriaUnloadable}
              />
            ) : (
              <AlertBox variant="info">
                Waiting for market data — no screen has run, so nothing can meet criteria yet.
              </AlertBox>
            )
          }
        />
        <BenchSection
          title="Stocks of interest"
          stocks={bench.waiting}
          {...cards}
          empty={
            <AlertBox variant="info">Nothing waiting — every saved stock meets criteria.</AlertBox>
          }
        />
      </div>
      <div data-testid="bench-detail-panel" className="xl:sticky xl:top-4">
        <SectionCard>
          {current !== null &&
            (editing === current.ticker ? (
              // Keyed by ticker so switching stocks remounts the form rather than reusing
              // the previous entry's seeded row toggles.
              <WatchlistEntryForm
                key={current.ticker}
                entry={current.row.entry}
                onSaved={onEditDone}
                onCancel={onEditDone}
              />
            ) : (
              <BenchDetail {...detailLens(current)} onEdit={() => onEdit(current.ticker)} />
            ))}
        </SectionCard>
        <p className="mt-3 text-xs leading-relaxed text-wb-text-muted">
          Select a stock to see its thesis, condition checks, IV-reading status, and matching
          contract here.
        </p>
      </div>
    </div>
  )
}
