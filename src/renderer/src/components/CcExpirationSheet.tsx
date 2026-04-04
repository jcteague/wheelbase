import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useExpireCoveredCall } from '../hooks/useExpireCoveredCall'
import { MONO } from '../lib/tokens'
import { PhaseBadge } from './PhaseBadge'
import { AlertBox } from './ui/AlertBox'
import { Button } from './ui/button'
import { FormButton } from './ui/FormButton'

const SIDEBAR_WIDTH = 200

export interface CcExpirationSheetProps {
  open: boolean
  positionId: string
  ticker: string
  strike: string
  expiration: string
  expirationDisplay: string
  contracts: number
  premiumPerContract: string
  sharesHeld: number
  onClose: () => void
}

export function CcExpirationSheet({
  open,
  positionId,
  ticker,
  strike,
  expirationDisplay,
  contracts,
  premiumPerContract,
  sharesHeld,
  onClose
}: CcExpirationSheetProps): React.JSX.Element | null {
  const [successState, setSuccessState] = useState(false)

  const { mutate, isPending } = useExpireCoveredCall({
    onSuccess: () => {
      setSuccessState(true)
    }
  })

  if (!open) return null

  const totalPremium = (parseFloat(premiumPerContract) * contracts * 100).toFixed(0)
  const strikeDisplay = parseFloat(strike).toFixed(2)

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

  if (successState) {
    return createPortal(
      <div data-testid="cc-expiration-sheet" style={overlayStyle}>
        <div style={scrimStyle} onClick={onClose} />
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ ...headerStyle, borderBottomColor: 'rgba(63,185,80,0.2)' }}>
            <div>
              <div style={{ ...eyebrowStyle, color: 'var(--wb-green)' }}>Complete</div>
              <div style={titleStyle}>{ticker} CC Expired Worthless</div>
              <div style={subtitleStyle}>CALL ${strikeDisplay}</div>
            </div>
            <button style={closeButtonStyle} onClick={onClose}>
              ×
            </button>
          </div>

          {/* Body */}
          <div style={bodyStyle}>
            {/* Green hero card */}
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
                Premium Captured
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
                +${totalPremium}
              </div>
              <div
                style={{ fontSize: 11, color: 'var(--wb-green)', opacity: 0.55, marginBottom: 12 }}
              >
                100% premium captured · {contracts} contract{contracts !== 1 ? 's' : ''}
              </div>
              {/* Still Holding badge */}
              <div
                style={{
                  display: 'inline-block',
                  background: 'rgba(88,166,255,0.15)',
                  border: '1px solid rgba(88,166,255,0.25)',
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontSize: 11,
                  color: 'var(--wb-sky)',
                  fontWeight: 600
                }}
              >
                {sharesHeld} shares of {ticker}
              </div>
            </div>

            {/* Result summary card */}
            <div style={summaryCardStyle}>
              <div style={summaryRowStyle}>
                <span style={summaryKeyStyle}>Leg recorded</span>
                <span style={{ ...summaryValStyle, color: 'var(--wb-green)' }}>
                  expire · {expirationDisplay}
                </span>
              </div>
              <div style={summaryRowStyle}>
                <span style={summaryKeyStyle}>Phase</span>
                <span style={summaryValStyle}>
                  <PhaseBadge phase="HOLDING_SHARES" />
                </span>
              </div>
              <div style={summaryRowStyle}>
                <span style={summaryKeyStyle}>Shares still held</span>
                <span style={{ ...summaryValStyle, color: 'var(--wb-sky)' }}>{sharesHeld}</span>
              </div>
              <div
                style={{
                  ...summaryRowStyle,
                  borderBottom: 'none',
                  background: 'linear-gradient(90deg, var(--wb-green-dim), rgba(14,51,32,0.4))'
                }}
              >
                <span style={{ ...summaryKeyStyle, color: 'var(--wb-green)', opacity: 0.75 }}>
                  CC premium collected
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--wb-green)' }}>
                  ${totalPremium}
                </span>
              </div>
            </div>

            {/* Strategic nudge */}
            <div style={{ marginBottom: 16 }}>
              <AlertBox variant="info">
                💡 Many traders wait 1–3 days before selling the next covered call — avoid chasing
                premium right at expiration.
              </AlertBox>
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

            <FormButton
              label={`Sell New Covered Call on ${ticker} →`}
              onClick={onClose}
              style={{ width: '100%', marginBottom: 12 }}
            />

            <button
              onClick={onClose}
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
    <div data-testid="cc-expiration-sheet" style={overlayStyle}>
      <div style={scrimStyle} onClick={onClose} />
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={{ ...eyebrowStyle, color: 'var(--wb-text-secondary)' }}>
              Record Expiration
            </div>
            <div style={titleStyle}>Expire Covered Call Worthless</div>
            <div style={subtitleStyle}>{ticker} Covered Call</div>
          </div>
          <button style={closeButtonStyle} onClick={onClose}>
            ×
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Summary card */}
          <div style={summaryCardStyle}>
            <div style={summaryRowStyle}>
              <span style={summaryKeyStyle}>Phase transition</span>
              <span style={{ ...summaryValStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PhaseBadge phase="CC_OPEN" variant="short" />
                {' → '}
                <PhaseBadge phase="HOLDING_SHARES" />
              </span>
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
                Premium captured
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--wb-green)',
                  textAlign: 'right'
                }}
              >
                {ticker} · {contracts} × CALL ${strikeDisplay} · {expirationDisplay} · +$
                {totalPremium} (100%)
              </span>
            </div>
          </div>

          {/* Warning */}
          <div style={{ marginBottom: 16 }}>
            <AlertBox variant="warning">
              <strong style={{ fontWeight: 700, display: 'block', marginBottom: 3 }}>
                This cannot be undone.
              </strong>
              The position will return to the Shares phase. Full leg history is preserved.
            </AlertBox>
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </Button>
          <FormButton
            label={isPending ? 'Confirming...' : 'Confirm Expiration'}
            isPending={isPending}
            onClick={() => mutate({ position_id: positionId })}
            style={{ flex: 1 }}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
