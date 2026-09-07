type MarketDataStatusDotProps = {
  marketData: 'configured' | 'missing'
}

export function MarketDataStatusDot({ marketData }: MarketDataStatusDotProps): React.JSX.Element {
  const connected = marketData === 'configured'

  return (
    <span
      data-testid="market-data-status-dot"
      title={
        connected ? 'Market data: connected via Alpaca' : 'Market data: connect Alpaca in Settings'
      }
      className="inline-flex items-center gap-[5px] font-wb-mono text-[0.58rem] tracking-[0.1em] text-wb-text-muted"
    >
      <span
        data-testid="market-data-status-dot-indicator"
        className={[
          'h-[6px] w-[6px] shrink-0 rounded-full',
          connected ? 'bg-wb-green' : 'bg-wb-text-muted'
        ].join(' ')}
      />
      MD
    </span>
  )
}
