import { MONO } from '../../lib/tokens'

type ErrorAlertProps = {
  children?: React.ReactNode
  message?: React.ReactNode
}

export function ErrorAlert({ children, message }: ErrorAlertProps): React.JSX.Element {
  return (
    <div
      role="alert"
      style={{
        padding: '10px 14px',
        borderRadius: 6,
        background: 'var(--wb-red-dim)',
        border: '1px solid rgba(248, 81, 73, 0.25)',
        color: 'var(--wb-red)',
        fontSize: '0.8125rem',
        fontFamily: MONO
      }}
    >
      {children ?? message}
    </div>
  )
}
