import type { BenchStock } from '../lib/bench'
import { BenchCard } from './BenchCard'
import { Badge } from './ui/Badge'

// [US-96] One half of the bench: a titled, counted list of cards with its own empty
// state. The two halves answer different questions — "what can I sell today?" and "what
// am I still waiting on?" — so each owns the message it shows when it has nothing.

type BenchSectionProps = {
  title: string
  stocks: BenchStock[]
  /** The ticker whose detail panel is open, or null while nothing is selected. */
  selected: string | null
  /** Shown in place of the cards when the section is empty; `BenchGrid` owns the copy,
   *  because only the composing grid knows which section is asking and why. */
  empty: React.ReactNode
  onSelect: (ticker: string) => void
  onRemove: (ticker: string) => void
  /** Green count. Reserved for the section that means "act now". */
  accent?: boolean
}

export function BenchSection({
  title,
  stocks,
  selected,
  empty,
  onSelect,
  onRemove,
  accent = false
}: BenchSectionProps): React.JSX.Element {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-base font-semibold text-wb-text-primary">{title}</h3>
        <Badge data-testid="bench-section-count" color={accent ? 'var(--wb-green)' : undefined}>
          {stocks.length}
        </Badge>
      </div>
      {stocks.length === 0
        ? empty
        : stocks.map((stock) => (
            <BenchCard
              key={stock.ticker}
              stock={stock}
              selected={stock.ticker === selected}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
    </section>
  )
}
