import type { Tier2Cell } from '../../lib/pmcc-card-display'
import { EYEBROW } from './styles'

/** The PMCC card's tier 2: the once-a-cycle checks as label / value / note cells. */
export function Tier2Panel({ cells }: { cells: Tier2Cell[] }): React.JSX.Element {
  return (
    <div
      role="list"
      aria-label="Position detail"
      className="grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-px border-t border-wb-border bg-wb-border"
    >
      {cells.map((cell) => (
        <div
          key={cell.label}
          role="listitem"
          data-testid="tier2-cell"
          className="flex flex-col gap-[3px] bg-wb-bg-elevated px-3 py-[9px]"
        >
          <span className={EYEBROW}>{cell.label}</span>
          <span className="font-wb-mono text-xs tabular-nums text-wb-text-primary">
            {cell.value}
          </span>
          <span className="font-wb-mono text-[10px] leading-[1.45] text-wb-text-muted">
            {cell.note}
          </span>
        </div>
      ))}
    </div>
  )
}
