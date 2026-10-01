import type { PmccListItem } from '../api/positions'
import { fmtMoney, fmtMoneyGrouped } from '../lib/format'
import { PHASE_COLOR } from '../lib/phase'
import { PhaseBadge } from './PhaseBadge'
import { PriceCell, type StockQuote } from './PriceCell'
import { CELL_CLASS, rowStyle, VALUE_CLASS } from './positionRowStyles'
import { Badge } from './ui/Badge'
import { TableCell } from './ui/TablePrimitives'

type Props = {
  item: PmccListItem
  index: number
  quote?: StockQuote
  session?: string
}

/**
 * The minimal list row for a PMCC: both legs side by side, no wheel-only target badge,
 * expiring-soon flag, option mid or P&L — PMCC valuation (US-118) replaces this row.
 */
export function PmccPositionRow({ item, index, quote, session }: Props): React.JSX.Element {
  const { long, short, initialNetDebit } = item.pmcc

  return (
    <tr
      data-testid="position-card"
      className="wb-position-row bg-wb-bg-surface border border-wb-border"
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
            <Badge color={PHASE_COLOR[item.phase]}>PMCC</Badge>
          </div>
          <span className="text-[0.65rem] text-wb-text-muted font-wb-mono">{item.status}</span>
        </div>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <PhaseBadge phase={item.phase} variant="short" />
      </TableCell>

      <PriceCell quote={quote} session={session} testId={`position-card-${item.ticker}-price`} />

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-muted`}>—</span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-muted`}>—</span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-primary`}>
          {`${fmtMoney(long.strike)} / ${fmtMoney(short.strike)}`}
        </span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <div className={`${VALUE_CLASS} flex flex-col text-wb-text-secondary tracking-[0.03em]`}>
          <span>{`LEAPS · ${long.expiration}`}</span>
          <span>{`Short · ${short.expiration}`}</span>
        </div>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <div className={`${VALUE_CLASS} flex flex-col font-normal text-wb-text-secondary`}>
          <span>{`${long.dte}d`}</span>
          <span>{`${short.dte}d`}</span>
        </div>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-green font-medium`}>
          {fmtMoney(item.premium_collected)}
        </span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-primary`}>
          {`${fmtMoneyGrouped(initialNetDebit)} net debit`}
        </span>
      </TableCell>
    </tr>
  )
}
