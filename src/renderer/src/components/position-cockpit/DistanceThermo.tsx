import type { CSSProperties } from 'react'
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

  return (
    <div className="w-full">
      <div style={trackStyle}>
        <div className="absolute -top-1 -bottom-1 left-1/2 w-0.5 -translate-x-1/2 bg-wb-text-primary opacity-60" />
        <div
          className="absolute -top-0.5 -bottom-0.5 w-1 -translate-x-1/2 rounded-sm"
          style={{ left: `${x}%`, background: color }}
        />
      </div>
      <div className="flex justify-between font-wb-mono text-[9px] text-wb-text-muted mt-1.5 tracking-[0.05em]">
        <span>−{range}%</span>
        <span className="text-wb-text-secondary">STRIKE</span>
        <span>+{range}%</span>
      </div>
    </div>
  )
}
