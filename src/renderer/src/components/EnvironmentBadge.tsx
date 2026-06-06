type EnvironmentBadgeProps = {
  activeBrokerEnv: 'paper' | 'live' | 'none'
}

const BADGE_STYLES = {
  paper: {
    label: 'PAPER',
    className:
      'bg-wb-gold-dim text-wb-gold border border-wb-gold-border font-semibold text-[0.72rem]',
    dotClassName: 'bg-wb-gold animate-wb-pulse',
    title: 'Paper Alpaca environment is active.'
  },
  live: {
    label: 'LIVE',
    className:
      'bg-wb-green-dim text-wb-green border border-wb-green-border font-medium text-[0.66rem]',
    dotClassName: 'bg-wb-green',
    title: 'Live Alpaca environment is active.'
  },
  none: {
    label: 'NO BROKER',
    className:
      'bg-wb-bg-elevated text-wb-text-secondary border border-wb-border font-medium text-[0.66rem]',
    dotClassName: 'bg-wb-text-muted',
    title: 'Alpaca not configured. Open Settings to set up.'
  }
} as const

export function EnvironmentBadge({ activeBrokerEnv }: EnvironmentBadgeProps): React.JSX.Element {
  const meta = BADGE_STYLES[activeBrokerEnv]

  return (
    <span
      title={meta.title}
      className={[
        'inline-flex items-center gap-[6px] rounded-md px-[10px] py-[4px] font-wb-mono tracking-[0.12em]',
        meta.className
      ].join(' ')}
    >
      <span
        data-testid="environment-badge-dot"
        className={['h-[7px] w-[7px] shrink-0 rounded-full', meta.dotClassName].join(' ')}
      />
      {meta.label}
    </span>
  )
}
