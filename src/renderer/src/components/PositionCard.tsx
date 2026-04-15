import type { PositionListItem } from '../api/positions'
import { fmtMoney } from '../lib/format'
import { PHASE_COLOR } from '../lib/phase'
import { PhaseBadge } from './PhaseBadge'
import { TableCell } from './ui/TablePrimitives'

type Props = { item: PositionListItem; index: number; isClosed?: boolean }

export function PositionRow({ item, index, isClosed }: Props): React.JSX.Element {
  const color = PHASE_COLOR[item.phase]
  const dteUrgent = item.dte !== null && item.dte <= 7
  const closed = isClosed ?? item.status === 'CLOSED'

  return (
    <tr
      data-testid={closed ? 'position-card-closed' : 'position-card'}
      className="wb-position-row bg-wb-bg-surface border border-wb-border"
      onClick={() => {
        window.location.hash = `/positions/${item.id}`
      }}
      style={{
        ['--wb-row-bg' as string]: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
        ['--wb-row-phase-color' as string]: color
      }}
    >
      {/* Ticker */}
      <TableCell className="py-[10px] px-[16px] border-b-0">
        <div className="flex flex-col gap-[1px]">
          <span className="font-wb-mono font-bold text-sm text-wb-text-primary tracking-[0.02em]">
            {item.ticker}
          </span>
          <span className="text-[0.65rem] text-wb-text-muted font-wb-mono">{item.status}</span>
        </div>
      </TableCell>

      {/* Phase */}
      <TableCell className="py-[10px] px-[16px] border-b-0">
        <PhaseBadge phase={item.phase} variant="short" />
      </TableCell>

      {/* Strike */}
      <TableCell className="py-[10px] px-[16px] border-b-0">
        <span className="font-wb-mono text-[0.8125rem] text-wb-text-primary">
          {item.strike ? fmtMoney(item.strike) : '—'}
        </span>
      </TableCell>

      {/* Expiration */}
      <TableCell className="py-[10px] px-[16px] border-b-0">
        <span className="font-wb-mono text-[0.8125rem] text-wb-text-secondary tracking-[0.03em]">
          {item.expiration ?? '—'}
        </span>
      </TableCell>

      {/* DTE */}
      <TableCell className="py-[10px] px-[16px] border-b-0">
        <span
          className={[
            'font-wb-mono text-[0.8125rem]',
            dteUrgent ? 'font-semibold text-wb-gold' : 'font-normal text-wb-text-secondary'
          ].join(' ')}
        >
          {item.dte !== null ? `${item.dte}d` : '—'}
        </span>
      </TableCell>

      {/* Premium */}
      <TableCell className="py-[10px] px-[16px] border-b-0">
        <span className="font-wb-mono text-[0.8125rem] text-wb-green font-medium">
          {fmtMoney(item.premium_collected)}
        </span>
      </TableCell>

      {/* Cost Basis */}
      <TableCell className="py-[10px] px-[16px] border-b-0">
        <span className="font-wb-mono text-[0.8125rem] text-wb-text-primary">
          {fmtMoney(item.effective_cost_basis)}
        </span>
      </TableCell>
    </tr>
  )
}
