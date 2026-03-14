import { useState } from 'react'
import { useParams } from 'wouter'
import type { WheelPhase } from '../api/positions'
import { CloseCspForm } from '../components/CloseCspForm'
import { ExpirationSheet } from '../components/ExpirationSheet'
import { PageHeader, PageLayout } from '../components/PageLayout'
import { usePosition } from '../hooks/usePosition'
import { PHASE_COLOR } from '../lib/phase'

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'

const PHASE_LABEL: Record<WheelPhase, string> = {
  CSP_OPEN: 'Sell Put',
  CSP_EXPIRED: 'Put Expired',
  CSP_CLOSED_PROFIT: 'Closed ✓',
  CSP_CLOSED_LOSS: 'Closed ✗',
  HOLDING_SHARES: 'Holding Shares',
  CC_OPEN: 'Sell Call',
  CC_EXPIRED: 'Call Expired',
  CC_CLOSED_PROFIT: 'Closed ✓',
  CC_CLOSED_LOSS: 'Closed ✗',
  WHEEL_COMPLETE: 'Wheel Complete'
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--wb-bg-surface)',
  border: '1px solid var(--wb-border)',
  borderRadius: 8,
  overflow: 'hidden'
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderBottom: '1px solid var(--wb-border)',
  fontSize: '0.65rem',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--wb-text-muted)',
  fontFamily: MONO
}

const statCellStyle: React.CSSProperties = {
  padding: '14px 20px',
  background: 'var(--wb-bg-surface)'
}

function computeDte(expiration: string): number {
  const exp = new Date(expiration + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function fmtMoney(value: string): string {
  return `$${parseFloat(value).toFixed(2)}`
}

function pnlColor(value: string): string {
  return parseFloat(value) >= 0 ? 'var(--wb-green)' : 'var(--wb-red)'
}

type StatProps = { label: string; value: React.ReactNode }

function Stat({ label, value }: StatProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontFamily: MONO,
          fontSize: '0.6rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--wb-text-muted)'
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: '0.875rem',
          fontWeight: 500,
          color: 'var(--wb-text-primary)'
        }}
      >
        {value}
      </span>
    </div>
  )
}

type StatGridProps = { minWidth: number; items: StatProps[] }

function StatGrid({ minWidth, items }: StatGridProps): React.JSX.Element {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${minWidth}px, 1fr))`,
        gap: '1px',
        background: 'var(--wb-border)'
      }}
    >
      {items.map(({ label, value }) => (
        <div key={label} style={statCellStyle}>
          <Stat label={label} value={value} />
        </div>
      ))}
    </div>
  )
}

export function PositionDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const { isLoading, isError, data } = usePosition(id)
  const [showExpiration, setShowExpiration] = useState(false)

  if (isLoading) {
    return (
      <div
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '32px 24px',
          color: 'var(--wb-text-muted)',
          fontSize: '0.8125rem',
          fontFamily: MONO
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--wb-gold)',
            display: 'inline-block',
            animation: 'pulse 1.5s ease-in-out infinite'
          }}
        />
        Loading position...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div
        role="alert"
        style={{
          margin: '16px 24px',
          padding: '10px 14px',
          borderRadius: 6,
          background: 'var(--wb-red-dim)',
          border: '1px solid rgba(248,81,73,0.25)',
          color: 'var(--wb-red)',
          fontSize: '0.8125rem',
          fontFamily: MONO
        }}
      >
        Failed to load position.
      </div>
    )
  }

  const { position, activeLeg, costBasisSnapshot } = data
  const phaseColor = PHASE_COLOR[position.phase]
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: '0.75rem',
                  color: 'var(--wb-text-secondary)',
                  textDecoration: 'none',
                  fontFamily: MONO,
                  transition: 'color 0.15s'
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = 'var(--wb-text-primary)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLElement).style.color = 'var(--wb-text-secondary)')
                }
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
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 9px',
                  borderRadius: 4,
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  fontFamily: MONO,
                  color: phaseColor,
                  background: `${phaseColor}18`,
                  border: `1px solid ${phaseColor}30`
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: phaseColor,
                    flexShrink: 0
                  }}
                />
                {PHASE_LABEL[position.phase]}
              </span>
              {position.phase === 'CSP_OPEN' && (
                <button
                  data-testid="record-expiration-btn"
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
                    background: 'var(--wb-teal-dim)',
                    border: '1px solid rgba(45,212,191,0.3)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget
                    btn.style.background = 'var(--wb-teal-bright)'
                    btn.style.borderColor = 'rgba(45,212,191,0.4)'
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget
                    btn.style.background = 'var(--wb-teal-dim)'
                    btn.style.borderColor = 'rgba(45,212,191,0.3)'
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
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>Open Leg</div>
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
          </section>
        )}

        {costBasisSnapshot && (
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>Cost Basis</div>
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
          </section>
        )}

        {position.phase === 'CSP_OPEN' && activeLeg && (
          <CloseCspForm
            positionId={position.id}
            openPremiumPerContract={activeLeg.premiumPerContract}
            contracts={activeLeg.contracts}
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
