type FormButtonProps = {
  label: string
  variant?: 'primary' | 'secondary'
  /** Defaults to `submit` for primary and `button` for secondary. */
  type?: 'submit' | 'button'
  pendingLabel?: string
  isPending?: boolean
  disabled?: boolean
  onClick?: () => void
  'data-testid'?: string
  'aria-label'?: string
  /** Set on a toggle button: whether it is the pressed (selected) choice. */
  'aria-pressed'?: boolean
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
  type = variant === 'primary' ? 'submit' : 'button',
  pendingLabel,
  isPending = false,
  disabled = false,
  onClick,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  style
}: FormButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      disabled={isPending || disabled}
      onClick={onClick}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
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
