import { useState } from 'react'
import type { ScreenerExclusion } from '../api/screener'

type ScreenerExcludedSectionProps = {
  exclusions: ScreenerExclusion[]
}

export function ScreenerExcludedSection({
  exclusions
}: ScreenerExcludedSectionProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false)

  if (exclusions.length === 0) {
    return null
  }

  return (
    <div className="border border-wb-border rounded-md bg-wb-bg-surface overflow-hidden">
      <button
        type="button"
        data-testid="screener-excluded-toggle"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer"
      >
        <span className="font-wb-mono text-xs uppercase tracking-widest text-wb-text-muted">
          Excluded ({exclusions.length})
        </span>
        <span className="font-wb-mono text-xs text-wb-text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="border-t border-wb-border">
          {exclusions.map((exclusion) => (
            <div
              key={exclusion.ticker}
              data-testid={`screener-excluded-row-${exclusion.ticker}`}
              className="flex items-center gap-3 px-4 py-2.5 border-t border-wb-border-subtle first:border-t-0"
            >
              <span className="font-wb-mono font-bold text-[0.8rem] text-wb-text-secondary w-[60px]">
                {exclusion.ticker}
              </span>
              <span className="font-wb-mono text-xs text-wb-text-muted px-2 py-0.5 rounded bg-wb-red-dim border border-wb-red/25">
                {exclusion.reason}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
