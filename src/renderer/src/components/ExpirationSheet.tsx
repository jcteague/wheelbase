import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'wouter'
import { useExpirePosition } from '../hooks/useExpirePosition'
import { fmtDate, fmtMoney } from '../lib/format'
import { getSheetPortal } from '../lib/portal'
import { Button } from './ui/button'
import { ErrorAlert } from './ui/ErrorAlert'
import { SheetOverlay, SheetPanel, SheetHeader, SheetBody, SheetFooter } from './ui/Sheet'

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

  const handleClose = (): void => {
    setTimeout(onClose, 300)
  }

  const handleConfirmExpiration = (): void => {
    mutate({ position_id: positionId })
  }

  const handleOpenNewWheel = (): void => {
    navigate(`/new?ticker=${ticker}`)
  }
  const premiumSummary = `+${fmtMoney(totalPremiumCollected).replace(/\.00$/, '')}`

  if (successState) {
    const pnl = parseFloat(successState.costBasisSnapshot.finalPnl)

    return createPortal(
      <SheetOverlay onClose={handleClose}>
        <SheetPanel>
          <SheetHeader
            eyebrow="Complete"
            title={`${ticker} Expired Worthless`}
            subtitle={`PUT $${strike} · ${expiration}`}
            onClose={handleClose}
            eyebrowColor="var(--wb-green)"
            borderBottomColor="rgba(63,185,80,0.2)"
          />

          <SheetBody>
            {/* P&L display */}
            <div
              className="bg-wb-green-dim border border-wb-green-border rounded-xl p-5 text-center mb-4"
              style={{
                background: 'linear-gradient(135deg, var(--wb-green-dim), rgba(7,10,14,0.4))'
              }}
            >
              <div className="text-[9px] text-wb-green/70 tracking-[0.18em] uppercase mb-2">
                Final P&amp;L
              </div>
              <div className="text-[40px] font-bold text-wb-green tracking-[-0.03em] leading-none mb-1.5">
                {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)}
              </div>
              <div className="text-[11px] text-wb-green/55">
                100% premium captured · {contracts} contract{contracts !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-wb-bg-elevated border border-wb-border rounded-lg overflow-hidden mb-4">
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-wb-border">
                <span className="text-[11px] text-wb-text-secondary">Leg recorded</span>
                <span className="text-[11px] font-semibold text-right text-wb-green">
                  expire · {fmtDate(expiration)}
                </span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-wb-border">
                <span className="text-[11px] text-wb-text-secondary">Phase</span>
                <span className="text-[11px] font-semibold text-wb-text-primary text-right">
                  Complete
                </span>
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[11px] text-wb-text-secondary">Status</span>
                <span className="text-[11px] font-semibold text-wb-text-primary text-right">
                  Closed
                </span>
              </div>
            </div>

            {/* What's next */}
            <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-wb-text-muted mb-3">
              What&apos;s next?
            </div>

            <Button
              onClick={handleOpenNewWheel}
              className="w-full mb-3 bg-wb-green text-black font-bold"
            >
              <span>Open new wheel on {ticker}</span>
              <span className="ml-auto opacity-70">→</span>
            </Button>

            <button
              onClick={handleClose}
              className="font-wb-mono w-full text-[11px] text-wb-text-secondary bg-transparent border-none cursor-pointer underline"
            >
              View full position history
            </button>
          </SheetBody>
        </SheetPanel>
      </SheetOverlay>,
      getSheetPortal()
    )
  }

  // Confirmation state
  return createPortal(
    <SheetOverlay onClose={handleClose}>
      <SheetPanel>
        <SheetHeader
          eyebrow="Record Expiration"
          title="Expire CSP Worthless"
          subtitle={`${ticker} PUT $${strike} · ${expiration}`}
          onClose={handleClose}
        />

        <SheetBody>
          {/* Summary card */}
          <div className="bg-wb-bg-elevated border border-wb-border rounded-lg overflow-hidden mb-4">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)]">
              <span className="text-[11px] text-wb-text-secondary">Position</span>
              <span className="text-[11px] font-semibold text-wb-text-primary text-right">
                {ticker} PUT ${strike} · {fmtDate(expiration)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)]">
              <span className="text-[11px] text-wb-text-secondary">Contracts</span>
              <span className="text-[11px] font-semibold text-wb-text-primary text-right">
                {contracts}
              </span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)]">
              <span className="text-[11px] text-wb-text-secondary">Phase transition</span>
              <span className="text-[11px] font-semibold text-wb-text-primary text-right">
                Put Open → Complete
              </span>
            </div>
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)]">
              <span className="text-[11px] text-wb-text-secondary">Leg recorded</span>
              <span className="text-[11px] font-semibold text-wb-text-primary text-right">
                expire · no fill price
              </span>
            </div>
            <div
              className="flex items-center justify-between px-3.5 py-2.5"
              style={{
                background: 'linear-gradient(90deg, var(--wb-green-dim), rgba(14,51,32,0.4))'
              }}
            >
              <span className="text-[11px] text-wb-green/75">Final P&amp;L</span>
              <span className="text-[15px] font-bold text-wb-green">
                {premiumSummary} <span className="text-[10px] opacity-65">(100% captured)</span>
              </span>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-wb-gold-dim text-wb-gold border border-wb-gold-border rounded-md px-3.5 py-[11px] text-[11px] leading-[1.65] mb-4">
            <strong className="font-bold block mb-[3px]">This cannot be undone.</strong>
            The position will be closed and marked complete. Full leg history is preserved.
          </div>

          {/* Error */}
          {isError && error && (
            <div className="mb-4">
              <ErrorAlert
                message={
                  (error.body as { detail?: Array<{ message: string }> } | null)?.detail?.[0]
                    ?.message ?? 'An error occurred'
                }
              />
            </div>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleConfirmExpiration}
            disabled={isPending}
            className="flex-1 bg-wb-gold text-black font-bold"
          >
            {isPending ? 'Confirming...' : 'Confirm Expiration'}
          </Button>
        </SheetFooter>
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
