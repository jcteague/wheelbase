import Decimal from 'decimal.js'
import { pnlColor } from '../lib/format'
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

  const formattedStrike = parseFloat(ccStrike).toFixed(2)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SheetHeader
        eyebrow="Shares Called Away"
        eyebrowColor="var(--wb-green)"
        borderBottomColor="rgba(63,185,80,0.2)"
        title={`${ticker} Cycle Closed`}
        subtitle={`CALL $${formattedStrike} · ${ccExpiration}`}
        onClose={onClose}
      />

      <SheetBody>
        {/* Hero card */}
        <div
          className="bg-wb-green-dim border border-wb-green-border rounded-xl px-5 py-[22px] text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(63,185,80,0.1), rgba(7,10,14,0.5))'
          }}
        >
          <div className="text-[9px] text-wb-green opacity-80 tracking-[0.2em] uppercase mb-2.5">
            Wheel Complete
          </div>
          <div className="text-[26px] font-bold text-wb-text-primary tracking-tight leading-[1.1] mb-1.5">
            WHEEL COMPLETE
          </div>
          <div className="text-[11px] text-wb-text-secondary mb-4">
            {ticker} · {sharesHeld} shares called away at ${formattedStrike}
          </div>
          <div className="inline-flex flex-col items-center rounded-lg px-7 py-3 bg-wb-green-dim border border-wb-green-border">
            <span className="text-[9px] text-wb-green opacity-75 tracking-[0.14em] uppercase mb-1">
              Final Cycle P&amp;L
            </span>
            <span
              className="text-[30px] font-bold tracking-tight font-wb-mono"
              style={{ color: finalPnlColor }}
            >
              {heroValue}
            </span>
            <span className="text-[9px] text-wb-green opacity-55 mt-0.5">total realized gain</span>
          </div>
        </div>

        {/* Cycle summary */}
        <SectionCard header="Cycle Summary" className="bg-wb-bg-elevated border-wb-border">
          <div className="flex justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
            <span className="text-wb-text-secondary">Leg recorded</span>
            <span className="text-wb-green">cc_close · {fillDate}</span>
          </div>
          <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
            <span className="text-wb-text-secondary">Phase</span>
            <span className="flex items-center gap-1.5">
              <PhaseBadge phase="CC_OPEN" />
              <span className="text-[9px] text-wb-text-muted">→</span>
              <PhaseBadge phase="WHEEL_COMPLETE" />
            </span>
          </div>
          <div className="flex justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
            <span className="text-wb-text-secondary">Shares delivered</span>
            <span className="text-wb-text-primary">
              {sharesHeld} @ ${formattedStrike}
            </span>
          </div>
          <div className="flex justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
            <span className="text-wb-text-secondary">Cycle duration</span>
            <span className="text-wb-text-primary">{cycleDays} days</span>
          </div>
          <div className="flex justify-between px-3.5 py-2.5 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
            <span className="text-wb-text-secondary">Annualized return</span>
            <span className="text-wb-green">~{parseFloat(annualizedReturn).toFixed(1)}%</span>
          </div>
          <div
            className="flex justify-between px-3.5 py-2.5 text-[11px]"
            style={{ background: 'linear-gradient(90deg, rgba(63,185,80,0.04), transparent)' }}
          >
            <span className="font-bold text-wb-text-primary text-[11px]">Final cycle P&amp;L</span>
            <span className="text-sm font-bold" style={{ color: finalPnlColor }}>
              {heroValue}
            </span>
          </div>
        </SectionCard>

        <div className="text-[9px] font-bold tracking-[0.15em] uppercase text-wb-text-muted">
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
          className="w-full text-[11px] text-wb-text-secondary bg-transparent border-none cursor-pointer underline font-wb-mono"
        >
          View full position history
        </button>
      </SheetBody>
    </div>
  )
}
