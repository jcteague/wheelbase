import React from 'react'

export type MarketStatusDisplay = 'LIVE' | 'EXT' | 'CLOSED' | 'DELAYED'

type MarketStatusPillProps = {
  state: MarketStatusDisplay
}

const PILL_CLASSES: Record<MarketStatusDisplay, string> = {
  LIVE: 'bg-wb-green/10 text-wb-green border-wb-green/30',
  EXT: 'bg-wb-gold/10 text-wb-gold border-wb-gold/30',
  CLOSED: 'bg-wb-text-secondary/10 text-wb-text-secondary border-wb-text-secondary/30',
  DELAYED: 'bg-wb-gold/10 text-wb-gold border-wb-gold/30'
}

const DOT_CLASSES: Record<MarketStatusDisplay, string> = {
  LIVE: 'bg-wb-green',
  EXT: 'bg-wb-gold',
  CLOSED: 'bg-wb-text-secondary',
  DELAYED: 'bg-wb-gold'
}

const PILL_BASE =
  'inline-flex items-center gap-[5px] rounded-[10px] border py-[2px] pl-[6px] pr-2 font-wb-mono text-[0.6rem] font-bold tracking-[0.1em]'

const DOT_BASE = 'h-[6px] w-[6px] shrink-0 rounded-full'

export function MarketStatusPill({ state }: MarketStatusPillProps): React.JSX.Element {
  const isLive = state === 'LIVE'

  return (
    <span data-testid="market-status-pill" className={`${PILL_BASE} ${PILL_CLASSES[state]}`}>
      <span
        data-testid="market-status-dot"
        className={`${DOT_BASE} ${DOT_CLASSES[state]} ${isLive ? 'animate-wb-pulse' : ''}`}
      />
      {state}
    </span>
  )
}
