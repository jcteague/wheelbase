type AlertBoxVariant = 'success' | 'error' | 'warning' | 'info'

const VARIANT_STYLES: Record<AlertBoxVariant, { bg: string; border: string; color: string }> = {
  success: {
    bg: 'var(--wb-green-dim)',
    border: 'rgba(63,185,80,0.25)',
    color: 'var(--wb-green)'
  },
  error: {
    bg: 'var(--wb-red-dim)',
    border: 'rgba(248,81,73,0.25)',
    color: 'var(--wb-red)'
  },
  warning: {
    bg: 'var(--wb-gold-dim)',
    border: 'rgba(230,168,23,0.25)',
    color: 'var(--wb-gold)'
  },
  info: {
    bg: 'var(--wb-sky-dim)',
    border: 'rgba(88,166,255,0.25)',
    color: 'var(--wb-sky)'
  }
}

// Deliberately not `ComponentProps<'div'>`: the component owns its className and
// style, so advertising them and then dropping them would be a lie. Only the hooks
// tests and e2e specs need are passed through.
type AlertBoxProps = {
  variant: AlertBoxVariant
  children: React.ReactNode
  'data-testid'?: string
  'data-kind'?: string
  'data-tone'?: string
}

export function AlertBox({ variant, children, ...rest }: AlertBoxProps): React.JSX.Element {
  const { bg, border, color } = VARIANT_STYLES[variant]
  return (
    <div
      {...rest}
      className="py-3 px-4 rounded-md text-[0.8125rem] font-wb-mono"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      {children}
    </div>
  )
}
