import Decimal from 'decimal.js'
import { fmtMoney } from '../lib/format'
import { AlertBox } from './ui/AlertBox'
import { Caption } from './ui/Caption'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { PhaseBadge } from './PhaseBadge'
import { SheetHeader, SheetBody, SheetFooter } from './ui/Sheet'

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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <SheetHeader
        eyebrow="Complete"
        title={`${ticker} CC Closed`}
        subtitle={`CALL ${fmtMoney(strike)} · filled ${fmtMoney(closePrice)}`}
        onClose={onClose}
      />

      <SheetBody>
        <div className="text-center p-5 rounded-lg bg-wb-bg-elevated border border-wb-border">
          <div
            className={`text-[2rem] font-extrabold ${pnl.gte(0) ? 'text-wb-green' : 'text-wb-red'}`}
          >
            {heroSign}${pnl.abs().toFixed(2)}
          </div>
          <div className="text-[0.75rem] text-wb-text-muted mt-1">CC Leg P&amp;L</div>
        </div>

        <SectionCard>
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex justify-between text-[0.8rem]">
              <span className="text-wb-text-muted">Leg recorded</span>
              <span>CC_CLOSE · {fillDate}</span>
            </div>
            <div className="flex justify-between text-[0.8rem]">
              <span className="text-wb-text-muted">Fill price</span>
              <span>{fmtMoney(closePrice)}</span>
            </div>
            <div className="flex justify-between text-[0.8rem]">
              <span className="text-wb-text-muted">Open premium</span>
              <span>{fmtMoney(openPremium)}</span>
            </div>
            <div className="flex justify-between text-[0.8rem]">
              <span className="text-wb-text-muted">Phase transition</span>
              <div className="flex flex-col items-end gap-1.5">
                <span className="flex gap-1 items-center">
                  <PhaseBadge phase="CC_OPEN" />
                  <span>→</span>
                  <PhaseBadge phase="HOLDING_SHARES" />
                </span>
              </div>
            </div>
            <div className="flex justify-between text-[0.8rem]">
              <span className="text-wb-text-muted">Cost basis</span>
              <span>${basisPerShare} / share (unchanged)</span>
            </div>
          </div>
        </SectionCard>

        <AlertBox variant="info">
          You&apos;re back in Holding Shares. Sell a new covered call to keep the wheel spinning.
        </AlertBox>

        <Caption>What&apos;s next?</Caption>
      </SheetBody>

      <SheetFooter>
        <div className="flex flex-col gap-2 w-full">
          <FormButton
            label={`Sell New Covered Call on ${ticker} →`}
            onClick={onClose}
            style={{ width: '100%' }}
          />
          <button
            className="bg-transparent border-none text-wb-text-muted cursor-pointer text-[0.8rem]"
            onClick={onClose}
          >
            View full position history
          </button>
        </div>
      </SheetFooter>
    </div>
  )
}
