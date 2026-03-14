import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'wouter'
import { useExpirePosition } from '../hooks/useExpirePosition'
import { Button } from './ui/button'

function formatPremium(premium: string): string {
  const value = parseFloat(premium)
  return `+$${Math.abs(value).toFixed(0)}`
}

// Parse ISO date string (YYYY-MM-DD) as local date to avoid UTC midnight timezone shift
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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

  const handleConfirmExpiration = (): void => {
    mutate({ position_id: positionId, expiration_date_override: expiration })
  }

  const handleOpenNewWheel = (): void => {
    navigate(`/new?ticker=${ticker}`)
  }

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
    boxShadow: '-12px 0 48px rgba(0,0,0,0.5)'
  }

  if (successState) {
    return createPortal(
      <div style={overlayStyle}>
        {/* Background overlay */}
        <div style={scrimStyle} onClick={onClose} />

        {/* Sheet */}
        <div style={panelStyle} className="animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[rgba(61,224,126,0.15)]">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-[var(--wb-green)] uppercase tracking-wide mb-1">
                  Complete
                </div>
                <div className="text-lg font-semibold text-[var(--wb-text-primary)]">
                  {ticker} Expired Worthless
                </div>
                <div className="text-sm text-[var(--wb-text-secondary)]">
                  PUT ${strike} · {expiration}
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-[var(--wb-text-secondary)] hover:text-[var(--wb-text-primary)] text-xl"
              >
                ×
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 px-6 py-6">
            {/* P&L Display */}
            <div className="text-center mb-6">
              <div className="text-xs text-[var(--wb-text-secondary)] mb-1">Final P&L</div>
              <div className="text-2xl font-bold text-[var(--wb-green)]">
                {formatPremium(successState.costBasisSnapshot.finalPnl)}
              </div>
              <div className="text-xs text-[var(--wb-text-secondary)]">
                100% premium captured · {contracts} contract{contracts !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-[var(--wb-bg-elevated)] border border-[var(--wb-border)] rounded-lg mb-5">
              <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--wb-border)]">
                <span className="text-xs text-[var(--wb-text-secondary)]">Leg recorded</span>
                <span className="text-xs font-semibold text-[var(--wb-green)]">
                  expire · {fmtDate(expiration)}
                </span>
              </div>
              <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--wb-border)]">
                <span className="text-xs text-[var(--wb-text-secondary)]">Phase</span>
                <span className="text-xs font-semibold text-[var(--wb-text-primary)]">Complete</span>
              </div>
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-xs text-[var(--wb-text-secondary)]">Status</span>
                <span className="text-xs font-semibold text-[var(--wb-text-primary)]">Closed</span>
              </div>
            </div>

            {/* What's next */}
            <div className="text-xs text-[var(--wb-text-muted)] uppercase tracking-wide mb-3">
              What&apos;s next?
            </div>

            <Button
              onClick={handleOpenNewWheel}
              className="w-full bg-[var(--wb-green)] text-black font-bold text-sm py-3 mb-4 hover:bg-[var(--wb-green)]/90"
            >
              <div>
                <div>Open new wheel on {ticker}</div>
                <div className="text-xs opacity-75">Ticker pre-filled · continue the cycle</div>
              </div>
              <span>→</span>
            </Button>

            <button
              onClick={onClose}
              className="w-full text-sm text-[var(--wb-text-secondary)] hover:text-[var(--wb-text-primary)] underline"
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
      {/* Background overlay */}
      <div style={scrimStyle} onClick={onClose} />

      {/* Sheet */}
      <div style={panelStyle} className="animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--wb-border)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-[var(--wb-text-secondary)] uppercase tracking-wide mb-1">
                Record Expiration
              </div>
              <div className="text-lg font-semibold text-[var(--wb-text-primary)]">
                Expire CSP Worthless
              </div>
              <div className="text-sm text-[var(--wb-text-secondary)]">
                {ticker} PUT ${strike} · {expiration}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[var(--wb-text-secondary)] hover:text-[var(--wb-text-primary)] text-xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-6">
          {/* Summary */}
          <div className="bg-[var(--wb-bg-elevated)] border border-[var(--wb-border)] rounded-lg mb-4">
            <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--wb-border)]">
              <span className="text-xs text-[var(--wb-text-secondary)]">Position</span>
              <span className="text-xs font-semibold text-[var(--wb-text-primary)]">
                {ticker} PUT ${strike} · {fmtDate(expiration)}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--wb-border)]">
              <span className="text-xs text-[var(--wb-text-secondary)]">Contracts</span>
              <span className="text-xs font-semibold text-[var(--wb-text-primary)]">{contracts}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--wb-border)]">
              <span className="text-xs text-[var(--wb-text-secondary)]">Phase transition</span>
              <span className="text-xs font-semibold text-[var(--wb-text-primary)]">Put Open → Complete</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-b border-[var(--wb-border)]">
              <span className="text-xs text-[var(--wb-text-secondary)]">Leg recorded</span>
              <span className="text-xs font-semibold text-[var(--wb-text-primary)]">expire · no fill price</span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-[var(--wb-green-dim)]">
              <span className="text-xs text-[var(--wb-green)] opacity-75">Final P&L</span>
              <span className="text-base font-bold text-[var(--wb-green)]">
                {formatPremium(totalPremiumCollected)}{' '}
                <span className="text-xs opacity-65">(100% captured)</span>
              </span>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-[var(--wb-gold-dim)] border border-[var(--wb-gold-border)] rounded-md p-4 mb-4">
            <div className="text-xs text-[var(--wb-gold)]">
              <strong>This cannot be undone.</strong>
              <br />
              The position will be closed and marked complete. Full leg history is preserved.
            </div>
          </div>

          {/* Error */}
          {isError && error && (
            <div className="bg-[var(--wb-red-dim)] border border-[var(--wb-red)] rounded-md p-4 mb-4">
              <div className="text-xs text-[var(--wb-red)]">
                {(error.body as { detail?: Array<{ message: string }> } | null)?.detail?.[0]?.message ?? 'An error occurred'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--wb-border)] flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmExpiration}
            disabled={isPending}
            className="flex-1 bg-[var(--wb-gold)] text-black font-bold hover:bg-[var(--wb-gold)]/90"
          >
            {isPending ? 'Confirming...' : 'Confirm Expiration'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
