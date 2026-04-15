import Decimal from 'decimal.js'
import { fmtDate, fmtMoney } from '../lib/format'
import { AlertBox } from './ui/AlertBox'
import { Badge } from './ui/Badge'
import { Caption } from './ui/Caption'
import { SectionCard } from './ui/SectionCard'
import { SheetHeader, SheetBody } from './ui/Sheet'

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
      className="inline-flex flex-col items-center rounded-lg gap-1"
      style={{
        background: `${color}14`,
        border: `1px solid ${color}33`,
        padding: '10px 16px'
      }}
    >
      <span className="text-[9px] tracking-[0.1em] uppercase" style={{ color }}>
        {label}
      </span>
      <span className="text-sm font-bold text-wb-text-primary">{value}</span>
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
    <>
      <SheetHeader
        eyebrow="Complete"
        title={`${ticker} CC Opened`}
        subtitle={`CALL ${fmtMoney(strike)} · ${fmtDate(expiration)}`}
        onClose={onClose}
        eyebrowColor="var(--wb-violet)"
        borderBottomColor="rgba(188,140,255,0.2)"
      />
      <SheetBody>
        <div
          className="bg-wb-green-dim border border-wb-green-border rounded-[10px] text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(188,140,255,0.1), rgba(7,10,14,0.5))',
            border: '1px solid rgba(188,140,255,0.22)',
            padding: '22px 20px'
          }}
        >
          <div className="text-[9px] text-wb-violet opacity-75 tracking-[0.18em] uppercase mb-2">
            Call Open
          </div>
          <div className="text-[22px] font-bold text-wb-text-primary mb-1.5">
            HOLDING {sharesHeld} SHARES
          </div>
          <div className="text-[11px] text-wb-violet font-semibold mb-3">
            CC OPEN · CALL {fmtMoney(strike)} · {fmtDate(expiration)}
          </div>
          <div className="flex gap-2.5 justify-center">
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

        <SectionCard className="bg-wb-bg-elevated border-wb-border">
          <div className="p-4 grid gap-2.5 text-xs">
            {[
              ['Leg recorded', `CC_OPEN · ${fmtDate(expiration)}`, 'text-wb-text-primary'],
              ['Strike', fmtMoney(strike), 'text-wb-text-primary'],
              ['Expiration', fmtDate(expiration), 'text-wb-text-primary'],
              ['Updated cost basis', `${fmtMoney(basisPerShare)}/share`, 'text-wb-gold']
            ].map(([label, value, colorClass]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-wb-text-secondary">{label}</span>
                <span className={`font-semibold ${colorClass}`}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center">
              <span className="text-wb-text-secondary">Phase transition</span>
              <div className="flex items-center gap-1.5">
                <Badge>HOLDING_SHARES</Badge>
                <span className="text-wb-text-muted">→</span>
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
          className="border-none bg-transparent text-wb-text-secondary cursor-pointer underline font-wb-mono"
        >
          View full position history
        </button>
      </SheetBody>
    </>
  )
}
