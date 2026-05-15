import type { CSSProperties } from 'react'
import { MONO } from '../../lib/tokens'
import type { Distance } from '../../lib/verdict'
import { SEVERITY_COLOR } from '../../lib/verdict'

type DistanceThermoProps = {
  dist: Distance
  /** +/- range in percent shown across the track (default 5) */
  range?: number
}

export function DistanceThermo({ dist, range = 5 }: DistanceThermoProps): React.JSX.Element {
  const clamped = Math.max(-range, Math.min(range, dist.pct))
  const x = ((clamped + range) / (2 * range)) * 100
  const color = SEVERITY_COLOR[dist.severity]

  const trackStyle: CSSProperties = {
    position: 'relative',
    height: 14,
    background:
      'linear-gradient(to right, var(--wb-red) 0%, color-mix(in srgb, var(--wb-red) 25%, transparent) 24%, color-mix(in srgb, var(--wb-gold) 30%, transparent) 48%, color-mix(in srgb, var(--wb-gold) 20%, transparent) 52%, color-mix(in srgb, var(--wb-green) 20%, transparent) 76%, var(--wb-green) 100%)',
    borderRadius: 7,
    border: '1px solid var(--wb-border)',
    overflow: 'visible'
  }
  const strikeMarker: CSSProperties = {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: '50%',
    width: 2,
    background: 'var(--wb-text-primary)',
    transform: 'translateX(-50%)',
    opacity: 0.6
  }
  const underlyingMarker: CSSProperties = {
    position: 'absolute',
    top: -3,
    bottom: -3,
    left: `${x}%`,
    width: 4,
    background: color,
    transform: 'translateX(-50%)',
    borderRadius: 2,
    boxShadow: `0 0 0 2px var(--wb-bg-surface), 0 0 0 3px ${color}60`
  }
  const labelRow: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontFamily: MONO,
    fontSize: 9,
    color: 'var(--wb-text-muted)',
    marginTop: 5,
    letterSpacing: '0.05em'
  }
  return (
    <div style={{ width: '100%' }}>
      <div style={trackStyle}>
        <div style={strikeMarker} />
        <div style={underlyingMarker} />
      </div>
      <div style={labelRow}>
        <span>−{range}%</span>
        <span style={{ color: 'var(--wb-text-secondary)' }}>STRIKE</span>
        <span>+{range}%</span>
      </div>
    </div>
  )
}
