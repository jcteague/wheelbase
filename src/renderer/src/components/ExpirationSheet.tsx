import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'wouter'
import { useExpirePosition } from '../hooks/useExpirePosition'
import { fmtDate, fmtMoney } from '../lib/format'
import { MONO } from '../lib/tokens'
import { Button } from './ui/button'
import { ErrorAlert } from './ui/ErrorAlert'

// Sidebar is 200px wide — overlay covers only the content area to the right of it
const SIDEBAR_WIDTH = 200

export interface ExpirationSheetProps {
  open: boolean
  positionId: string
  ticker: string
  strike: string
  expiration: string
  contracts: number
  totalPremiumCollected: string
  onClose: () => void
}

export function ExpirationSheet({
  open,
  positionId,
  ticker,
  strike,
  expiration,
  contracts,
  totalPremiumCollected,
  onClose
}: ExpirationSheetProps): React.JSX.Element | null {
  const [, navigate] = useLocation()
  const [isClosing, setIsClosing] = useState(false)
  const [successState, setSuccessState] = useState<{
    position: { phase: string }
    costBasisSnapshot: { finalPnl: string }
  } | null>(null)

  const { mutate, isPending, isError, error } = useExpirePosition({
    onSuccess: (data) => {
      setSuccessState(data)
    }
  })

  if (!open) return null

  const handleClose = (): void => {
    setIsClosing(true)
    setTimeout(onClose, 300)
  }

  const handleConfirmExpiration = (): void => {
    mutate({ position_id: positionId, expiration_date_override: expiration })
  }

  const handleOpenNewWheel = (): void => {
    navigate(`/new?ticker=${ticker}`)
  }
  const premiumSummary = `+${fmtMoney(totalPremiumCollected).replace(/\.00$/, '')}`

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: SIDEBAR_WIDTH,
    right: 0,
    bottom: 0,
    zIndex: 50
  }

  const scrimStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 400,
    background: 'var(--wb-bg-surface)',
    borderLeft: '1px solid var(--wb-border)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: MONO,
    boxShadow: '-12px 0 48px rgba(0,0,0,0.5)'
  }

  const headerStyle: React.CSSProperties = {
    padding: '20px 24px 18px',
    borderBottom: '1px solid var(--wb-border)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexShrink: 0
  }

  const eyebrowStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    marginBottom: 6
  }

  const titleStyle: React.CSSProperties = {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--wb-text-primary)',
    marginBottom: 4
  }

  const subtitleStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--wb-text-secondary)',
    lineHeight: 1.6
  }

  const closeButtonStyle: React.CSSProperties = {
    background: 'var(--wb-bg-elevated)',
    border: '1px solid var(--wb-border)',
    color: 'var(--wb-text-muted)',
    fontSize: 14,
    width: 28,
    height: 28,
    borderRadius: 6,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: 12,
    marginTop: 2
  }

  const bodyStyle: React.CSSProperties = {
    padding: '20px 24px',
    overflowY: 'auto',
    flex: 1
  }

  const footerStyle: React.CSSProperties = {
    padding: '16px 24px',
    borderTop: '1px solid var(--wb-border)',
    display: 'flex',
    gap: 10,
    flexShrink: 0,
    background: 'var(--wb-bg-surface)'
  }

  const summaryCardStyle: React.CSSProperties = {
    background: 'var(--wb-bg-elevated)',
    border: '1px solid var(--wb-border)',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16
  }

  const summaryRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid rgba(30,42,56,0.5)'
  }

  const summaryKeyStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--wb-text-secondary)'
  }

  const summaryValStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--wb-text-primary)',
    textAlign: 'right'
  }

  const panelAnimClass = isClosing
    ? 'animate-out slide-out-to-right duration-300'
    : 'animate-in slide-in-from-right duration-300'

  if (successState) {
    const pnl = parseFloat(successState.costBasisSnapshot.finalPnl)

    return createPortal(
      <div style={overlayStyle}>
        <div style={scrimStyle} onClick={handleClose} />
        <div style={panelStyle} className={panelAnimClass}>
          {/* Header */}
          <div style={{ ...headerStyle, borderBottomColor: 'rgba(63,185,80,0.2)' }}>
            <div>
              <div style={{ ...eyebrowStyle, color: 'var(--wb-green)' }}>Complete</div>
              <div style={titleStyle}>{ticker} Expired Worthless</div>
              <div style={subtitleStyle}>
                PUT ${strike} · {expiration}
              </div>
            </div>
            <button style={closeButtonStyle} onClick={handleClose}>
              ×
            </button>
          </div>

          {/* Body */}
          <div style={bodyStyle}>
            {/* P&L display */}
            <div
              style={{
                background: 'linear-gradient(135deg, var(--wb-green-dim), rgba(7,10,14,0.4))',
                border: '1px solid rgba(63,185,80,0.22)',
                borderRadius: 10,
                padding: 22,
                textAlign: 'center',
                marginBottom: 18
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--wb-green)',
                  opacity: 0.7,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  marginBottom: 8
                }}
              >
                Final P&amp;L
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: 'var(--wb-green)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  marginBottom: 6
                }}
              >
                {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--wb-green)', opacity: 0.55 }}>
                100% premium captured · {contracts} contract{contracts !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Summary */}
            <div style={summaryCardStyle}>
              <div style={summaryRowStyle}>
                <span style={summaryKeyStyle}>Leg recorded</span>
                <span style={{ ...summaryValStyle, color: 'var(--wb-green)' }}>
                  expire · {fmtDate(expiration)}
                </span>
              </div>
              <div style={summaryRowStyle}>
                <span style={summaryKeyStyle}>Phase</span>
                <span style={summaryValStyle}>Complete</span>
              </div>
              <div style={{ ...summaryRowStyle, borderBottom: 'none' }}>
                <span style={summaryKeyStyle}>Status</span>
                <span style={summaryValStyle}>Closed</span>
              </div>
            </div>

            {/* What's next */}
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--wb-text-muted)',
                marginBottom: 12
              }}
            >
              What&apos;s next?
            </div>

            <Button
              onClick={handleOpenNewWheel}
              style={{
                width: '100%',
                marginBottom: 12,
                background: 'var(--wb-green)',
                color: '#000',
                fontWeight: 700
              }}
            >
              <span>Open new wheel on {ticker}</span>
              <span style={{ marginLeft: 'auto', opacity: 0.7 }}>→</span>
            </Button>

            <button
              onClick={handleClose}
              style={{
                width: '100%',
                fontSize: 11,
                color: 'var(--wb-text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontFamily: MONO
              }}
            >
              View full position history
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // Confirmation state
  return createPortal(
    <div style={overlayStyle}>
      <div style={scrimStyle} onClick={handleClose} />
      <div style={panelStyle} className={panelAnimClass}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ ...eyebrowStyle, color: 'var(--wb-text-secondary)' }}>
              Record Expiration
            </div>
            <div style={titleStyle}>Expire CSP Worthless</div>
            <div style={subtitleStyle}>
              {ticker} PUT ${strike} · {expiration}
            </div>
          </div>
          <button style={closeButtonStyle} onClick={handleClose}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Summary card */}
          <div style={summaryCardStyle}>
            <div style={summaryRowStyle}>
              <span style={summaryKeyStyle}>Position</span>
              <span style={summaryValStyle}>
                {ticker} PUT ${strike} · {fmtDate(expiration)}
              </span>
            </div>
            <div style={summaryRowStyle}>
              <span style={summaryKeyStyle}>Contracts</span>
              <span style={summaryValStyle}>{contracts}</span>
            </div>
            <div style={summaryRowStyle}>
              <span style={summaryKeyStyle}>Phase transition</span>
              <span style={summaryValStyle}>Put Open → Complete</span>
            </div>
            <div style={summaryRowStyle}>
              <span style={summaryKeyStyle}>Leg recorded</span>
              <span style={summaryValStyle}>expire · no fill price</span>
            </div>
            <div
              style={{
                ...summaryRowStyle,
                borderBottom: 'none',
                background: 'linear-gradient(90deg, var(--wb-green-dim), rgba(14,51,32,0.4))'
              }}
            >
              <span style={{ ...summaryKeyStyle, color: 'var(--wb-green)', opacity: 0.75 }}>
                Final P&amp;L
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--wb-green)' }}>
                {premiumSummary}{' '}
                <span style={{ fontSize: 10, opacity: 0.65 }}>(100% captured)</span>
              </span>
            </div>
          </div>

          {/* Warning */}
          <div
            style={{
              background: 'var(--wb-gold-dim)',
              border: '1px solid rgba(230,168,23,0.2)',
              borderRadius: 6,
              padding: '11px 14px',
              fontSize: 11,
              color: 'var(--wb-gold)',
              lineHeight: 1.65,
              marginBottom: 16
            }}
          >
            <strong style={{ fontWeight: 700, display: 'block', marginBottom: 3 }}>
              This cannot be undone.
            </strong>
            The position will be closed and marked complete. Full leg history is preserved.
          </div>

          {/* Error */}
          {isError && error && (
            <div style={{ marginBottom: 16 }}>
              <ErrorAlert
                message={
                  (error.body as { detail?: Array<{ message: string }> } | null)?.detail?.[0]
                    ?.message ?? 'An error occurred'
                }
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <Button variant="outline" onClick={handleClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmExpiration}
            disabled={isPending}
            style={{ flex: 1, background: 'var(--wb-gold)', color: '#000', fontWeight: 700 }}
          >
            {isPending ? 'Confirming...' : 'Confirm Expiration'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
