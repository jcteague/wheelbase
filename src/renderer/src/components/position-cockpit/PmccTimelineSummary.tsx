import type { PmccTimeline } from '../../../../main/core/pmcc-timeline'
import {
  reconciliationLine,
  summaryStats,
  type SummaryStatTone
} from '../../lib/pmcc-timeline-display'
import { StatGrid } from '../ui/Stat'
import { CollapsedDrawer } from './CollapsedDrawer'
import { DrawerCaption } from './DrawerCaption'

export type PmccTimelineSummaryProps = { timeline: Pick<PmccTimeline, 'summary'> }

const TONE_CLASS: Record<SummaryStatTone, string | null> = {
  default: null,
  credit: 'text-wb-green',
  open: 'text-wb-gold',
  muted: 'text-wb-text-muted'
}

/** The Timeline summary drawer, open by default: six totals and the reconciliation line. */
export function PmccTimelineSummary({ timeline }: PmccTimelineSummaryProps): React.JSX.Element {
  const line = reconciliationLine(timeline)
  return (
    <CollapsedDrawer title="Timeline summary" fieldCount={6} defaultOpen>
      <DrawerCaption>US-109 · reconciles to the Cost basis drawer above</DrawerCaption>
      <StatGrid
        minWidth={150}
        items={summaryStats(timeline).map(({ label, value, tone }) => {
          const toneClass = TONE_CLASS[tone]
          return { label, value: toneClass ? <span className={toneClass}>{value}</span> : value }
        })}
      />
      <div className="px-5 py-2.5 font-wb-mono text-[0.68rem] text-wb-text-secondary">
        {line.lead}
        <span className="text-wb-sky">{line.basis}</span>
        {line.tail}
      </div>
    </CollapsedDrawer>
  )
}
