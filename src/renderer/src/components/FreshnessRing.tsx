import type { ScreenerIvRank } from '../api/screener'

type IvrState = ScreenerIvRank['state']

type FreshnessRingProps = {
  state: IvrState
  size?: number
}

// How each tier is drawn. The ring reads as a tier, not as an age: each state gets one fixed
// step, so two stale readings a week apart still look alike. `predates_earnings` is the one
// state with no arc — its colour shows on the track and the centre dot instead.
const RING_TIER: Record<IvrState, { fraction: number; color: string }> = {
  fresh: { fraction: 1, color: 'var(--wb-green)' },
  aging: { fraction: 0.75, color: 'var(--wb-text-secondary)' },
  stale: { fraction: 0.5, color: 'var(--wb-text-muted)' },
  expired: { fraction: 0.25, color: 'var(--wb-text-muted)' },
  predates_earnings: { fraction: 0, color: 'var(--wb-gold)' }
}

const STROKE = 2.25

/**
 * The freshness tier drawn as a stepped arc. Stroke colours are SVG presentation
 * attributes bound to `wb` tokens — the "no inline styles" rule is about the `style`
 * prop, and SVG has no class-based equivalent for these.
 */
export function FreshnessRing({ state, size = 14 }: FreshnessRingProps): React.JSX.Element {
  const radius = (size - STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const centre = size / 2
  const { fraction, color } = RING_TIER[state]
  // A print outranks age, so this reading gets no arc at all — a hollow gold ring
  // around a dot, which cannot be mistaken for a partly filled tier.
  const predatesEarnings = state === 'predates_earnings'

  return (
    <svg
      data-testid="freshness-ring"
      data-state={state}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block shrink-0"
      aria-hidden="true"
    >
      <circle
        cx={centre}
        cy={centre}
        r={radius}
        fill="none"
        stroke={predatesEarnings ? color : 'var(--wb-border)'}
        strokeWidth={STROKE}
        strokeOpacity={predatesEarnings ? 0.45 : 1}
      />
      {fraction > 0 && (
        <circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={`${fraction * circumference} ${circumference}`}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
      )}
      {predatesEarnings && <circle cx={centre} cy={centre} r={1.6} fill={color} />}
    </svg>
  )
}
