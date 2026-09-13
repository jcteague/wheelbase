import type { ScreenerCandidate } from '../api/screener'
import { fmtDate, fmtMoney } from '../lib/format'
import { fmtDelta, fmtOpenInterest, fmtSpread, fmtYieldPercent } from '../lib/screener-format'
import { SectionCard } from './ui/SectionCard'
import { Button } from './ui/button'

// [US-96] The put the screener would sell on this stock today, and the handoff into the
// pre-filled new-wheel form. Everything shown is the engine's own arithmetic, formatted —
// the renderer never recomputes a yield or a spread it was handed.

type MatchingPutCardProps = {
  candidate: ScreenerCandidate
  onReview: (candidate: ScreenerCandidate) => void
}

/** Label → value, in the order a trader checks them: what it pays, then what it costs
 *  in risk and liquidity. */
const METRICS: ReadonlyArray<[string, (candidate: ScreenerCandidate) => string]> = [
  ['Mark / share', (c) => fmtMoney(c.mark)],
  ['Period yield', (c) => fmtYieldPercent(c.periodYield)],
  ['Annualized', (c) => `${fmtYieldPercent(c.annualizedYield)}/yr`],
  ['Delta', (c) => fmtDelta(c.delta)],
  ['Open interest', (c) => fmtOpenInterest(c.openInterest)],
  ['Spread', (c) => fmtSpread(c.spreadAbsolute, c.spreadPercent)]
]

export function MatchingPutCard({ candidate, onReview }: MatchingPutCardProps): React.JSX.Element {
  return (
    <SectionCard header="Matching put · best score for this stock">
      <div data-testid="bench-detail-put" className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-wb-mono text-xl">{fmtMoney(candidate.strike)} PUT</span>
          <span className="text-sm text-wb-text-secondary">
            {fmtDate(candidate.expiration)} · {candidate.dte} DTE
          </span>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-4">
          {METRICS.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-wb-text-muted">{label}</dt>
              <dd className="m-0 mt-1 font-wb-mono text-sm">{value(candidate)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-wb-text-muted">
          {`Cash to secure 1 contract: ${fmtMoney(candidate.capitalSecured)}. Yield uses mark ÷ strike, before fees.`}
        </p>
        <Button
          size="sm"
          data-testid={`bench-review-${candidate.ticker}`}
          onClick={() => onReview(candidate)}
          className="self-start border border-wb-gold-border bg-wb-gold-dim font-wb-mono text-wb-gold hover:bg-wb-gold-dim"
        >
          Review trade →
        </Button>
      </div>
    </SectionCard>
  )
}
