import type { WheelPhase } from '../api/positions'
import { PHASE_COLOR, PHASE_LABEL, PHASE_LABEL_SHORT } from '../lib/phase'
import { Badge } from './ui/Badge'

type Props = {
  phase: WheelPhase
  variant?: 'default' | 'short'
}

export function PhaseBadge({ phase, variant = 'default' }: Props): React.JSX.Element {
  const color = PHASE_COLOR[phase]
  const label = (variant === 'short' ? PHASE_LABEL_SHORT : PHASE_LABEL)[phase]

  return (
    <Badge
      color={color}
      style={{
        gap: 5,
        padding: variant === 'short' ? '2px 8px' : '2px 9px',
        borderRadius: 4,
        fontSize: '0.7rem'
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
    </Badge>
  )
}
