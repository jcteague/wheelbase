import { MONO } from '../../lib/tokens'

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

type AlertBoxProps = {
  variant: AlertBoxVariant
  children: React.ReactNode
}

export function AlertBox({ variant, children }: AlertBoxProps): React.JSX.Element {
  const { bg, border, color } = VARIANT_STYLES[variant]
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: 6,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontFamily: MONO,
        fontSize: '0.8125rem'
      }}
    >
      {children}
    </div>
  )
}
