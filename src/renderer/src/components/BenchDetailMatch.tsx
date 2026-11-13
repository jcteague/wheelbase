import type { PmccScreenerCandidate } from '../api/pmcc-screener'
import type { ScreenerCandidate } from '../api/screener'
import type { BenchStock } from '../lib/bench'
import { fmtDate, fmtMoney } from '../lib/format'
import { fmtLongDate, fmtYieldPercent } from '../lib/screener-format'
import { MatchingDiagonalCard } from './MatchingDiagonalCard'
import { MatchingPutCard } from './MatchingPutCard'
import { AlertBox } from './ui/AlertBox'

// [US-96] The foot of the detail panel: either the contract on offer, or what is holding
// the stock back — and, when the screener ranked a contract anyway, which one.
//
// [US-110] The lens decides which contract that is. A stock seen through the wheel lens
// carries a put and a Review trade handoff; through the PMCC lens it carries a diagonal and
// no handoff (that is US-122). The union keeps the two from crossing: there is no PMCC
// stock with a put, and no Review trade without a put to review.

export type BenchDetailLens =
  | {
      strategy: 'WHEEL'
      stock: BenchStock<ScreenerCandidate>
      onReview: (candidate: ScreenerCandidate) => void
    }
  | { strategy: 'PMCC'; stock: BenchStock<PmccScreenerCandidate> }

type Contract = { card: React.JSX.Element; heldBack: string }

// Points back at the reason rather than restating one: the held-back line renders for any
// held-back stock, so naming a specific gate here would be a guess that contradicts the
// box directly above it whenever the guess is wrong.
const HELD_BACK = 'but is held back by the entry conditions above.'

/** The contract the screener ranked for this stock, or null when it ranked none. */
function contractFor(lens: BenchDetailLens): Contract | null {
  if (lens.strategy === 'WHEEL') {
    const put = lens.stock.candidate
    if (put === null) return null
    return {
      card: <MatchingPutCard candidate={put} onReview={lens.onReview} />,
      heldBack: `A qualifying put exists (${fmtMoney(put.strike)} · ${fmtDate(put.expiration)} · ${fmtYieldPercent(put.periodYield)} yield) ${HELD_BACK}`
    }
  }
  const diagonal = lens.stock.candidate
  if (diagonal === null) return null
  return {
    card: <MatchingDiagonalCard candidate={diagonal} />,
    heldBack: `A qualifying diagonal exists (${fmtMoney(diagonal.long.strike)} LEAPS · ${fmtMoney(diagonal.short.strike)} short · ${fmtLongDate(diagonal.short.expiration)} · ${fmtYieldPercent(diagonal.cycleYield)} on debit) ${HELD_BACK}`
  }
}

export function BenchDetailMatch(lens: BenchDetailLens): React.JSX.Element {
  const { rank, reason } = lens.stock
  const contract = contractFor(lens)
  if (rank !== null && contract !== null) return contract.card

  return (
    <div className="flex flex-col gap-3">
      <AlertBox variant="warning" data-testid="bench-detail-waiting">
        {`${reason}. This stock stays on your watchlist while you wait.`}
      </AlertBox>
      {contract !== null && (
        <p
          data-testid="bench-detail-held-back"
          className="m-0 text-xs leading-relaxed text-wb-text-muted"
        >
          {contract.heldBack}
        </p>
      )}
    </div>
  )
}
