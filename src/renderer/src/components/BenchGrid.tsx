import type { ScreenerCandidate } from '../api/screener'
import { type Bench, defaultSelection } from '../lib/bench'
import { BenchDetail } from './BenchDetail'
import { BenchSection } from './BenchSection'
import { ScreenerStateCard } from './ScreenerStateCard'
import { AlertBox } from './ui/AlertBox'
import { SectionCard } from './ui/SectionCard'

// [US-96] The bench itself: the two sections of cards beside the sticky detail panel.
//
// Each section owns the message it shows when it is empty, because "nothing meets your
// criteria" and "nothing is waiting" are answers to different questions — the first is a
// prompt to loosen the screen, the second is simply good news.

type BenchGridProps = {
  bench: Bench
  /** The ticker the trader last clicked, or null while they have clicked nothing. */
  selected: string | null
  onSelect: (ticker: string) => void
  onRemove: (ticker: string) => void
  onReview: (candidate: ScreenerCandidate) => void
  /** Loosening the screen is the way out of an empty Meets section, so that empty state
   *  carries the same entry point into the sheet as the header — and the same disabled rule. */
  onAdjustCriteria: () => void
  criteriaUnloadable: boolean
  /** False when the provider was unreachable, so no screen ran. An empty Meets section then
   *  means "we could not look", not "we looked and found nothing". */
  screened: boolean
}

export function BenchGrid({
  bench,
  selected,
  onSelect,
  onRemove,
  onReview,
  onAdjustCriteria,
  criteriaUnloadable,
  screened
}: BenchGridProps): React.JSX.Element {
  const stocks = [...bench.meets, ...bench.waiting]
  // A stock the trader removed takes its selection with it, so the panel falls back to
  // the bench's own default rather than emptying out.
  const current =
    stocks.find((stock) => stock.ticker === selected) ??
    stocks.find((stock) => stock.ticker === defaultSelection(bench)) ??
    null

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
          selected={current?.ticker ?? null}
          onSelect={onSelect}
          onRemove={onRemove}
          empty={
            // Only a screen that actually ran can say the criteria are the reason. After an
            // outage the same card would invent a verdict — and send the trader off to
            // loosen a delta band that never rejected anything.
            screened ? (
              <ScreenerStateCard
                data-testid="screener-empty"
                tone="neutral"
                title="No candidates match your criteria"
                body="Every strike on your watchlist was filtered out. Loosen your delta band or DTE window."
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
          selected={current?.ticker ?? null}
          onSelect={onSelect}
          onRemove={onRemove}
          empty={
            <AlertBox variant="info">Nothing waiting — every saved stock meets criteria.</AlertBox>
          }
        />
      </div>
      <div data-testid="bench-detail-panel" className="xl:sticky xl:top-4">
        <SectionCard>
          {current !== null && <BenchDetail stock={current} onReview={onReview} />}
        </SectionCard>
        <p className="mt-3 text-xs leading-relaxed text-wb-text-muted">
          Select a stock to see its thesis, condition checks, IV-reading status, and matching
          contract here.
        </p>
      </div>
    </div>
  )
}
