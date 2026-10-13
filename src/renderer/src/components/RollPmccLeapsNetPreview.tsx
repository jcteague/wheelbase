// [US-105] The LEAPS roll's net: a dashed placeholder until both cash fields parse, then the net
// debit, credit or even, the roll's label, the post-roll basis, LEAPS cost and the effective share cost
// re-anchored to the replacement strike.
import { parseInputDecimal } from '../lib/decimal-input'
import { fmtMoney } from '../lib/format'
import {
  effectiveCostMove,
  netDirection,
  type NetDirection,
  type PmccLeapsLedger,
  type PmccLeapsPostRoll,
  type PmccRollNet
} from '../lib/pmcc-roll'
import { SectionCard } from './ui/SectionCard'
import { SummaryRow } from './ui/SummaryRow'

type RollPmccLeapsNetPreviewProps = {
  net: PmccRollNet
  /** `null` while the strike is undecided. */
  postRoll: PmccLeapsPostRoll | null
  /** The roll's label with the replacement's DTE; `null` until the roll is valid. */
  label: string | null
  newStrike: string
  /** The current LEAPS strike: a credit that also moves the strike up raises the effective cost. */
  currentStrike: string
  ledger: PmccLeapsLedger
}

const HEADING: Record<NetDirection, string> = {
  debit: 'Net Debit',
  credit: 'Net Credit',
  even: 'Net Even'
}

const TONE: Record<NetDirection, string> = {
  debit: 'text-wb-red',
  credit: 'text-wb-green',
  even: 'text-wb-text-secondary'
}

function tailSentence(direction: NetDirection, newStrike: string, currentStrike: string): string {
  if (direction === 'even') return 'No net cash changed hands.'
  if (direction === 'debit') return 'You are buying time value; it lands in the basis.'
  const strikeUp = parseInputDecimal(newStrike)?.gt(currentStrike) ?? false
  return strikeUp
    ? 'Cash came out, but the strike moved up more than the credit.'
    : 'Cash came out; it lowers the basis.'
}

export function RollPmccLeapsNetPreview({
  net,
  postRoll,
  label,
  newStrike,
  currentStrike,
  ledger
}: RollPmccLeapsNetPreviewProps): React.JSX.Element {
  if (net === null) {
    return (
      <div className="rounded border border-dashed border-wb-border p-4 text-center text-xs text-wb-text-muted">
        Enter the proceeds from close and the replacement debit to preview the net.
      </div>
    )
  }
  const direction = netDirection(net.net)
  return (
    <SectionCard header="Net" headerVariant="emphasized">
      <div className="flex flex-col gap-1.5 p-4">
        <div data-testid="pmcc-leaps-roll-net" className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-wb-text-muted">
            {HEADING[direction]}:
          </span>{' '}
          <span
            data-testid="pmcc-leaps-roll-net-amount"
            className={`text-xl font-semibold ${TONE[direction]}`}
          >
            ${net.perShare}{' '}
            <span className="text-xs font-normal text-wb-text-muted">
              per share (${net.total} total)
            </span>
          </span>
        </div>
        {label ? (
          <div
            data-testid="pmcc-leaps-roll-label"
            className="rounded bg-wb-bg-elevated px-3 py-2 text-[11px] text-wb-text-secondary"
          >
            {label}
          </div>
        ) : null}
        {postRoll ? (
          <>
            <SummaryRow
              label="Cost basis after roll"
              value={`${fmtMoney(postRoll.postBasis)} / share (from ${fmtMoney(ledger.basisPerShare)})`}
            />
            <SummaryRow
              label="LEAPS cost to date after"
              value={`${fmtMoney(postRoll.leapsCostAfter)} / share (from ${fmtMoney(ledger.leapsCostPerShare)})`}
            />
            <SummaryRow
              label="Effective share cost after roll"
              value={`${fmtMoney(postRoll.effectiveAfter)} (from ${fmtMoney(ledger.effectiveShareCost)})`}
              highlight
            />
            <p className="text-[11px] leading-relaxed text-wb-text-muted">
              {fmtMoney(newStrike)} strike + {fmtMoney(postRoll.postBasis)} basis ·{' '}
              {effectiveCostMove(ledger.effectiveShareCost, postRoll.effectiveAfter)}.{' '}
              {tailSentence(direction, newStrike, currentStrike)}
            </p>
          </>
        ) : null}
      </div>
    </SectionCard>
  )
}
