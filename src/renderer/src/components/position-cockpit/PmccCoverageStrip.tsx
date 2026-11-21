// [US-109] The leg timeline's coverage strip: the LEAPS bar, one segment per short-call cycle
// and the valuation-date marker.
import type { PmccCycle, PmccLeapsTrack, PmccTimeline } from '../../../../main/core/pmcc-timeline'
import {
  cycleSegmentEnd,
  rollTickLabel,
  stripCaption,
  stripLeapsLabel,
  stripPlacement,
  stripRange,
  todayMarker
} from '../../lib/pmcc-coverage-strip'
import { coverageStripLine } from '../../lib/pmcc-timeline-display'
import { cycleOutcome, cycleTitle } from '../../lib/pmcc-timeline-rows'
import { Caption } from '../ui/Caption'
import { OUTCOME_TONE } from './pmcc-timeline-tones'

export type PmccCoverageStripProps = {
  timeline: Pick<PmccTimeline, 'start' | 'windowEnd' | 'valuationDate'> & {
    leapsTrack: Pick<PmccLeapsTrack, 'current' | 'rows'>
    cycles: PmccCycle[]
    summary: Pick<PmccTimeline['summary'], 'coveredDays' | 'totalDays' | 'uncoveredDays'>
  }
}

const LABEL = 'absolute left-2 top-[-1px] font-wb-mono text-[0.6rem]'

export function PmccCoverageStrip({ timeline }: PmccCoverageStripProps): React.JSX.Element {
  const range = stripRange(timeline)
  const rollDates = timeline.leapsTrack.rows.flatMap((row) =>
    row.kind === 'ROLL' ? [row.date] : []
  )
  const today = stripPlacement(range, timeline.valuationDate, timeline.valuationDate).left

  return (
    <section aria-label="Coverage" className="border-b border-wb-border px-5 py-4">
      <div className="mb-3 flex items-baseline justify-between">
        <Caption>{stripCaption(range)}</Caption>
        <span className="font-wb-mono text-[0.65rem] text-wb-text-muted">
          {coverageStripLine(timeline)}
        </span>
      </div>

      <div className="relative h-[14px] rounded-sm bg-wb-bg-elevated">
        <div className="absolute inset-0 rounded-sm border border-wb-blue-dim bg-wb-sky/20" />
        {rollDates.map((date) => (
          <div
            key={date}
            role="img"
            aria-label={rollTickLabel(date)}
            className="absolute inset-y-[-3px] w-[2px] bg-wb-gold"
            style={{ left: stripPlacement(range, date, date).left }}
          />
        ))}
        <span className={`${LABEL} font-semibold text-wb-sky`}>
          {stripLeapsLabel(timeline.leapsTrack.current)}
        </span>
      </div>

      <div className="relative mt-1.5 h-[14px] rounded-sm bg-wb-bg-elevated">
        {timeline.cycles.map((cycle) => (
          <div
            key={cycle.number}
            role="img"
            aria-label={cycleTitle(cycle.number)}
            className={`absolute inset-y-0 rounded-[2px] border ${OUTCOME_TONE[cycleOutcome(cycle)].segment}`}
            style={stripPlacement(
              range,
              cycle.openedOn,
              cycleSegmentEnd(cycle, timeline.windowEnd)
            )}
          />
        ))}
        {timeline.cycles.length === 0 && (
          <span className={`${LABEL} text-wb-text-muted`}>
            no short call has been sold against this LEAPS
          </span>
        )}
      </div>

      <div className="relative mt-1 h-[10px]">
        <div className="absolute h-[10px] w-[2px] bg-wb-text-primary" style={{ left: today }} />
        <span
          className="absolute top-[-1px] ml-1.5 font-wb-mono text-[0.6rem] text-wb-text-secondary"
          style={{ left: today }}
        >
          {todayMarker(timeline.valuationDate)}
        </span>
      </div>
    </section>
  )
}
