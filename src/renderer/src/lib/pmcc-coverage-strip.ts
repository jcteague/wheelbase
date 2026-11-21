// [US-109] The PMCC leg timeline's coverage strip: its copy and where each dated mark sits on
// an axis from the first LEAPS fill to the held LEAPS's expiration. Formatting only.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type {
  ContractRef,
  PmccCycle,
  PmccLeapsTrack,
  PmccTimeline
} from '../../../main/core/pmcc-timeline'
import { contractLabel } from './pmcc-timeline-rows'

/** The strip's axis: `start` to `end`, both `YYYY-MM-DD`. */
export type StripRange = { start: string; end: string }

/** A mark's CSS `left` and `width`, as percentages of the axis. */
export type StripPlacement = { left: string; width: string }

/** The axis: the first LEAPS fill to the expiration of the LEAPS held now. */
export function stripRange(timeline: {
  start: PmccTimeline['start']
  leapsTrack: Pick<PmccLeapsTrack, 'current'>
}): StripRange {
  return { start: timeline.start, end: timeline.leapsTrack.current.expiration }
}

/** `Coverage · 2026-09-14 to 2028-01-21`. */
export function stripCaption(range: StripRange): string {
  return `Coverage · ${range.start} to ${range.end}`
}

/** `LEAPS $85.00 call · 2028-01-21`. */
export function stripLeapsLabel(current: ContractRef): string {
  return `LEAPS ${contractLabel(current)}`
}

/** `LEAPS roll · 2027-07-09`. */
export function rollTickLabel(date: string): string {
  return `LEAPS roll · ${date}`
}

/** `today 2027-08-13`. */
export function todayMarker(date: string): string {
  return `today ${date}`
}

const percent = (fraction: number): string => `${(fraction * 100).toFixed(3)}%`

/** Where `from` to `to` sits on the axis, clamped to it. */
export function stripPlacement(range: StripRange, from: string, to: string): StripPlacement {
  const start = parseISO(range.start)
  const span = differenceInCalendarDays(parseISO(range.end), start)
  const at = (date: string): number =>
    Math.min(1, Math.max(0, differenceInCalendarDays(parseISO(date), start) / span))
  return { left: percent(at(from)), width: percent(at(to) - at(from)) }
}

type CycleSpan =
  | Pick<Extract<PmccCycle, { status: 'OPEN' }>, 'status'>
  | Pick<Extract<PmccCycle, { status: 'UNRECORDED' }>, 'status' | 'expiredOn'>
  | Pick<Extract<PmccCycle, { status: 'ENDED' }>, 'status' | 'endedOn'>

/**
 * Where a cycle's strip segment stops: the day it ended, its expiration when it passed with no
 * outcome recorded, else the window end.
 */
export function cycleSegmentEnd(cycle: CycleSpan, windowEnd: string): string {
  switch (cycle.status) {
    case 'ENDED':
      return cycle.endedOn
    case 'UNRECORDED':
      return cycle.expiredOn
    case 'OPEN':
      return windowEnd
  }
}
