import type { MarketStatus, StockQuote } from '../../api/market-data'
import type { PmccListItem } from '../../api/positions'
import { fmtMoney, fmtMoneyGrouped } from '../../lib/format'
import { PHASE_COLOR, PHASE_LABEL } from '../../lib/phase'
import { Badge } from '../ui/Badge'
import { CardFooter } from './CardFooter'
import { CardFooterCell } from './CardFooterCell'
import { CardHeader } from './CardHeader'
import { CardShell } from './CardShell'
import { LegBlock } from './LegBlock'
import { PriceBlock } from './PriceBlock'
import { EYEBROW, HEADLINE_FIGURE, SUB } from './styles'

export type PmccCardProps = {
  item: PmccListItem
  quote?: StockQuote
  session?: MarketStatus['session']
  /** Renders the card closed; defaults to whether the item's status is CLOSED. */
  isClosed?: boolean
}

/**
 * The minimal PMCC card: both open legs in the card grid's shell, with no valuation, action
 * strip, TARGET badge or expiring-soon flag — US-108's full PMCC card replaces it.
 */
export function PmccCard({ item, quote, session, isClosed }: PmccCardProps): React.JSX.Element {
  const { long, short, basisPerShare, basisTotal } = item.pmcc
  const closed = isClosed ?? item.status === 'CLOSED'
  const href = `#/positions/${item.id}`
  const nextDecisionDte = short?.dte ?? long.dte
  const legDte = (dte: number): string => (closed ? '—' : `${dte}d`)

  return (
    <CardShell accent="PMCC" closed={closed} href={href}>
      <CardHeader
        href={href}
        ticker={item.ticker}
        price={
          <PriceBlock
            price={closed ? null : (quote?.price ?? null)}
            sub={closed ? 'closed' : `${nextDecisionDte}d to next decision`}
            testId={`position-card-${item.ticker}-price`}
            closed={closed}
            quote={quote}
            session={session}
          />
        }
      >
        <Badge color={PHASE_COLOR.PMCC_OPEN}>PMCC</Badge>
      </CardHeader>
      <div className="grid gap-[9px] px-[13px] py-[11px]">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className={`${EYEBROW} mb-[3px]`}>Net P&L</div>
            <div
              data-testid={`position-card-${item.ticker}-pnl`}
              className={`${HEADLINE_FIGURE} text-wb-text-muted`}
            >
              —
            </div>
            <div className={SUB}>{closed ? 'closed — no live marks' : 'no valuation yet'}</div>
          </div>
          <span className={`${SUB} text-right`}>
            {short ? PHASE_LABEL[item.phase] : 'No short open'}
          </span>
        </div>
        <LegBlock
          tag="L"
          title={
            <>
              {fmtMoney(long.strike)} LEAPS<span className={SUB}> · {long.expiration}</span>
            </>
          }
          dte={legDte(long.dte)}
          mark="—"
        />
        {short && (
          <LegBlock
            tag="S"
            title={
              <>
                {fmtMoney(short.strike)} call<span className={SUB}> · {short.expiration}</span>
              </>
            }
            dte={legDte(short.dte)}
            mark="—"
          />
        )}
      </div>
      <CardFooter>
        <CardFooterCell
          label="Cost basis"
          valueClassName="text-wb-sky"
          sub={`${fmtMoney(basisPerShare)} / share`}
        >
          {fmtMoneyGrouped(basisTotal)}
        </CardFooterCell>
        <CardFooterCell label="Premium collected" valueClassName="text-wb-green" sub="to date">
          {fmtMoneyGrouped(item.premiumCollected)}
        </CardFooterCell>
      </CardFooter>
    </CardShell>
  )
}
