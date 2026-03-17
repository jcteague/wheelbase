import { MONO } from '../../lib/tokens'

type FormButtonProps = {
  label: string
  pendingLabel?: string
  isPending?: boolean
  onClick?: () => void
  'data-testid'?: string
  'aria-label'?: string
  style?: React.CSSProperties
}

export function FormButton({
  label,
  pendingLabel,
  isPending = false,
  onClick,
  'data-testid': dataTestId,
  'aria-label': ariaLabel,
  style
}: FormButtonProps): React.JSX.Element {
  return (
    <button
      type="submit"
      disabled={isPending}
      onClick={onClick}
      data-testid={dataTestId}
      aria-label={ariaLabel}
      style={{
        padding: '11px 24px',
        borderRadius: 6,
        border: 'none',
        background: isPending ? 'rgba(230,168,23,0.4)' : 'var(--wb-gold)',
        color: 'var(--wb-bg-base)',
        fontSize: '0.9375rem',
        fontWeight: 600,
        fontFamily: MONO,
        cursor: isPending ? 'not-allowed' : 'pointer',
        letterSpacing: '0.04em',
        transition: 'opacity 0.15s',
        ...style
      }}
    >
      {isPending && pendingLabel ? pendingLabel : label}
    </button>
  )
}
