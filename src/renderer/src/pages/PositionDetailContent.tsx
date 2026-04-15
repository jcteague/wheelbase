import type { PositionDetail } from '../api/positions'
import { CloseCspForm } from '../components/CloseCspForm'
import { LegHistoryTable } from '../components/LegHistoryTable'
import { Caption } from '../components/ui/Caption'
import { SectionCard } from '../components/ui/SectionCard'
import { StatGrid } from '../components/ui/Stat'
import { computeDte, fmtMoney, pnlColor } from '../lib/format'
import { deriveRunningBasis } from '../lib/deriveRunningBasis'

const DETAIL_OVERLAY_STYLE: React.CSSProperties = {
  filter: 'blur(1.5px)',
  opacity: 0.35,
  pointerEvents: 'none',
  userSelect: 'none'
}

type PositionDetailContentProps = {
  detail: PositionDetail
  overlayOpen: boolean
}

function NoteBlock({ label, text }: { label: string; text: string }): React.JSX.Element {
  return (
    <div>
      <div className="mb-1">
        <Caption>{label}</Caption>
      </div>
      <div className="font-wb-mono text-sm text-wb-text-primary">{text}</div>
    </div>
  )
}

export function PositionDetailContent({
  detail,
  overlayOpen
}: PositionDetailContentProps): React.JSX.Element {
  const { position, activeLeg, costBasisSnapshot, legs, allSnapshots } = detail
  const enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])
  const dte = activeLeg ? computeDte(activeLeg.expiration) : null
  const dteUrgent = dte !== null && dte <= 7

  return (
    <main
      data-testid="position-detail"
      className="flex-1 overflow-y-auto flex flex-col gap-4 p-6"
      style={overlayOpen ? DETAIL_OVERLAY_STYLE : undefined}
    >
      {activeLeg && (
        <SectionCard header="Open Leg">
          <StatGrid
            minWidth={110}
            items={[
              {
                label: 'Strike',
                value: <span className="text-wb-gold">{fmtMoney(activeLeg.strike)}</span>
              },
              { label: 'Expiration', value: activeLeg.expiration },
              {
                label: 'DTE',
                value: (
                  <span className={dteUrgent ? 'text-wb-gold' : ''}>
                    {dte !== null ? `${dte}d` : '—'}
                  </span>
                )
              },
              { label: 'Contracts', value: activeLeg.contracts },
              {
                label: 'Premium / Contract',
                value: (
                  <span className="text-wb-green">{fmtMoney(activeLeg.premiumPerContract)}</span>
                )
              },
              { label: 'Fill Date', value: activeLeg.fillDate }
            ]}
          />
        </SectionCard>
      )}

      {costBasisSnapshot && (
        <SectionCard header="Cost Basis">
          <StatGrid
            minWidth={140}
            items={[
              {
                label: 'Effective Basis / Share',
                value: (
                  <span className="text-wb-sky">{fmtMoney(costBasisSnapshot.basisPerShare)}</span>
                )
              },
              {
                label: 'Premium Collected',
                value: (
                  <span className="text-wb-green">
                    {fmtMoney(costBasisSnapshot.totalPremiumCollected)}
                  </span>
                )
              },
              ...(costBasisSnapshot.finalPnl
                ? [
                    {
                      label: 'Final P&L',
                      value: (
                        <span style={{ color: pnlColor(costBasisSnapshot.finalPnl) }}>
                          {fmtMoney(costBasisSnapshot.finalPnl)}
                        </span>
                      )
                    }
                  ]
                : [])
            ]}
          />
        </SectionCard>
      )}

      {enrichedLegs.length > 0 && (
        <SectionCard header="Leg History">
          <LegHistoryTable legs={enrichedLegs} finalPnl={costBasisSnapshot?.finalPnl ?? null} />
        </SectionCard>
      )}

      {(position.thesis || position.notes) && (
        <SectionCard header="Notes">
          <div className="py-3.5 px-5 flex flex-col gap-2.5">
            {position.thesis && <NoteBlock label="Thesis" text={position.thesis} />}
            {position.notes && <NoteBlock label="Notes" text={position.notes} />}
          </div>
        </SectionCard>
      )}

      {position.phase !== 'CSP_OPEN' && position.closedDate && (
        <div className="py-2.5 px-4 rounded-md bg-wb-green-dim border border-wb-green-border text-wb-text-secondary text-sm font-wb-mono">
          Closed on {position.closedDate}
        </div>
      )}

      {position.phase === 'CSP_OPEN' && activeLeg && (
        <CloseCspForm
          positionId={position.id}
          openPremiumPerContract={activeLeg.premiumPerContract}
          contracts={activeLeg.contracts}
          openFillDate={activeLeg.fillDate}
          expiration={activeLeg.expiration}
        />
      )}
    </main>
  )
}
