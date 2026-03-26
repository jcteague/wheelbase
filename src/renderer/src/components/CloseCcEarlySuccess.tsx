import Decimal from 'decimal.js'
import { fmtMoney } from '../lib/format'
import { AlertBox } from './ui/AlertBox'
import { Caption } from './ui/Caption'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { PhaseBadge } from './PhaseBadge'

type CloseCcEarlySuccessProps = {
  ticker: string
  strike: string
  basisPerShare: string
  ccLegPnl: string
  closePrice: string
  fillDate: string
  openPremium: string
  onClose: () => void
}

export function CloseCcEarlySuccess({
  ticker,
  strike,
  basisPerShare,
  ccLegPnl,
  closePrice,
  fillDate,
  openPremium,
  onClose
}: CloseCcEarlySuccessProps): React.JSX.Element {
  const pnl = new Decimal(ccLegPnl)
  const heroSign = pnl.gte(0) ? '+' : '−'
  const heroColor = pnl.gte(0) ? 'var(--wb-green)' : 'var(--wb-red)'

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--wb-border)' }}>
        <Caption>Complete</Caption>
        <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{ticker} CC Closed</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--wb-text-muted)' }}>
          CALL {fmtMoney(strike)} · filled {fmtMoney(closePrice)}
        </div>
      </div>

      <div
        style={{
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flex: 1
        }}
      >
        <div
          style={{
            textAlign: 'center',
            padding: '20px',
            borderRadius: 8,
            background: 'var(--wb-bg-elevated)',
            border: '1px solid var(--wb-border)'
          }}
        >
          <div style={{ fontSize: '2rem', fontWeight: 800, color: heroColor }}>
            {heroSign}${pnl.abs().toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--wb-text-muted)', marginTop: 4 }}>
            CC Leg P&amp;L
          </div>
        </div>

        <SectionCard>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Leg recorded</span>
              <span>CC_CLOSE · {fillDate}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Fill price</span>
              <span>{fmtMoney(closePrice)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Open premium</span>
              <span>{fmtMoney(openPremium)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Phase transition</span>
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}
              >
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <PhaseBadge phase="CC_OPEN" />
                  <span>→</span>
                  <PhaseBadge phase="HOLDING_SHARES" />
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--wb-text-muted)' }}>Cost basis</span>
              <span>${basisPerShare} / share (unchanged)</span>
            </div>
          </div>
        </SectionCard>

        <AlertBox variant="info">
          You&apos;re back in Holding Shares. Sell a new covered call to keep the wheel spinning.
        </AlertBox>

        <Caption>What&apos;s next?</Caption>
      </div>

      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--wb-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <FormButton
          label={`Sell New Covered Call on ${ticker} →`}
          onClick={onClose}
          style={{ width: '100%' }}
        />
        <button
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--wb-text-muted)',
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
          onClick={onClose}
        >
          View full position history
        </button>
      </div>
    </div>
  )
}
