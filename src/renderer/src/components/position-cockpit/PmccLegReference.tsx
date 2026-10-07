import type { LegDetail, PmccOpenLegs } from '../../api/positions'
import { computeDteFromInput, fmtMoney, fmtMoneyGrouped } from '../../lib/format'
import { SectionCard } from '../ui/SectionCard'
import { StatGrid } from '../ui/Stat'

type PmccLegReferenceProps = {
  /** The open LEAPS and short call — after a roll the short is its `ROLL_TO` leg. */
  openLegs: PmccOpenLegs
  /** Computed by getPosition from both opening legs; null when it could not be derived. */
  initialNetDebit: string | null
}

function dteLabel(expiration: string): string {
  const dte = computeDteFromInput(expiration)
  return dte === null ? '—' : `${dte}d`
}

function LegCard({ header, leg }: { header: string; leg: LegDetail }): React.JSX.Element {
  return (
    <SectionCard header={header}>
      <StatGrid
        minWidth={120}
        items={[
          { label: 'Strike', value: <span className="text-wb-gold">{fmtMoney(leg.strike)}</span> },
          { label: 'Expiration', value: leg.expiration },
          { label: 'DTE', value: dteLabel(leg.expiration) },
          { label: 'Contracts', value: leg.contracts },
          { label: 'Actual fill', value: fmtMoney(leg.premiumPerContract) },
          { label: 'Fill date', value: leg.fillDate },
          { label: 'Fees', value: fmtMoney(leg.fees) }
        ]}
      />
    </SectionCard>
  )
}

/**
 * The minimal PMCC detail: the open LEAPS and short call plus the initial net debit.
 * No verdict or live P&L — PMCC valuation (US-118) replaces this view.
 * Returns a fragment: the caller owns the surrounding stack.
 */
export function PmccLegReference({
  openLegs,
  initialNetDebit
}: PmccLegReferenceProps): React.JSX.Element {
  return (
    <>
      <LegCard header="Buy LEAPS call" leg={openLegs.long} />
      {openLegs.short ? <LegCard header="Sell short call" leg={openLegs.short} /> : null}
      <SectionCard>
        <StatGrid
          minWidth={160}
          items={[
            {
              label: 'Initial net debit',
              value: initialNetDebit ? fmtMoneyGrouped(initialNetDebit) : '—'
            }
          ]}
        />
        <p className="py-2.5 px-5 border-t border-wb-border font-wb-mono text-xs text-wb-text-muted">
          Live P&amp;L unavailable until PMCC valuation ships
        </p>
      </SectionCard>
    </>
  )
}
