import type { CSSProperties } from 'react'
import type { Pnl } from '../../lib/verdict'

type PnlBarProps = { pnl: Pnl; height?: number }

export function PnlBar({ pnl, height = 10 }: PnlBarProps): React.JSX.Element {
  const pct = Math.max(-20, Math.min(120, pnl.pct))
  const fillWidth = Math.max(0, pct) + '%'
  const color =
    pnl.pct >= 25 ? 'var(--wb-green)' : pnl.pct >= 0 ? 'var(--wb-gold)' : 'var(--wb-red)'

  const trackStyle: CSSProperties = {
    position: 'relative',
    background: 'var(--wb-bg-base)',
    borderRadius: 4,
    height,
    overflow: 'hidden',
    border: '1px solid var(--wb-border)'
  }
  const fillStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: fillWidth,
    background: color,
    opacity: 0.85,
    transition: 'width 0.4s ease'
  }
  const markerStyle: CSSProperties = {
    position: 'absolute',
    top: -2,
    bottom: -2,
    left: '50%',
    width: 1,
    background: 'var(--wb-text-primary)',
    opacity: 0.5
  }

  return (
    <div
      style={trackStyle}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={fillStyle} />
      <div style={markerStyle} aria-hidden />
    </div>
  )
}
