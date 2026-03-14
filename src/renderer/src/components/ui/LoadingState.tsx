import { MONO } from '../../lib/tokens'

type LoadingStateProps = {
  message?: string
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps): React.JSX.Element {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '32px 24px',
        color: 'var(--wb-text-muted)',
        fontSize: '0.8125rem',
        fontFamily: MONO
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--wb-gold)',
          display: 'inline-block',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}
      />
      {message}
    </div>
  )
}
