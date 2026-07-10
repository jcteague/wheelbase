import type { WheelPhase } from '../api/positions'
import { PhaseBadge } from './PhaseBadge'
import { UrgencyPill } from './UrgencyPill'

export function ManagementQueueRow({
  item,
  onDismissClick
}: {
  item: ManagementQueueItem
  onDismissClick: (alertId: string) => void
}): React.JSX.Element {
  return (
    <div
      data-testid="management-queue-row"
      data-ticker={item.ticker}
      className="grid grid-cols-[96px_110px_1fr_auto] items-center gap-4 border-t border-wb-border px-4 py-3.5"
    >
      <div className="flex flex-col gap-1">
        <span className="text-base font-bold text-wb-text-primary">{item.ticker}</span>
        <UrgencyPill urgency={item.urgency} />
      </div>
      <PhaseBadge phase={item.phase as WheelPhase} variant="short" />
      <span className="leading-relaxed text-wb-text-secondary">{item.summary}</span>
      <div className="flex justify-self-end gap-2">
        <button
          type="button"
          onClick={() => {
            window.location.hash = `/positions/${item.positionId}`
          }}
          className="rounded-lg border border-wb-gold-border bg-wb-gold-dim px-3.5 py-2.5 font-wb-mono font-bold text-wb-gold"
        >
          {item.quickAction}
        </button>
        <button
          type="button"
          onClick={() => onDismissClick(item.alertId)}
          className="rounded-lg border border-wb-red/30 bg-wb-red-dim px-3.5 py-2.5 font-wb-mono font-bold text-wb-red"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
