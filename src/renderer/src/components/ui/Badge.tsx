import { tintFromColor } from '../../lib/colorTint'

type BadgeProps = {
  children: React.ReactNode
  color?: string
  className?: string
}

const GOLD_TINT = {
  background: 'var(--wb-gold-dim)',
  border: '1px solid var(--wb-gold-border)',
  color: 'var(--wb-gold)'
}

export function Badge({ children, color, className }: BadgeProps): React.JSX.Element {
  const tint = color ? tintFromColor(color) : GOLD_TINT

  return (
    <span
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
