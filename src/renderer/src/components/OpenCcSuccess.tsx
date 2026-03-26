import Decimal from 'decimal.js'
import { fmtDate, fmtMoney } from '../lib/format'
import { AlertBox } from './ui/AlertBox'
import { Badge } from './ui/Badge'
import { Caption } from './ui/Caption'
import { SectionCard } from './ui/SectionCard'
import { OpenCcSheetHeader } from './OpenCcSheetHeader'

function StatBox({
  label,
  value,
  color
}: {
  label: string
  value: string
  color: string
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: `${color}14`,
        border: `1px solid ${color}33`,
        borderRadius: 8,
        padding: '10px 16px',
        gap: 4
      }}
    >
      <span style={{ fontSize: 9, color, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--wb-text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

export function CcSuccess({
  ticker,
  strike,
  expiration,
  contracts,
  basisPerShare,
  totalPremiumCollected,
  onClose
}: {
  ticker: string
  strike: string
  expiration: string
  contracts: number
  basisPerShare: string
  totalPremiumCollected: string
  onClose: () => void
}): React.JSX.Element {
  const sharesHeld = contracts * 100
  const profitPerShare = new Decimal(strike).minus(basisPerShare)

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
      <OpenCcSheetHeader
        eyebrow="Complete"
        title={`${ticker} CC Opened`}
        subtitle={`CALL ${fmtMoney(strike)} · ${fmtDate(expiration)}`}
        onClose={onClose}
        eyebrowColor="var(--wb-violet)"
      />
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
            background: 'linear-gradient(135deg, rgba(188,140,255,0.1), rgba(7,10,14,0.5))',
            border: '1px solid rgba(188,140,255,0.22)',
            borderRadius: 10,
            padding: '22px 20px',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: 'var(--wb-violet)',
              opacity: 0.75,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 8
            }}
          >
            Call Open
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--wb-text-primary)',
              marginBottom: 6
            }}
          >
            HOLDING {sharesHeld} SHARES
          </div>
          <div
            style={{ fontSize: 11, color: 'var(--wb-violet)', fontWeight: 600, marginBottom: 12 }}
          >
            CC OPEN · CALL {fmtMoney(strike)} · {fmtDate(expiration)}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <StatBox
              label="Updated Cost Basis"
              value={`${fmtMoney(basisPerShare)}/share`}
              color="var(--wb-violet)"
            />
            <StatBox
              label="Total Premium"
              value={fmtMoney(totalPremiumCollected)}
              color="var(--wb-green)"
            />
          </div>
        </div>

        <SectionCard>
          <div style={{ padding: 16, display: 'grid', gap: 10, fontSize: 12 }}>
            {[
              ['Leg recorded', `CC_OPEN · ${fmtDate(expiration)}`],
              ['Strike', fmtMoney(strike)],
              ['Expiration', fmtDate(expiration)],
              ['Updated cost basis', `${fmtMoney(basisPerShare)}/share`]
            ].map(([label, value]) => (
              <div
                key={label}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: 'var(--wb-text-secondary)' }}>{label}</span>
                <span
                  style={{
                    fontWeight: 600,
                    color:
                      label === 'Updated cost basis' ? 'var(--wb-gold)' : 'var(--wb-text-primary)'
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--wb-text-secondary)' }}>Phase transition</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Badge>HOLDING_SHARES</Badge>
                <span style={{ color: 'var(--wb-text-muted)' }}>→</span>
                <Badge color="var(--wb-violet)">CC_OPEN</Badge>
              </div>
            </div>
          </div>
        </SectionCard>

        {profitPerShare.gt(0) && (
          <AlertBox variant="info">
            If shares are called away at {fmtMoney(strike)}, you profit{' '}
            {fmtMoney(profitPerShare.toFixed(2))}/share (
            {fmtMoney(profitPerShare.times(sharesHeld).toFixed(2))} total) above cost basis.
          </AlertBox>
        )}

        <Caption>What&apos;s next?</Caption>
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--wb-text-secondary)',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontFamily: 'var(--wb-font-mono)'
          }}
        >
          View full position history
        </button>
      </div>
    </div>
  )
}
