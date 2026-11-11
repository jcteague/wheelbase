import { useEffect, useState } from 'react'
import type { MarketStatus, OptionSnapshotsBySymbol, StockQuote } from '../../api/market-data'
import type { PmccListItem } from '../../api/positions'
import { derivePmccCardDisplay, type PmccCardDisplay } from '../../lib/pmcc-card-display'
import { PHASE_COLOR } from '../../lib/phase'
import { Badge } from '../ui/Badge'
import { ActionStrip } from './ActionStrip'
import { CardFooter } from './CardFooter'
import { CardFooterCell } from './CardFooterCell'
import { CardHeader } from './CardHeader'
import { CardShell } from './CardShell'
import { DetailBar } from './DetailBar'
import { PmccDashedLegBlock, PmccOpenLegBlock } from './PmccLegBlock'
import { PnlFigure } from './PnlFigure'
import { PriceBlock } from './PriceBlock'
import { RecoveryMeter } from './RecoveryMeter'
import { SignalTags } from './SignalTags'
import { EYEBROW, SUB } from './styles'
import { Tier2Panel } from './Tier2Panel'

export type PmccCardProps = {
  item: PmccListItem
  quote?: StockQuote
  session?: MarketStatus['session']
  /** Renders the card closed; defaults to whether the item's status is CLOSED. */
  isClosed?: boolean
  /** Option snapshots by OCC symbol; each open leg reads its own. */
  snapshots?: OptionSnapshotsBySymbol
  profitTargetDefault?: number
}

function stopPropagation(event: React.MouseEvent): void {
  event.stopPropagation()
}

function stateLabel(display: PmccCardDisplay): string {
  return display.kind === 'neutral' ? display.stateLabel : display.state
}

export function PmccCard({
  item,
  quote,
  session,
  isClosed,
  snapshots,
  profitTargetDefault
}: PmccCardProps): React.JSX.Element {
  const closed = isClosed ?? item.status === 'CLOSED'
  const display = derivePmccCardDisplay(item, snapshots, quote, { closed, profitTargetDefault })
  const open = display.kind === 'open' ? display : null
  const [tier2Requested, setTier2Requested] = useState(false)
  const tier2Open = open !== null && tier2Requested
  const href = `#/positions/${item.id}`
  const { basis, credits } = display

  useEffect(() => {
    if (!tier2Open) return
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') setTier2Requested(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [tier2Open])

  return (
    <CardShell accent="PMCC" edge={open?.signals.actions[0]?.tone} closed={closed} href={href}>
      {open && <ActionStrip actions={open.signals.actions} />}
      <CardHeader
        href={href}
        ticker={item.ticker}
        onLinkClick={stopPropagation}
        price={
          <PriceBlock
            price={display.price}
            sub={display.priceSubline}
            testId={`position-card-${item.ticker}-price`}
            closed={open === null}
            quote={quote}
            session={session}
          />
        }
      >
        <Badge color={PHASE_COLOR.PMCC_OPEN}>PMCC</Badge>
        {open && <SignalTags tags={open.signals.awareness} />}
      </CardHeader>
      <div className="grid gap-[9px] px-[13px] py-[11px]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className={`${EYEBROW} mb-[3px]`}>Net P&L · marked against basis</div>
            <PnlFigure pnl={display.pnl} testId={`position-card-${item.ticker}-pnl`} />
          </div>
          <div className={`${SUB} text-right`}>
            <div>{stateLabel(display)}</div>
            <div>{display.coverage}</div>
          </div>
        </div>
        {display.kind === 'open'
          ? display.legs.map((leg) => <PmccOpenLegBlock key={leg.legId} leg={leg} />)
          : display.legs.map((leg) => <PmccDashedLegBlock key={leg.legId} leg={leg} />)}
      </div>
      <CardFooter>
        <CardFooterCell
          label="Cost basis"
          valueClassName={basis.paidFor ? 'text-wb-gold' : 'text-wb-sky'}
          sub={basis.paidFor ? <span className="text-wb-gold">{basis.sub}</span> : basis.sub}
        >
          {basis.total}
        </CardFooterCell>
        <CardFooterCell
          label="Credits collected"
          valueClassName="text-wb-green"
          sub={credits.sub}
          extra={
            credits.meterFraction !== null && (
              <RecoveryMeter
                fraction={credits.meterFraction}
                gold={credits.meterGold}
                title={`Recovery meter — ${credits.sub}; gold at 100%`}
              />
            )
          }
        >
          {credits.total}
        </CardFooterCell>
      </CardFooter>
      {open && (
        <>
          <DetailBar open={tier2Open} onToggle={() => setTier2Requested((wasOpen) => !wasOpen)} />
          {tier2Open && <Tier2Panel cells={open.tier2} />}
        </>
      )}
    </CardShell>
  )
}
