import type { MarketStatus, OptionSnapshot, StockQuote } from '../../api/market-data'
import type { WheelListItem } from '../../api/positions'
import { fmtMoneyGrouped } from '../../lib/format'
import {
  deriveWheelCardDisplay,
  type OptionCardDisplay,
  type PnlTone,
  type WheelCardDisplay,
  type WheelCardMark
} from '../../lib/wheel-card-display'
import { ExpiringSoonFlag } from '../ExpiringSoonFlag'
import { PhaseBadge } from '../PhaseBadge'
import { TargetBadge } from '../TargetBadge'
import { ActionStrip } from './ActionStrip'
import { CardFooter } from './CardFooter'
import { CardFooterCell } from './CardFooterCell'
import { CardHeader } from './CardHeader'
import { CardShell } from './CardShell'
import { LegBlock } from './LegBlock'
import { PriceBlock } from './PriceBlock'
import { EYEBROW, HEADLINE_FIGURE, SUB } from './styles'
import type { CardAction } from './types'

const PNL_TONE_CLASS: Record<PnlTone, string> = {
  gain: 'text-wb-green',
  loss: 'text-wb-red'
}

export type WheelCardProps = {
  item: WheelListItem
  /** The position's open queue rows as card actions, worst first. */
  actions: CardAction[]
  /** Renders the card closed; defaults to whether the item's status is CLOSED. */
  isClosed?: boolean
  quote?: StockQuote
  session?: MarketStatus['session']
  snapshot?: OptionSnapshot
  hasPendingAssignment?: boolean
  profitTargetDefault?: number
}

function MarkText({ mark, testId }: { mark: WheelCardMark; testId: string }): React.JSX.Element {
  if (mark === 'unavailable') {
    return (
      <span data-testid={testId} title="Option snapshot unavailable" className="cursor-help">
        — unavailable
      </span>
    )
  }
  const { note } = mark
  return (
    <span data-testid={testId}>
      {mark.mid}
      {note?.kind === 'noBid' && <span className={SUB}> no bid</span>}
      {note?.kind === 'wideSpread' && (
        <span
          data-testid="opt-mid-spread-warning"
          title={note.tooltip}
          className="ml-1 text-wb-gold"
        >
          ⚠
        </span>
      )}
    </span>
  )
}

/** The header's TARGET badge and expiring-soon flag; only an open option leg has either. */
function OptionLegFlags({ pnl, leg }: Pick<OptionCardDisplay, 'pnl' | 'leg'>): React.JSX.Element {
  return (
    <>
      {pnl !== 'unavailable' && pnl.target && <TargetBadge targetReached {...pnl.target} />}
      {leg.dteUrgent && <ExpiringSoonFlag compact />}
    </>
  )
}

function PnlFigure({
  pnl,
  testId
}: {
  pnl: WheelCardDisplay['pnl']
  testId: string
}): React.JSX.Element {
  const blank = typeof pnl === 'string'
  const tone = blank ? 'text-wb-text-muted' : PNL_TONE_CLASS[pnl.tone]
  return (
    <div data-testid={testId}>
      <div className={`${HEADLINE_FIGURE} ${tone}`}>{blank ? '—' : pnl.amount}</div>
      <div className={`font-wb-mono text-[10.5px] ${tone}`}>{blank ? pnl : pnl.percentLine}</div>
    </div>
  )
}

function WheelLeg({
  leg,
  actions,
  markTestId
}: {
  leg: WheelCardDisplay['leg']
  actions: CardAction[]
  markTestId: string
}): React.JSX.Element {
  if (typeof leg === 'string') {
    return (
      <LegBlock
        tag="·"
        title={<span className="text-wb-text-muted">{leg}</span>}
        dte={<span className="text-wb-text-muted">—</span>}
        mark={
          <span data-testid={markTestId} className="text-wb-text-muted">
            —
          </span>
        }
      />
    )
  }
  return (
    <LegBlock
      tag={leg.tag}
      actions={actions}
      title={
        <>
          {leg.title}
          <span className={SUB}> · {leg.expiration}</span>
        </>
      }
      dte={
        <span className={leg.dteUrgent ? 'font-semibold text-wb-gold' : 'text-wb-text-secondary'}>
          {leg.dte}
        </span>
      }
      mark={<MarkText mark={leg.mark} testId={markTestId} />}
      trailing={<span className={SUB}> · {leg.credit} credit</span>}
    />
  )
}

export function WheelCard({
  item,
  actions,
  isClosed,
  quote,
  session,
  snapshot,
  hasPendingAssignment = false,
  profitTargetDefault
}: WheelCardProps): React.JSX.Element {
  const closed = isClosed ?? item.status === 'CLOSED'
  const display = deriveWheelCardDisplay(item, snapshot, quote, { closed, profitTargetDefault })
  const openActions = closed ? [] : actions
  const href = `#/positions/${item.id}`

  return (
    <CardShell accent={item.phase} edge={openActions[0]?.tone} closed={closed} href={href}>
      <ActionStrip actions={openActions} />
      <CardHeader
        href={href}
        ticker={item.ticker}
        price={
          <PriceBlock
            price={display.price}
            sub={display.priceSubline}
            testId={`position-card-${item.ticker}-price`}
            closed={closed}
            quote={quote}
            session={session}
          />
        }
      >
        {hasPendingAssignment && (
          <span
            data-testid={`pending-assignment-indicator-${item.id}`}
            className="inline-block h-2 w-2 rounded-full bg-wb-gold animate-wb-pulse"
            aria-label="Assignment pending"
          />
        )}
        <PhaseBadge phase={item.phase} variant="short" />
        {display.kind === 'option' && <OptionLegFlags pnl={display.pnl} leg={display.leg} />}
      </CardHeader>
      <div className="grid gap-[9px] px-[13px] py-[11px]">
        <div>
          <div className={`${EYEBROW} mb-[3px]`}>Unrealized P&L</div>
          <PnlFigure pnl={display.pnl} testId={`position-card-${item.ticker}-pnl`} />
        </div>
        <WheelLeg
          leg={display.leg}
          actions={openActions}
          markTestId={`position-card-${item.ticker}-opt-mid`}
        />
      </div>
      <CardFooter>
        <CardFooterCell label="Cost basis" valueClassName="text-wb-sky" sub="/ share">
          {fmtMoneyGrouped(item.effectiveCostBasis)}
        </CardFooterCell>
        <CardFooterCell label="Premium collected" valueClassName="text-wb-green" sub="to date">
          {fmtMoneyGrouped(item.premiumCollected)}
        </CardFooterCell>
      </CardFooter>
    </CardShell>
  )
}
