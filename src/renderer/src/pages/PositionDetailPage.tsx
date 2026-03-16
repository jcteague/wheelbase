import { useState } from 'react'
import { useParams } from 'wouter'
import { CloseCspForm } from '../components/CloseCspForm'
import { ExpirationSheet } from '../components/ExpirationSheet'
import { LegHistoryTable } from '../components/LegHistoryTable'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { PhaseBadge } from '../components/PhaseBadge'
import { ErrorAlert } from '../components/ui/ErrorAlert'
import { LoadingState } from '../components/ui/LoadingState'
import { SectionCard } from '../components/ui/SectionCard'
import { StatGrid } from '../components/ui/Stat'
import { usePosition } from '../hooks/usePosition'
import { computeDte, fmtMoney, pnlColor } from '../lib/format'
import { MONO } from '../lib/tokens'

export function PositionDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { isLoading, isError, data } = usePosition(id)
  const [showExpiration, setShowExpiration] = useState(false)

  if (isLoading) {
    return <LoadingState message="Loading position..." />
  }

  if (isError || !data) {
    return (
      <div style={{ margin: '16px 24px' }}>
        <ErrorAlert message="Failed to load position." />
      </div>
    )
  }

  const { position, activeLeg, costBasisSnapshot, legs } = data
  const dte = activeLeg ? computeDte(activeLeg.expiration) : null
  const dteUrgent = dte !== null && dte <= 7

  return (
    <PageLayout
      header={
        <PageHeader
          left={
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <a
                href="#/"
                className="wb-nav-link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.75rem',
                  textDecoration: 'none',
                  fontFamily: MONO
                }}
              >
                ← Positions
              </a>
              <span style={{ color: 'var(--wb-border)', userSelect: 'none' }}>/</span>
              <span
                style={{
                  fontFamily: MONO,
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  letterSpacing: '0.04em',
                  color: 'var(--wb-text-primary)'
                }}
              >
                {position.ticker}
              </span>
            </div>
          }
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PhaseBadge phase={position.phase} />
              {position.phase === 'CSP_OPEN' && (
                <button
                  data-testid="record-expiration-btn"
                  className="wb-teal-button"
                  onClick={() => setShowExpiration(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 12px',
                    borderRadius: 4,
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    fontFamily: MONO,
                    color: 'var(--wb-teal)',
                    cursor: 'pointer'
                  }}
                >
                  Record Expiration →
                </button>
              )}
            </div>
          }
        />
      }
    >
      <main
        data-testid="position-detail"
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transition: 'filter 0.2s, opacity 0.2s',
          ...(showExpiration
            ? { filter: 'blur(1.5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' }
            : {})
        }}
      >
        {activeLeg && (
          <SectionCard header="Open Leg">
            <StatGrid
              minWidth={110}
              items={[
                {
                  label: 'Strike',
                  value: (
                    <span style={{ color: 'var(--wb-gold)' }}>{fmtMoney(activeLeg.strike)}</span>
                  )
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

        {legs && legs.length > 0 && (
          <SectionCard header="Leg History">
            <LegHistoryTable legs={legs} />
          </SectionCard>
        )}

        {(position.thesis || position.notes) && (
          <SectionCard header="Notes">
            <div
              style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              {position.thesis && (
                <div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--wb-text-muted)',
                      marginBottom: 4
                    }}
                  >
                    Thesis
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
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: '0.6rem',
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--wb-text-muted)',
                      marginBottom: 4
                    }}
                  >
                    Notes
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
      {showExpiration && activeLeg && costBasisSnapshot && (
        <ExpirationSheet
          open={showExpiration}
          positionId={position.id}
          ticker={position.ticker}
          strike={activeLeg.strike}
          expiration={activeLeg.expiration}
          contracts={activeLeg.contracts}
          totalPremiumCollected={costBasisSnapshot.totalPremiumCollected}
          onClose={() => setShowExpiration(false)}
        />
      )}
    </PageLayout>
  )
}
