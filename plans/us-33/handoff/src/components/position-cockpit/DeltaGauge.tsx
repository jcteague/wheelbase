import type { CSSProperties } from 'react'
import { MONO } from '../../lib/tokens'

type DeltaGaugeProps = {
  absDelta: number
  /** color token reference, e.g. var(--wb-red) */
  color: string
  /** label suffix when DTE <= 7 */
  tight?: boolean
  size?: number
}

export function DeltaGauge({
  absDelta,
  color,
  tight,
  size = 108
}: DeltaGaugeProps): React.JSX.Element {
  const r = (size - 14) / 2
  const cx = size / 2
  const cy = size / 2
  const circ = 2 * Math.PI * r
  const value = Math.max(0, Math.min(1, absDelta))

  const wrapStyle: CSSProperties = {
    position: 'relative',
    width: size,
    height: size,
    flexShrink: 0
  }
  const innerStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: MONO,
    color: 'var(--wb-text-primary)'
  }
  return (
    <div style={wrapStyle}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} stroke="var(--wb-border)" strokeWidth={6} fill="none" />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={color}
          strokeWidth={6}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - value)}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div style={innerStyle}>
        <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
          {absDelta.toFixed(2)}
        </span>
        <span
          style={{
            fontSize: 9,
            color: 'var(--wb-text-muted)',
            letterSpacing: '0.1em',
            marginTop: 4
          }}
        >
          DELTA{tight ? ' · TIGHT' : ''}
        </span>
      </div>
    </div>
  )
}
