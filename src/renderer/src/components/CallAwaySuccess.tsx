import Decimal from 'decimal.js'
import { pnlColor } from '../lib/format'
import { MONO } from '../lib/tokens'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetHeader } from './ui/Sheet'
import { PhaseBadge } from './PhaseBadge'

type CallAwaySuccessProps = {
  ticker: string
  ccStrike: string
  ccExpiration: string
  sharesHeld: number
  finalPnl: string
  cycleDays: number
  annualizedReturn: string
  fillDate: string
  onClose: () => void
}

export function CallAwaySuccess({
  ticker,
  ccStrike,
  ccExpiration,
  sharesHeld,
  finalPnl,
  cycleDays,
  annualizedReturn,
  fillDate,
  onClose
}: CallAwaySuccessProps): React.JSX.Element {
  const pnl = new Decimal(finalPnl)
  const isProfit = pnl.gte(0)
  const pnlSign = isProfit ? '+' : '−'
  const finalPnlColor = pnlColor(finalPnl)
  const heroValue = `${pnlSign}$${pnl.abs().toFixed(2)}`

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      <SheetHeader
        eyebrow="Shares Called Away"
        eyebrowColor="var(--wb-green)"
        borderBottomColor="rgba(63,185,80,0.2)"
        title={`${ticker} Cycle Closed`}
        subtitle={`CALL $${parseFloat(ccStrike).toFixed(2)} · ${ccExpiration}`}
        onClose={onClose}
      />

      <SheetBody>
        {/* Hero card */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(63,185,80,0.1), rgba(7,10,14,0.5))',
            border: '1px solid rgba(63,185,80,0.25)',
            borderRadius: 10,
            padding: '22px 20px',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: 'var(--wb-green)',
              opacity: 0.8,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 10
            }}
          >
            Wheel Complete
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: 'var(--wb-text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              marginBottom: 6
            }}
          >
            WHEEL COMPLETE
          </div>
          <div style={{ fontSize: 11, color: 'var(--wb-text-secondary)', marginBottom: 16 }}>
            {ticker} · {sharesHeld} shares called away at ${parseFloat(ccStrike).toFixed(2)}
          </div>
          <div
            style={{
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: 'rgba(63,185,80,0.1)',
              border: '1px solid rgba(63,185,80,0.28)',
              borderRadius: 8,
              padding: '12px 28px'
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: 'var(--wb-green)',
                opacity: 0.75,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                marginBottom: 5
              }}
            >
              Final Cycle P&amp;L
            </span>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: finalPnlColor,
                letterSpacing: '-0.02em',
                fontFamily: MONO
              }}
            >
              {heroValue}
            </span>
            <span style={{ fontSize: 9, color: 'var(--wb-green)', opacity: 0.55, marginTop: 2 }}>
              total realized gain
            </span>
          </div>
        </div>

        {/* Cycle summary */}
        <SectionCard header="Cycle Summary">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(30,42,56,0.6)',
              fontSize: 11
            }}
          >
            <span style={{ color: 'var(--wb-text-secondary)' }}>Leg recorded</span>
            <span style={{ color: 'var(--wb-green)' }}>cc_close · {fillDate}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(30,42,56,0.6)',
              fontSize: 11
            }}
          >
            <span style={{ color: 'var(--wb-text-secondary)' }}>Phase</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <PhaseBadge phase="CC_OPEN" />
              <span style={{ fontSize: 9, color: 'var(--wb-text-muted)' }}>→</span>
              <PhaseBadge phase="WHEEL_COMPLETE" />
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(30,42,56,0.6)',
              fontSize: 11
            }}
          >
            <span style={{ color: 'var(--wb-text-secondary)' }}>Shares delivered</span>
            <span style={{ color: 'var(--wb-text-primary)' }}>
              {sharesHeld} @ ${parseFloat(ccStrike).toFixed(2)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(30,42,56,0.6)',
              fontSize: 11
            }}
          >
            <span style={{ color: 'var(--wb-text-secondary)' }}>Cycle duration</span>
            <span style={{ color: 'var(--wb-text-primary)' }}>{cycleDays} days</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid rgba(30,42,56,0.6)',
              fontSize: 11
            }}
          >
            <span style={{ color: 'var(--wb-text-secondary)' }}>Annualized return</span>
            <span style={{ color: 'var(--wb-green)' }}>
              ~{parseFloat(annualizedReturn).toFixed(1)}%
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'linear-gradient(90deg, rgba(63,185,80,0.04), transparent)',
              fontSize: 11
            }}
          >
            <span style={{ fontWeight: 700, color: 'var(--wb-text-primary)', fontSize: 11 }}>
              Final cycle P&amp;L
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: finalPnlColor }}>{heroValue}</span>
          </div>
        </SectionCard>

        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--wb-text-muted)'
          }}
        >
          What&apos;s next?
        </div>

        <FormButton
          label={`Start New Wheel on ${ticker} →`}
          onClick={() => {
            window.location.hash = `#/new?ticker=${ticker}`
            onClose()
          }}
          style={{ width: '100%' }}
        />

        <button
          type="button"
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
      </SheetBody>
    </div>
  )
}
