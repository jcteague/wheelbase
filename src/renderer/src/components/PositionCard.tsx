import type { OptionSnapshot } from '../api/market-data'
import type { PositionListItem } from '../api/positions'
import { computeUnrealizedPnl } from '../../../main/core/costbasis'
import { resolveProfitTarget } from '../../../main/core/profit-target'
import { isOptionInstrument } from '../../../main/core/types'
import Decimal from 'decimal.js'
import { isDteUrgent } from '../lib/dte'
import { fmtMoney } from '../lib/format'
import { OptMidCell } from './OptMidCell'
import { PmccPositionRow } from './PmccPositionRow'
import { PhaseBadge } from './PhaseBadge'
import { ExpiringSoonFlag } from './ExpiringSoonFlag'
import { PriceCell, type StockQuote } from './PriceCell'
import { CELL_CLASS, rowStyle, VALUE_CLASS } from './positionRowStyles'
import { TargetBadge } from './TargetBadge'
import { UnrealizedPnlCell } from './UnrealizedPnlCell'
import { TableCell } from './ui/TablePrimitives'

type Props = {
  item: PositionListItem
  index: number
  isClosed?: boolean
  quote?: StockQuote
  session?: string
  snapshot?: OptionSnapshot
  hasPendingAssignment?: boolean
  profitTargetDefault?: number
}

type RowDisplay = {
  targetReached: boolean
  pnlPercent: string
  maxProfit: string
  targetPercent: number
}

function deriveRowDisplay(
  item: PositionListItem,
  snapshot: OptionSnapshot | undefined,
  profitTargetDefault?: number
): RowDisplay {
  const targetPercent = resolveProfitTarget(item.profitTargetPercent ?? null, profitTargetDefault)
  if (!snapshot || !item.entryPremiumPerContract || !item.contracts) {
    return { targetReached: false, pnlPercent: '0', maxProfit: '0', targetPercent }
  }
  const { pnlPercent, maxProfit } = computeUnrealizedPnl({
    entryPremium: item.entryPremiumPerContract,
    currentMid: snapshot.mid,
    contracts: item.contracts
  })
  const targetReached = new Decimal(pnlPercent).gte(targetPercent)
  return { targetReached, pnlPercent, maxProfit, targetPercent }
}

export function PositionRow({
  item,
  index,
  isClosed,
  quote,
  session,
  snapshot,
  hasPendingAssignment = false,
  profitTargetDefault
}: Props): React.JSX.Element {
  if (item.strategyType === 'PMCC') {
    return <PmccPositionRow item={item} index={index} quote={quote} session={session} />
  }
  const closed = isClosed ?? item.status === 'CLOSED'
  const dteUrgent = isDteUrgent(item.dte)
  const dteClass = dteUrgent
    ? `${VALUE_CLASS} font-semibold text-wb-gold`
    : `${VALUE_CLASS} font-normal text-wb-text-secondary`

  const effectiveSnapshot = closed ? undefined : snapshot
  const display = deriveRowDisplay(item, effectiveSnapshot, profitTargetDefault)

  const optMidLeg = isOptionInstrument(item.instrumentType)
    ? { instrumentType: item.instrumentType }
    : null

  const pnlLeg =
    item.entryPremiumPerContract && item.contracts !== null
      ? { contracts: item.contracts, entryPremiumPerContract: item.entryPremiumPerContract }
      : null

  return (
    <tr
      data-testid={closed ? 'position-card-closed' : 'position-card'}
      className={[
        'wb-position-row bg-wb-bg-surface border border-wb-border',
        dteUrgent ? 'wb-position-row--soon' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => {
        window.location.hash = `/positions/${item.id}`
      }}
      style={rowStyle(index, item.phase)}
    >
      <TableCell className={CELL_CLASS}>
        <div className="flex flex-col gap-[1px]">
          <div className="flex items-center gap-1.5">
            <span
              data-testid="position-ticker"
              className="font-wb-mono font-bold text-sm text-wb-text-primary tracking-[0.02em]"
            >
              {item.ticker}
            </span>
            {hasPendingAssignment && (
              <span
                data-testid={`pending-assignment-indicator-${item.id}`}
                className="inline-block w-2 h-2 rounded-full bg-wb-gold animate-wb-pulse"
                aria-label="Assignment pending"
              />
            )}
            <TargetBadge
              targetReached={display.targetReached}
              pnlPercent={display.pnlPercent}
              maxProfit={display.maxProfit}
              targetPercent={display.targetPercent}
            />
            {dteUrgent && <ExpiringSoonFlag compact />}
          </div>
          <span className="text-[0.65rem] text-wb-text-muted font-wb-mono">{item.status}</span>
        </div>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <PhaseBadge phase={item.phase} variant="short" />
      </TableCell>

      <PriceCell quote={quote} session={session} testId={`position-card-${item.ticker}-price`} />

      <OptMidCell ticker={item.ticker} leg={optMidLeg} snapshot={effectiveSnapshot} />

      <UnrealizedPnlCell ticker={item.ticker} leg={pnlLeg} snapshot={effectiveSnapshot} />

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-primary`}>
          {item.strike ? fmtMoney(item.strike) : '—'}
        </span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-secondary tracking-[0.03em]`}>
          {item.expiration ?? '—'}
        </span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={dteClass}>{item.dte !== null ? `${item.dte}d` : '—'}</span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-green font-medium`}>
          {fmtMoney(item.premiumCollected)}
        </span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-primary`}>
          {fmtMoney(item.effectiveCostBasis)}
        </span>
      </TableCell>
    </tr>
  )
}
