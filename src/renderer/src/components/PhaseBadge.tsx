import type { WheelPhase } from '../api/positions'
import { PHASE_COLOR, PHASE_LABEL, PHASE_LABEL_SHORT } from '../lib/phase'
import { Badge } from './ui/Badge'

type Props = {
  phase: WheelPhase
  variant?: 'default' | 'short'
  /** Shown in place of the phase label, in the phase's colour. */
  label?: string
}

export function PhaseBadge({ phase, variant = 'default', label }: Props): React.JSX.Element {
  const color = PHASE_COLOR[phase]
  const text = label ?? (variant === 'short' ? PHASE_LABEL_SHORT : PHASE_LABEL)[phase]

  return (
    <Badge
      color={color}
      className={[
        'gap-[5px] rounded text-[0.7rem]',
        variant === 'short' ? 'px-2 py-0.5' : 'px-[9px] py-0.5'
      ].join(' ')}
    >
      <span className="w-[5px] h-[5px] shrink-0 rounded-full" style={{ background: color }} />
      {text}
    </Badge>
  )
}
