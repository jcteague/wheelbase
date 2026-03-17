import type { PositionListItem } from '../api/positions'
import { fmtMoney } from '../lib/format'
import { PHASE_COLOR } from '../lib/phase'
import { MONO } from '../lib/tokens'
import { PhaseBadge } from './PhaseBadge'
import { TableCell } from './ui/TablePrimitives'

type Props = { item: PositionListItem; index: number; isClosed?: boolean }

export function PositionRow({ item, index, isClosed }: Props): React.JSX.Element {
  const color = PHASE_COLOR[item.phase]
  const dteUrgent = item.dte !== null && item.dte <= 7
  const closed = isClosed ?? item.status === 'CLOSED'
  const rowStyle = {
    borderBottom: '1px solid var(--wb-border-subtle)',
    ['--wb-row-bg' as string]: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
    ['--wb-row-phase-color' as string]: color
  } as React.CSSProperties

  return (
    <tr
      data-testid={closed ? 'position-card-closed' : 'position-card'}
      className="wb-position-row"
      onClick={() => {
        window.location.hash = `/positions/${item.id}`
      }}
      style={rowStyle}
    >
      {/* Ticker */}
      <TableCell style={{ padding: '10px 16px', borderBottom: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span
            style={{
              fontFamily: MONO,
              fontWeight: 700,
              fontSize: '0.875rem',
              color: 'var(--wb-text-primary)',
              letterSpacing: '0.02em'
            }}
          >
            {item.ticker}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--wb-text-muted)', fontFamily: MONO }}>
            {item.status}
          </span>
        </div>
      </TableCell>

      {/* Phase */}
      <TableCell style={{ padding: '10px 16px', borderBottom: 'none' }}>
        <PhaseBadge phase={item.phase} variant="short" />
      </TableCell>

      {/* Strike */}
      <TableCell style={{ padding: '10px 16px', borderBottom: 'none' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.8125rem', color: 'var(--wb-text-primary)' }}>
          {item.strike ? fmtMoney(item.strike) : '—'}
        </span>
      </TableCell>

      {/* Expiration */}
      <TableCell style={{ padding: '10px 16px', borderBottom: 'none' }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: '0.8125rem',
            color: 'var(--wb-text-secondary)',
            letterSpacing: '0.03em'
          }}
        >
          {item.expiration ?? '—'}
        </span>
      </TableCell>

      {/* DTE */}
      <TableCell style={{ padding: '10px 16px', borderBottom: 'none' }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: '0.8125rem',
            fontWeight: dteUrgent ? 600 : 400,
            color: dteUrgent ? 'var(--wb-gold)' : 'var(--wb-text-secondary)'
          }}
        >
          {item.dte !== null ? `${item.dte}d` : '—'}
        </span>
      </TableCell>

      {/* Premium */}
      <TableCell style={{ padding: '10px 16px', borderBottom: 'none' }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: '0.8125rem',
            color: 'var(--wb-green)',
            fontWeight: 500
          }}
        >
          {fmtMoney(item.premium_collected)}
        </span>
      </TableCell>

      {/* Cost Basis */}
      <TableCell style={{ padding: '10px 16px', borderBottom: 'none' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.8125rem', color: 'var(--wb-text-primary)' }}>
          {fmtMoney(item.effective_cost_basis)}
        </span>
      </TableCell>
    </tr>
  )
}
