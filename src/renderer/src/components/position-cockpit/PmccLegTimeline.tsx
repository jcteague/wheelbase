// [US-109] The Leg timeline drawer, collapsed by default: closed banner, coverage strip, then
// the LEAPS track and the short-call cycles as two separate panels.
import { useId } from 'react'
import type { PmccGap, PmccTimeline } from '../../../../main/core/pmcc-timeline'
import { TOKEN_HEX } from '../../lib/phase'
import {
  closedBanner,
  cyclesHeader,
  gapRow,
  timelineDrawerMeta
} from '../../lib/pmcc-timeline-display'
import { Badge } from '../ui/Badge'
import { CollapsedDrawer } from './CollapsedDrawer'
import { DrawerCaption } from './DrawerCaption'
import { PmccCoverageStrip } from './PmccCoverageStrip'
import { PmccCycleGroup } from './PmccCycleGroup'
import { PmccLeapsTrack } from './PmccLeapsTrack'

export type PmccLegTimelineProps = { timeline: PmccTimeline }

/** An uncovered stretch: a neutral, muted fact, never a warning. */
function GapRow({ gap }: { gap: PmccGap }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-wb-border px-5 py-2 font-wb-mono text-wb-text-muted">
      <span aria-hidden="true" className="text-[0.7rem]">
        ○
      </span>
      <p className="text-[0.7rem] text-wb-text-muted">
        {gapRow(gap)}
        <span className="text-[0.65rem]">{' — no short call open against the LEAPS'}</span>
      </p>
    </div>
  )
}

function CyclesPanel({ timeline }: PmccLegTimelineProps): React.JSX.Element {
  const headingId = useId()
  const gapBefore = (number: number): PmccGap | undefined =>
    timeline.gaps.find((gap) => 'beforeCycle' in gap && gap.beforeCycle === number)
  const trailing = timeline.gaps.filter((gap) => gap.kind === 'TRAILING')

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-wb-violet/30 bg-wb-violet/[0.02]"
    >
      <div className="flex items-baseline gap-2 border-b border-wb-violet/20 bg-wb-violet/10 px-5 py-2.5">
        <Badge color={TOKEN_HEX.violet}>S</Badge>
        <h3 id={headingId} className="font-wb-mono text-sm font-semibold text-wb-violet">
          Short-call cycles
        </h3>
        <span className="font-wb-mono text-[0.65rem] text-wb-text-secondary">
          {cyclesHeader(timeline)}
        </span>
      </div>
      {timeline.cycles.length === 0 && (
        <p className="px-5 py-6 text-center font-wb-mono text-[0.75rem] text-wb-text-muted">
          No short call has been sold against this LEAPS yet. The LEAPS track above is the whole
          history.
        </p>
      )}
      {timeline.cycles.map((cycle) => {
        const gap = gapBefore(cycle.number)
        return (
          <div key={cycle.number}>
            {gap && <GapRow gap={gap} />}
            <PmccCycleGroup cycle={cycle} />
          </div>
        )
      })}
      {trailing.map((gap) => (
        <GapRow key={gap.from} gap={gap} />
      ))}
    </section>
  )
}

export function PmccLegTimeline({ timeline }: PmccLegTimelineProps): React.JSX.Element {
  const banner = closedBanner(timeline)
  return (
    <CollapsedDrawer title="Leg timeline" meta={timelineDrawerMeta(timeline)}>
      <DrawerCaption>US-109 · a roll stays inside its cycle</DrawerCaption>
      {banner && (
        <p className="mt-3 border-y border-wb-border bg-wb-bg-elevated px-5 py-2 font-wb-mono text-[0.7rem] text-wb-text-secondary">
          {banner}
        </p>
      )}
      <div className={banner ? 'opacity-70' : undefined}>
        <PmccCoverageStrip timeline={timeline} />
        <div className="flex flex-col gap-5 px-4 pt-4 pb-2">
          <PmccLeapsTrack closedDate={timeline.closedDate} leapsTrack={timeline.leapsTrack} />
          <CyclesPanel timeline={timeline} />
        </div>
      </div>
    </CollapsedDrawer>
  )
}
