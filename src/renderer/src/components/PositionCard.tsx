import { useState } from 'react'
import type { PositionListItem, WheelPhase } from '../api/positions'

const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'

function fmt(value: string): string {
  return `$${parseFloat(value).toFixed(2)}`
}

const PHASE_COLOR: Record<WheelPhase, string> = {
  CSP_OPEN: '#e6a817',
  CSP_EXPIRED: '#484f58',
  CSP_CLOSED_PROFIT: '#3fb950',
  CSP_CLOSED_LOSS: '#f85149',
  HOLDING_SHARES: '#79c0ff',
  CC_OPEN: '#d2a8ff',
  CC_EXPIRED: '#484f58',
  CC_CLOSED_PROFIT: '#3fb950',
  CC_CLOSED_LOSS: '#f85149',
  WHEEL_COMPLETE: '#3fb950'
}

const PHASE_LABEL: Record<WheelPhase, string> = {
  CSP_OPEN: 'CSP Open',
  CSP_EXPIRED: 'CSP Expired',
  CSP_CLOSED_PROFIT: 'CSP ✓',
  CSP_CLOSED_LOSS: 'CSP ✗',
  HOLDING_SHARES: 'Shares',
  CC_OPEN: 'CC Open',
  CC_EXPIRED: 'CC Expired',
  CC_CLOSED_PROFIT: 'CC ✓',
  CC_CLOSED_LOSS: 'CC ✗',
  WHEEL_COMPLETE: 'Complete'
}

type Props = { item: PositionListItem; index: number }

export function PositionRow({ item, index }: Props): React.JSX.Element {
  const [hovered, setHovered] = useState(false)
  const color = PHASE_COLOR[item.phase]
  const dteUrgent = item.dte !== null && item.dte <= 7

  return (
    <tr
      onClick={() => {
        window.location.hash = `/positions/${item.id}`
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--wb-border-subtle)',
        background: hovered
          ? 'var(--wb-bg-hover)'
          : index % 2 === 0
            ? 'transparent'
            : 'rgba(255,255,255,0.01)',
        cursor: 'pointer',
        transition: 'background 0.1s',
        borderLeft: `3px solid ${hovered ? color : 'transparent'}`
      }}
    >
      {/* Ticker */}
      <td style={{ padding: '10px 16px' }}>
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
      </td>

      {/* Phase */}
      <td style={{ padding: '10px 16px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: '0.7rem',
            fontWeight: 500,
            fontFamily: MONO,
            color,
            background: `${color}18`,
            border: `1px solid ${color}30`
          }}
        >
          <span
            style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }}
          />
          {PHASE_LABEL[item.phase]}
        </span>
      </td>

      {/* Strike */}
      <td style={{ padding: '10px 16px' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.8125rem', color: 'var(--wb-text-primary)' }}>
          {item.strike ? fmt(item.strike) : '—'}
        </span>
      </td>

      {/* Expiration */}
      <td style={{ padding: '10px 16px' }}>
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
      </td>

      {/* DTE */}
      <td style={{ padding: '10px 16px' }}>
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
      </td>

      {/* Premium */}
      <td style={{ padding: '10px 16px' }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: '0.8125rem',
            color: 'var(--wb-green)',
            fontWeight: 500
          }}
        >
          {fmt(item.premium_collected)}
        </span>
      </td>

      {/* Cost Basis */}
      <td style={{ padding: '10px 16px' }}>
        <span style={{ fontFamily: MONO, fontSize: '0.8125rem', color: 'var(--wb-text-primary)' }}>
          {fmt(item.effective_cost_basis)}
        </span>
      </td>
    </tr>
  )
}
