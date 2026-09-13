import { tintFromColor } from '../../lib/colorTint'

// Deliberately not `ComponentProps<'span'>`: the badge owns its className and tint, so
// advertising every span attribute and then dropping most of them would be a lie. Only
// the data hooks the tests and e2e specs need are passed through — the same bargain
// `AlertBox` strikes.
type BadgeProps = {
  children: React.ReactNode
  color?: string
  className?: string
  'data-testid'?: string
  'data-verdict'?: string
}

const GOLD_TINT = {
  background: 'var(--wb-gold-dim)',
  border: '1px solid var(--wb-gold-border)',
  color: 'var(--wb-gold)'
}

export function Badge({ children, color, className, ...rest }: BadgeProps): React.JSX.Element {
  const tint = color ? tintFromColor(color) : GOLD_TINT

  return (
    <span
      {...rest}
      className={[
        'inline-flex items-center font-wb-mono font-medium rounded-[10px] text-[0.65rem] py-[1px] px-[7px]',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      style={tint}
    >
      {children}
    </span>
  )
}
