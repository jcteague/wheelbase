import type { PositionDetail } from '../api/positions'
import { CloseCspForm } from '../components/CloseCspForm'
import { LegHistoryTable } from '../components/LegHistoryTable'
import { Caption } from '../components/ui/Caption'
import { SectionCard } from '../components/ui/SectionCard'
import { StatGrid } from '../components/ui/Stat'
import { computeDte, fmtMoney, pnlColor } from '../lib/format'
import { MONO } from '../lib/tokens'

const DETAIL_BASE_STYLE: React.CSSProperties = {
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  transition: 'filter 0.2s, opacity 0.2s'
}

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

export function PositionDetailContent({
  detail,
  overlayOpen
}: PositionDetailContentProps): React.JSX.Element {
  const { position, activeLeg, costBasisSnapshot, legs } = detail
  const dte = activeLeg ? computeDte(activeLeg.expiration) : null
  const dteUrgent = dte !== null && dte <= 7

  return (
    <main
      data-testid="position-detail"
      style={{
        ...DETAIL_BASE_STYLE,
        ...(overlayOpen ? DETAIL_OVERLAY_STYLE : {})
      }}
    >
      {activeLeg && (
        <SectionCard header="Open Leg">
          <StatGrid
            minWidth={110}
            items={[
              {
                label: 'Strike',
                value: <span style={{ color: 'var(--wb-gold)' }}>{fmtMoney(activeLeg.strike)}</span>
              },
              { label: 'Expiration', value: activeLeg.expiration },
              {
                label: 'DTE',
                value: (
                  <span style={{ color: dteUrgent ? 'var(--wb-gold)' : 'inherit' }}>
                    {dte !== null ? `${dte}d` : '—'}
                  </span>
                )
              },
              { label: 'Contracts', value: activeLeg.contracts },
              {
                label: 'Premium / Contract',
                value: (
                  <span style={{ color: 'var(--wb-green)' }}>
                    {fmtMoney(activeLeg.premiumPerContract)}
                  </span>
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
                  <span style={{ color: 'var(--wb-sky)' }}>
                    {fmtMoney(costBasisSnapshot.basisPerShare)}
                  </span>
                )
              },
              {
                label: 'Premium Collected',
                value: (
                  <span style={{ color: 'var(--wb-green)' }}>
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

      {legs.length > 0 && (
        <SectionCard header="Leg History">
          <LegHistoryTable legs={legs} />
        </SectionCard>
      )}

      {(position.thesis || position.notes) && (
        <SectionCard header="Notes">
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {position.thesis && (
              <div>
                <div style={{ marginBottom: 4 }}>
                  <Caption>Thesis</Caption>
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: '0.875rem',
                    color: 'var(--wb-text-primary)'
                  }}
                >
                  {position.thesis}
                </div>
              </div>
            )}
            {position.notes && (
              <div>
                <div style={{ marginBottom: 4 }}>
                  <Caption>Notes</Caption>
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: '0.875rem',
                    color: 'var(--wb-text-primary)'
                  }}
                >
                  {position.notes}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
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

      {position.phase !== 'CSP_OPEN' && position.closedDate && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 6,
            background: 'var(--wb-green-dim)',
            border: '1px solid rgba(63,185,80,0.2)',
            color: 'var(--wb-text-secondary)',
            fontSize: '0.8125rem',
            fontFamily: MONO
          }}
        >
          Closed on {position.closedDate}
        </div>
      )}
    </main>
  )
}
