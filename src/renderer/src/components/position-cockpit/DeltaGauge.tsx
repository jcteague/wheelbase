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

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
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
      <div className="absolute inset-0 flex flex-col items-center justify-center font-wb-mono text-wb-text-primary">
        <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
          {absDelta.toFixed(2)}
        </span>
        <span className="text-[9px] text-wb-text-muted tracking-[0.1em] mt-1">
          DELTA{tight ? ' · TIGHT' : ''}
        </span>
      </div>
    </div>
  )
}
