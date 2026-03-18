import { MONO } from '../../lib/tokens'

type FormButtonProps = {
  label: string
  variant?: 'primary' | 'secondary'
  pendingLabel?: string
  isPending?: boolean
  onClick?: () => void
  'data-testid'?: string
  'aria-label'?: string
  style?: React.CSSProperties
}

const variantStyles: Record<'primary' | 'secondary', (isPending: boolean) => React.CSSProperties> =
  {
    primary: (isPending) => ({
      border: 'none',
      background: isPending ? 'rgba(230,168,23,0.4)' : 'var(--wb-gold)',
      color: 'var(--wb-bg-base)'
    }),
    secondary: (isPending) => ({
      border: '1px solid var(--wb-border)',
      background: isPending ? 'var(--wb-bg-elevated)' : 'transparent',
      color: 'var(--wb-text-primary)'
    })
  }

export function FormButton({
  label,
  variant = 'primary',
  pendingLabel,
  isPending = false,
  onClick,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  style
}: FormButtonProps): React.JSX.Element {
  return (
    <button
      type={variant === 'primary' ? 'submit' : 'button'}
      disabled={isPending}
      onClick={onClick}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      style={{
        padding: '11px 24px',
        borderRadius: 6,
        fontSize: '0.9375rem',
        fontWeight: 600,
        fontFamily: MONO,
        cursor: isPending ? 'not-allowed' : 'pointer',
        letterSpacing: '0.04em',
        transition: 'opacity 0.15s',
        ...variantStyles[variant](isPending),
        ...style
      }}
    >
      {isPending && pendingLabel ? pendingLabel : label}
    </button>
  )
}
