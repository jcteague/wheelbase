import type { LegDetail } from '../../api/positions'
import { computeDteFromInput, fmtMoney, fmtMoneyGrouped } from '../../lib/format'
import { LEG_ROLE_LABEL } from '../../lib/phase'
import { SectionCard } from '../ui/SectionCard'
import { StatGrid } from '../ui/Stat'

type PmccLegReferenceProps = {
  legs: LegDetail[]
  /** Computed by getPosition from both opening legs; null when it could not be derived. */
  initialNetDebit: string | null
}

const PMCC_LEG_ROLES = ['LEAPS_OPEN', 'SHORT_CALL_OPEN'] as const

function dteLabel(expiration: string): string {
  const dte = computeDteFromInput(expiration)
  return dte === null ? '—' : `${dte}d`
}

function LegCard({ leg }: { leg: LegDetail }): React.JSX.Element {
  return (
    <SectionCard header={LEG_ROLE_LABEL[leg.legRole]}>
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
 * The minimal PMCC detail: both opening legs as recorded plus the initial net debit.
 * No verdict or live P&L — PMCC valuation (US-118) replaces this view.
 */
export function PmccLegReference({
  legs,
  initialNetDebit
}: PmccLegReferenceProps): React.JSX.Element {
  const [leaps, short] = PMCC_LEG_ROLES.map((role) => legs.find((leg) => leg.legRole === role))
  const pmccLegs = [leaps, short].filter((leg): leg is LegDetail => leg !== undefined)

  return (
    <div className="flex flex-col gap-3">
      {pmccLegs.map((leg) => (
        <LegCard key={leg.id} leg={leg} />
      ))}
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
    </div>
  )
}
