import type { PositionListItem } from '../api/positions'
import { fmtMoney } from '../lib/format'
import { PHASE_COLOR } from '../lib/phase'
import { PhaseBadge } from './PhaseBadge'
import { PriceCell, type StockQuote } from './PriceCell'
import { TableCell } from './ui/TablePrimitives'

type Props = {
  item: PositionListItem
  index: number
  isClosed?: boolean
  quote?: StockQuote
  session?: string
}

const CELL_CLASS = 'py-[10px] px-[16px] border-b-0'
const VALUE_CLASS = 'font-wb-mono text-[0.8125rem]'

export function PositionRow({ item, index, isClosed, quote, session }: Props): React.JSX.Element {
  const closed = isClosed ?? item.status === 'CLOSED'
  const dteUrgent = item.dte !== null && item.dte <= 7
  const dteClass = dteUrgent
    ? `${VALUE_CLASS} font-semibold text-wb-gold`
    : `${VALUE_CLASS} font-normal text-wb-text-secondary`

  const rowStyle = {
    '--wb-row-bg': index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
    '--wb-row-phase-color': PHASE_COLOR[item.phase]
  } as React.CSSProperties

  return (
    <tr
      data-testid={closed ? 'position-card-closed' : 'position-card'}
      className="wb-position-row bg-wb-bg-surface border border-wb-border"
      onClick={() => {
        window.location.hash = `/positions/${item.id}`
      }}
      style={rowStyle}
    >
      <TableCell className={CELL_CLASS}>
        <div className="flex flex-col gap-[1px]">
          <span className="font-wb-mono font-bold text-sm text-wb-text-primary tracking-[0.02em]">
            {item.ticker}
          </span>
          <span className="text-[0.65rem] text-wb-text-muted font-wb-mono">{item.status}</span>
        </div>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <PhaseBadge phase={item.phase} variant="short" />
      </TableCell>

      <PriceCell quote={quote} session={session} testId={`position-card-${item.ticker}-price`} />

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
          {fmtMoney(item.premium_collected)}
        </span>
      </TableCell>

      <TableCell className={CELL_CLASS}>
        <span className={`${VALUE_CLASS} text-wb-text-primary`}>
          {fmtMoney(item.effective_cost_basis)}
        </span>
      </TableCell>
    </tr>
  )
}
