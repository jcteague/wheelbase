import type { EarningsDisplay, Gate } from '../api/watchlist'
import type { ScreenerCandidate } from '../api/screener'
import type { BenchStock } from '../lib/bench'
import { benchConditions } from '../lib/bench-conditions'
import { dayChange, type DayChange } from '../lib/day-change'
import { fmtDate, fmtMoney } from '../lib/format'
import { fmtYieldPercent } from '../lib/screener-format'
import { GateBadge, type DecidedGate } from './GateBadge'
import { IvrCell } from './IvrCell'
import { MatchingPutCard } from './MatchingPutCard'
import { ReadingNote } from './ReadingNote'
import { AlertBox } from './ui/AlertBox'
import { Badge } from './ui/Badge'

// [US-96] The sticky panel beside the bench, per the mockup's `StockDetail`.
//
// It answers one question — why is this stock where it is? — in the order a trader asks
// it: what the market is doing, whether the reading behind the IV verdict can be trusted,
// what they said they were waiting for, and then either the contract on offer or what is
// holding it back.

type BenchDetailProps = {
  stock: BenchStock
  onReview: (candidate: ScreenerCandidate) => void
}

const HEADING = 'mb-2 text-xs font-semibold uppercase tracking-widest text-wb-text-muted'

const CHANGE_TONE: Record<DayChange['direction'], string> = {
  up: 'text-wb-green',
  down: 'text-wb-red',
  flat: 'text-wb-text-secondary'
}

type GateEntry = { testId: string; condition: string; gate: DecidedGate }

type MaybeGateEntry = { testId: string; condition: string | null; gate: Gate }

/** The gates worth rendering: one per condition the trader actually set. A `none` gate
 *  and a missing condition always coincide, so either test alone would do — both are
 *  checked so a mismatch shows up as a missing badge rather than an empty one. */
function gateEntries(entries: MaybeGateEntry[]): GateEntry[] {
  return entries.filter(
    (entry): entry is GateEntry => entry.condition !== null && entry.gate.verdict !== 'none'
  )
}

/** How near the print is, in the words a trader would use. */
function countdown(daysUntil: number): string {
  if (daysUntil === 0) return 'today'
  return `in ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`
}

/** The earnings line. A date we could not confirm is a caution, not silence: an unpriced
 *  print is exactly the risk the line exists to surface. */
function earningsLine(earnings: EarningsDisplay): { text: string; caution: boolean } {
  if (earnings.kind === 'unknown') return { text: 'Unknown · needs verification', caution: true }
  if (!earnings.withinWindow) return { text: fmtDate(earnings.date), caution: false }

  return { text: `${fmtDate(earnings.date)} · ${countdown(earnings.daysUntil)}`, caution: true }
}

export function BenchDetail({ stock, onReview }: BenchDetailProps): React.JSX.Element {
  const { ticker, row, candidate, rank, reason, verdictCopy } = stock
  const { entry, quote, ivRank, earnings, verdict } = row
  const meets = rank !== null
  const conditions = benchConditions(entry)
  const change = dayChange(quote)
  const gates = gateEntries([
    { testId: 'bench-gate-price', condition: conditions.price, gate: verdict.price },
    { testId: 'bench-gate-iv', condition: conditions.iv, gate: verdict.iv },
    { testId: 'bench-gate-earnings', condition: conditions.earnings, gate: verdict.earnings }
  ])
  const line = earningsLine(earnings)

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 font-wb-mono text-xs tracking-widest text-wb-text-muted">
            STOCK DETAIL
          </p>
          <h3
            data-testid="bench-detail-ticker"
            className="m-0 mt-2 font-wb-mono text-3xl font-semibold text-wb-gold"
          >
            {ticker}
          </h3>
          {verdictCopy !== null && (
            <p
              data-testid="bench-detail-verdict"
              className="m-0 mt-1 text-sm text-wb-text-secondary"
            >
              {verdictCopy}
            </p>
          )}
        </div>
        <Badge color={meets ? 'var(--wb-green)' : undefined}>
          {meets ? 'Meets criteria' : 'Watching'}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-md bg-wb-bg-elevated p-4">
        <div>
          <p className="m-0 text-xs text-wb-text-muted">Last price</p>
          <p data-testid="bench-last-price" className="m-0 mt-1 font-wb-mono text-lg">
            {quote === null ? '—' : fmtMoney(quote.price)}
          </p>
        </div>
        <div>
          <p className="m-0 text-xs text-wb-text-muted">Day change</p>
          <p
            data-testid="bench-day-change"
            data-direction={change?.direction}
            className={`m-0 mt-1 font-wb-mono text-lg ${change === null ? 'text-wb-text-muted' : CHANGE_TONE[change.direction]}`}
          >
            {change?.percent ?? '—'}
          </p>
        </div>
        <div>
          <p className="m-0 text-xs text-wb-text-muted">IV rank</p>
          <p className="m-0 mt-1 font-wb-mono text-lg">
            <IvrCell ivRank={ivRank} />
          </p>
        </div>
      </div>

      <ReadingNote ticker={ticker} ivRank={ivRank} ivrTrigger={entry.ivrTrigger} />

      <div>
        <h4 className={HEADING}>Your thesis</h4>
        <p
          data-testid="bench-detail-thesis"
          className="m-0 text-sm leading-relaxed text-wb-text-secondary"
        >
          {entry.notes ?? 'No thesis yet.'}
        </p>
      </div>

      <div>
        <h4 className={HEADING}>Entry conditions</h4>
        <div className="flex flex-wrap gap-2">
          {gates.map(({ testId, condition, gate }) => (
            <GateBadge key={testId} testId={testId} condition={condition} gate={gate} />
          ))}
          {conditions.tags.map((tag) => (
            <span
              key={tag}
              data-testid="watchlist-tag"
              className="rounded border border-wb-border-subtle px-1.5 py-px text-[0.62rem] text-wb-text-secondary"
            >
              {tag}
            </span>
          ))}
          {gates.length === 0 && conditions.tags.length === 0 && (
            <Badge>No personal conditions</Badge>
          )}
        </div>
      </div>

      <div className="flex justify-between gap-3 text-xs">
        <span className="text-wb-text-muted">Earnings</span>
        {/* Gold carries the caution on screen; `data-tone` is only the hook that lets a test
            read it. The attribute alone would leave a near print looking like a distant one. */}
        <span
          data-testid="bench-detail-earnings"
          data-tone={line.caution ? 'caution' : undefined}
          className={line.caution ? 'text-wb-gold' : undefined}
        >
          {line.text}
        </span>
      </div>

      {meets && candidate !== null ? (
        <MatchingPutCard candidate={candidate} onReview={onReview} />
      ) : (
        <div className="flex flex-col gap-3">
          <AlertBox variant="warning" data-testid="bench-detail-waiting">
            {`${reason}. This stock stays on your watchlist while you wait.`}
          </AlertBox>
          {candidate !== null && (
            <p
              data-testid="bench-detail-held-back"
              className="m-0 text-xs leading-relaxed text-wb-text-muted"
            >
              {/* Points back at the reason rather than restating one: this line renders for
                  any held-back stock, so naming a specific gate here would be a guess that
                  contradicts the box directly above it whenever the guess is wrong. */}
              {`A qualifying put exists (${fmtMoney(candidate.strike)} · ${fmtDate(candidate.expiration)} · ${fmtYieldPercent(candidate.periodYield)} yield) but is held back by the entry conditions above.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
