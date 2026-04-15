type LoadingStateProps = {
  message?: string
}

export function LoadingState({ message = 'Loading…' }: LoadingStateProps): React.JSX.Element {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 py-8 px-6 text-wb-text-muted text-[0.8125rem] font-wb-mono"
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
