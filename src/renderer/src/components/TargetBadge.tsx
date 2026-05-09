import { formatTargetTooltip } from '../lib/option-display'

type TargetBadgeProps = {
  targetReached: boolean
  pnlPercent: string
  maxProfit: string
  targetPercent: number
}

export function TargetBadge({
  targetReached,
  pnlPercent,
  maxProfit,
  targetPercent
}: TargetBadgeProps): React.JSX.Element | null {
  if (!targetReached) return null

  const tooltip = formatTargetTooltip({ pnlPercent, maxProfit, targetPercent })

  return (
    <span
      data-testid="target-badge"
      title={tooltip}
      className="font-wb-mono text-[0.6rem] font-bold tracking-[0.1em] px-2 py-0.5 rounded-[10px] bg-wb-gold-dim text-wb-gold border border-wb-gold-border"
    >
      TARGET
    </span>
  )
}
