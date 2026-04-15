import Decimal from 'decimal.js'
import { pnlColor } from '../lib/format'
import { AlertBox } from './ui/AlertBox'
import { Caption } from './ui/Caption'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'
import { PhaseBadge } from './PhaseBadge'

type CallAwayFormProps = {
  ticker: string
  ccStrike: string
  ccExpiration: string
  contracts: number
  sharesHeld: number
  basisPerShare: string
  appreciationPerShare: string
  appreciationTotal: string
  finalPnl: string
  capitalDeployed: string
  isPending: boolean
  onSubmit: () => void
  onClose: () => void
}

export function CallAwayForm({
  ticker,
  ccStrike,
  ccExpiration,
  contracts,
  sharesHeld,
  basisPerShare,
  appreciationPerShare,
  appreciationTotal,
  finalPnl,
  capitalDeployed,
  isPending,
  onSubmit,
  onClose
}: CallAwayFormProps): React.JSX.Element {
  const pnl = new Decimal(finalPnl)
  const pnlSign = pnl.gte(0) ? '+' : '−'
  const pnlValue = `${pnlSign}$${pnl.abs().toFixed(2)}`
  const finalPnlColor = pnlColor(finalPnl)
  const appPerShare = new Decimal(appreciationPerShare)

  const formattedStrike = parseFloat(ccStrike).toFixed(2)
  const formattedBasis = parseFloat(basisPerShare).toFixed(2)
  const formattedCapital = parseFloat(capitalDeployed).toFixed(2)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SheetHeader
        eyebrow="Record Call-Away"
        title="Shares Called Away"
        subtitle={`${ticker} CALL $${formattedStrike} · ${ccExpiration}`}
        onClose={onClose}
      />

      <SheetBody>
        <SectionCard>
          <div className="px-3.5 py-2.5 flex flex-col">
            <div className="flex items-center justify-between py-2 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
              <span className="text-wb-text-secondary">Position</span>
              <span>
                {ticker} CALL ${formattedStrike} · {ccExpiration}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
              <span className="text-wb-text-secondary">Contracts</span>
              <span>{contracts}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
              <span className="text-wb-text-secondary">Shares to deliver</span>
              <span className="text-wb-text-primary">{sharesHeld} shares</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[rgba(30,42,56,0.6)] text-[11px]">
              <span className="text-wb-text-secondary">Phase transition</span>
              <span className="flex items-center gap-1.5">
                <PhaseBadge phase="CC_OPEN" />
                <span className="text-[9px] text-wb-text-muted">→</span>
                <PhaseBadge phase="WHEEL_COMPLETE" />
              </span>
            </div>

            {/* P&L Breakdown waterfall */}
            <div className="bg-wb-bg-elevated border border-wb-border py-2.5 border-b border-b-[rgba(30,42,56,0.6)] bg-[rgba(14,24,36,0.3)]">
              <Caption>P&amp;L Breakdown</Caption>

              <div className="flex justify-between mb-1.5 mt-2">
                <span className="text-[11px] text-wb-text-secondary">
                  CC strike (shares delivered)
                </span>
                <span className="text-[11px] font-semibold text-wb-text-primary font-wb-mono">
                  ${formattedStrike}
                </span>
              </div>

              <div className="flex justify-between mb-1.5">
                <span className="text-[11px] text-wb-text-secondary">− Effective cost basis</span>
                <span className="text-[11px] font-semibold text-wb-red font-wb-mono">
                  ${formattedBasis}
                </span>
              </div>

              <div className="flex justify-between mb-0.5 pl-3">
                <span className="text-[10px] text-wb-text-muted">= Appreciation per share</span>
                <span className="text-[10px] text-wb-text-secondary font-wb-mono">
                  {appPerShare.gte(0) ? '' : '−'}${appPerShare.abs().toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between mb-2 pl-3">
                <span className="text-[10px] text-wb-text-muted">× {sharesHeld} shares</span>
                <span
                  className="text-[11px] font-semibold font-wb-mono"
                  style={{ color: pnlColor(appreciationTotal) }}
                >
                  ${Math.abs(parseFloat(appreciationTotal)).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between pt-2 border-t border-[rgba(30,42,56,0.8)]">
                <span className="text-xs font-bold" style={{ color: finalPnlColor }}>
                  = Final cycle P&amp;L
                </span>
                <span className="text-base font-bold font-wb-mono" style={{ color: finalPnlColor }}>
                  {pnlValue}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between py-2 text-[10px]">
              <span className="text-wb-text-muted">effective cost basis · {sharesHeld} shares</span>
              <span>
                ${formattedBasis}/share · ${formattedCapital} total
              </span>
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-col gap-1">
          <label className="text-wb-text-secondary text-[0.7rem] font-semibold tracking-[0.07em] uppercase font-wb-mono">
            Fill Date
          </label>
          <div className="w-full px-3.5 py-2.5 rounded-md border border-wb-border text-wb-text-secondary text-sm font-wb-mono flex items-center justify-between bg-[rgba(14,24,36,0.6)]">
            <span>{ccExpiration}</span>
            <span className="text-[9px] tracking-[0.1em] uppercase text-wb-text-muted">auto</span>
          </div>
          <span className="text-[0.7rem] text-wb-text-muted">
            Derived from your CC — the day shares are delivered to the buyer
          </span>
        </div>

        <AlertBox variant="warning">
          <strong>This cannot be undone.</strong> The position will close as WHEEL_COMPLETE. Full
          leg history is preserved.
        </AlertBox>
      </SheetBody>

      <SheetFooter>
        <FormButton label="Cancel" variant="secondary" onClick={onClose} style={{ flex: 1 }} />
        <FormButton
          label="Confirm Call-Away"
          pendingLabel="Confirming…"
          isPending={isPending}
          onClick={onSubmit}
          data-testid="call-away-submit"
          style={{ flex: 1 }}
        />
      </SheetFooter>
    </div>
  )
}
