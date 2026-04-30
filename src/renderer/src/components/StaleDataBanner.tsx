import React from 'react'

type StaleDataBannerProps = {
  stale: boolean
  minutesAgo: number
}

export function StaleDataBanner({
  stale,
  minutesAgo
}: StaleDataBannerProps): React.JSX.Element | null {
  if (!stale) return null

  return (
    <div
      data-testid="stale-data-banner"
      className="flex items-center gap-2 border-b border-wb-gold/30 bg-wb-gold/10 px-4 py-2 font-wb-mono text-[0.75rem] text-wb-gold"
    >
      <span className="text-[0.85rem]">⚠</span>
      Prices may be delayed — last updated {minutesAgo}m ago
    </div>
  )
}
