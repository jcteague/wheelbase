import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useExpireCoveredCall } from '../hooks/useExpireCoveredCall'
import { getSheetPortal } from '../lib/portal'
import { PhaseBadge } from './PhaseBadge'
import { AlertBox } from './ui/AlertBox'
import { Button } from './ui/button'
import { Caption } from './ui/Caption'
import { FormButton } from './ui/FormButton'
import { SheetOverlay, SheetPanel, SheetHeader, SheetBody, SheetFooter } from './ui/Sheet'

// Summary-card row styles shared between confirmation and success states.
// NOTE: These are identical to ExpirationSheet — future extraction candidate.
const summaryRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: '1px solid rgba(30,42,56,0.5)'
}
const summaryKeyStyle: React.CSSProperties = { fontSize: 11, color: 'var(--wb-text-secondary)' }
const summaryValStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--wb-text-primary)',
  textAlign: 'right'
}

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

  const content = successState ? (
    <CcExpirationSuccess
      ticker={ticker}
      strikeDisplay={strikeDisplay}
      expirationDisplay={expirationDisplay}
      contracts={contracts}
      totalPremium={totalPremium}
      sharesHeld={sharesHeld}
      onClose={onClose}
    />
  ) : (
    <CcExpirationConfirm
      ticker={ticker}
      strikeDisplay={strikeDisplay}
      expirationDisplay={expirationDisplay}
      contracts={contracts}
      totalPremium={totalPremium}
      isPending={isPending}
      onClose={onClose}
      onConfirm={() => mutate({ position_id: positionId })}
    />
  )

  return createPortal(
    <SheetOverlay onClose={onClose}>
      <SheetPanel>
        <div data-testid="cc-expiration-sheet" style={{ display: 'contents' }}>
          {content}
        </div>
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}

function CcExpirationSuccess({
  ticker,
  strikeDisplay,
  expirationDisplay,
  contracts,
  totalPremium,
  sharesHeld,
  onClose
}: {
  ticker: string
  strikeDisplay: string
  expirationDisplay: string
  contracts: number
  totalPremium: string
  sharesHeld: number
  onClose: () => void
}): React.JSX.Element {
  return (
    <>
      <SheetHeader
        eyebrow="Complete"
        eyebrowColor="var(--wb-green)"
        borderBottomColor="rgba(63,185,80,0.2)"
        title={`${ticker} CC Expired Worthless`}
        subtitle={`CALL $${strikeDisplay}`}
        onClose={onClose}
      />

      <SheetBody>
        {/* Green hero card */}
        <div className="bg-wb-green-dim border border-wb-green-border rounded-[10px] p-[22px] text-center">
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
            style={{
              fontSize: 11,
              color: 'var(--wb-green)',
              opacity: 0.55,
              marginBottom: 12
            }}
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
        <div className="bg-wb-bg-elevated border border-wb-border rounded-lg overflow-hidden mb-4">
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
        <AlertBox variant="info">
          💡 Many traders wait 1–3 days before selling the next covered call — avoid chasing premium
          right at expiration.
        </AlertBox>

        {/* What's next */}
        <Caption>What&apos;s next?</Caption>

        <FormButton
          label={`Sell New Covered Call on ${ticker} →`}
          onClick={onClose}
          style={{ width: '100%' }}
        />

        <button
          type="button"
          onClick={onClose}
          className="w-full text-[11px] text-wb-text-secondary bg-transparent border-none cursor-pointer underline font-wb-mono"
        >
          View full position history
        </button>
      </SheetBody>
    </>
  )
}

function CcExpirationConfirm({
  ticker,
  strikeDisplay,
  expirationDisplay,
  contracts,
  totalPremium,
  isPending,
  onClose,
  onConfirm
}: {
  ticker: string
  strikeDisplay: string
  expirationDisplay: string
  contracts: number
  totalPremium: string
  isPending: boolean
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <>
      <SheetHeader
        eyebrow="Record Expiration"
        title="Expire Covered Call Worthless"
        subtitle={`${ticker} Covered Call`}
        onClose={onClose}
      />

      <SheetBody>
        {/* Summary card */}
        <div className="bg-wb-bg-elevated border border-wb-border rounded-lg overflow-hidden mb-4">
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
        <div className="bg-wb-gold-dim border border-[rgba(230,168,23,0.2)] rounded-md p-3 text-xs text-wb-gold leading-relaxed">
          <strong style={{ fontWeight: 700, display: 'block', marginBottom: 3 }}>
            This cannot be undone.
          </strong>
          The position will return to the Shares phase. Full leg history is preserved.
        </div>
      </SheetBody>

      <SheetFooter>
        <Button variant="outline" onClick={onClose} style={{ flex: 1 }}>
          Cancel
        </Button>
        <FormButton
          label={isPending ? 'Confirming...' : 'Confirm Expiration'}
          isPending={isPending}
          onClick={onConfirm}
          style={{ flex: 1 }}
        />
      </SheetFooter>
    </>
  )
}
