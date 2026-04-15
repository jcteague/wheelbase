type BadgeProps = {
  children: React.ReactNode
  color?: string
  className?: string
}

export function Badge({ children, color, className }: BadgeProps): React.JSX.Element {
  const fg = color ?? 'var(--wb-gold)'
  const bg = color ? `${color}18` : 'var(--wb-gold-dim)'
  const border = color ? `1px solid ${color}30` : '1px solid var(--wb-gold-border)'

  return (
    <span
      className={[
        'inline-flex items-center font-wb-mono font-medium rounded-[10px] text-[0.65rem] py-[1px] px-[7px]',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ background: bg, color: fg, border }}
    >
      {children}
    </span>
  )
}
