import { MONO } from '../../lib/tokens'

type BadgeProps = {
  children: React.ReactNode
  color?: string
  style?: React.CSSProperties
}

export function Badge({ children, color, style }: BadgeProps): React.JSX.Element {
  const fg = color ?? 'var(--wb-gold)'
  const bg = color ? `${color}18` : 'var(--wb-gold-dim)'
  const border = color ? `1px solid ${color}30` : '1px solid var(--wb-gold-border)'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '0.65rem',
        fontWeight: 500,
        padding: '1px 7px',
        borderRadius: 10,
        background: bg,
        color: fg,
        border,
        fontFamily: MONO,
        ...style
      }}
    >
      {children}
    </span>
  )
}
