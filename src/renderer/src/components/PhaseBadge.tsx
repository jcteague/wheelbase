import type { WheelPhase } from '../api/positions'
import { PHASE_COLOR, PHASE_LABEL, PHASE_LABEL_SHORT } from '../lib/phase'
import { MONO } from '../lib/tokens'

type Props = {
  phase: WheelPhase
  variant?: 'default' | 'short'
}

export function PhaseBadge({ phase, variant = 'default' }: Props): React.JSX.Element {
  const color = PHASE_COLOR[phase]
  const label = (variant === 'short' ? PHASE_LABEL_SHORT : PHASE_LABEL)[phase]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: variant === 'short' ? '2px 8px' : '2px 9px',
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
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: color,
          flexShrink: 0
        }}
      />
      {label}
    </span>
  )
}
