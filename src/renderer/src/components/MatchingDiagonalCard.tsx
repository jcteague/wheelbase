import type { PmccScreenerCandidate } from '../api/pmcc-screener'
import { fmtMoney, fmtMoneyGrouped } from '../lib/format'
import {
  fmtDelta,
  fmtLongDate,
  fmtOpenInterest,
  fmtRatioPercent,
  fmtScore,
  fmtSpread,
  fmtYieldPercent
} from '../lib/screener-format'
import { SectionCard } from './ui/SectionCard'

// [US-110] The diagonal the PMCC lens would open on this stock: the two legs, then what the
// pair costs and pays. Everything shown is the engine's own arithmetic, formatted — the
// renderer never recomputes a debit or a yield it was handed.
//
// No Review trade: the handoff into the PMCC entry form is US-122, so this card carries
// no action yet.

type Leg = PmccScreenerCandidate['long']

type MatchingDiagonalCardProps = {
  candidate: PmccScreenerCandidate
}

// Sky is the HOLDING_SHARES colour — the LEAPS stands in for shares; violet is the CC_OPEN
// colour of the call sold against them.
const LEG_TAG = {
  long: { label: 'LEAPS · BUY', tint: 'border-wb-sky/30 bg-wb-sky/10 text-wb-sky' },
  short: { label: 'SHORT · SELL', tint: 'border-wb-violet/30 bg-wb-violet-dim text-wb-violet' }
} as const

/** Unknown, not zero: extrinsic needs the underlying's price, which may be missing. */
function orDash(value: string | null, format: (value: string) => string): string {
  return value === null ? '—' : format(value)
}

/** Label → value, in the order a trader checks them: what it costs, what it pays, then
 *  how much of the LEAPS's time value each cycle buys back. */
const METRICS: ReadonlyArray<[string, (c: PmccScreenerCandidate) => string]> = [
  ['Net debit / share', (c) => fmtMoney(c.netDebit)],
  ['Per spread', (c) => fmtMoneyGrouped(c.capitalAtRisk)],
  ['Strike width', (c) => fmtMoney(c.strikeWidth)],
  ['Debit / width', (c) => fmtRatioPercent(c.debitToWidthPercent)],
  ['Cycle yield', (c) => fmtYieldPercent(c.cycleYield)],
  ['Annualized', (c) => `${fmtYieldPercent(c.annualizedYield)}/yr`],
  ['Extrinsic in LEAPS', (c) => orDash(c.longExtrinsic, fmtMoney)],
  ['Recovered per cycle', (c) => orDash(c.extrinsicCoverage, fmtYieldPercent)],
  ['Short Δ', (c) => fmtDelta(c.short.delta)]
]

function LegRow({ role, leg }: { role: keyof typeof LEG_TAG; leg: Leg }): React.JSX.Element {
  const tag = LEG_TAG[role]
  return (
    <div
      data-testid={`bench-leg-${role}`}
      className="flex flex-col gap-1 rounded-md border border-wb-border-subtle bg-wb-bg-elevated px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span
            className={`rounded border px-1.5 py-px font-wb-mono text-[0.6rem] font-bold tracking-[0.08em] ${tag.tint}`}
          >
            {tag.label}
          </span>
          <span className="font-wb-mono text-lg">{fmtMoney(leg.strike)} CALL</span>
        </span>
        <span className="text-sm text-wb-text-secondary">
          {fmtLongDate(leg.expiration)} · {leg.dte} DTE
        </span>
      </div>
      <div className="font-wb-mono text-[11px] text-wb-text-secondary">
        {`mark ${fmtMoney(leg.mark)} · Δ ${fmtDelta(leg.delta)} · OI ${fmtOpenInterest(leg.openInterest)} · spread ${fmtSpread(leg.spreadAbsolute, leg.spreadPercent)}`}
      </div>
    </div>
  )
}

export function MatchingDiagonalCard({ candidate }: MatchingDiagonalCardProps): React.JSX.Element {
  return (
    <SectionCard header="Matching diagonal · best score for this stock">
      <div data-testid="bench-detail-diagonal" className="flex flex-col gap-4 p-4">
        <LegRow role="long" leg={candidate.long} />
        <LegRow role="short" leg={candidate.short} />
        <dl data-testid="bench-diagonal-metrics" className="m-0 grid grid-cols-3 gap-4">
          {METRICS.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-wb-text-muted">{label}</dt>
              <dd className="m-0 mt-1 font-wb-mono text-sm">{value(candidate)}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-xs text-wb-text-muted">
          {`Net debit uses marks, before fees. Under 100% of width, the strike width covers the debit if the short call is assigned. Cycle yield = short mark ÷ net debit. Ranked by annualized cycle yield ÷ short Δ: ${fmtScore(candidate.returnPerDelta)}.`}
        </p>
      </div>
    </SectionCard>
  )
}
