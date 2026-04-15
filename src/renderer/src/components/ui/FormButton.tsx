type FormButtonProps = {
  label: string
  variant?: 'primary' | 'secondary'
  pendingLabel?: string
  isPending?: boolean
  disabled?: boolean
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
  disabled = false,
  onClick,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  style
}: FormButtonProps): React.JSX.Element {
  return (
    <button
      type={variant === 'primary' ? 'submit' : 'button'}
      disabled={isPending || disabled}
      onClick={onClick}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      className={[
        'font-wb-mono py-[11px] px-6 rounded-[6px] text-[0.9375rem] font-semibold tracking-[0.04em] transition-opacity duration-150',
        isPending ? 'cursor-not-allowed' : 'cursor-pointer'
      ].join(' ')}
      style={{ ...variantStyles[variant](isPending), ...style }}
    >
      {isPending && pendingLabel ? pendingLabel : label}
    </button>
  )
}
