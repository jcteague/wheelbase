// [US-109] What the PMCC leg timeline derives from its finished cycles: the uncovered
// stretches of the window and the timeline summary.
import Decimal from 'decimal.js'
import { money4 } from '../../shared/decimal-text'
import type { PmccLedgerResult } from './costbasis'
import { daysBetween } from './dte'
import type { PmccCycle, PmccGap, PmccTimelineSummary } from './pmcc-timeline-types'

/** The day a cycle stopped covering the LEAPS: its end, or its expiration when unrecorded. */
function coverageEnd(cycle: PmccCycle): string | null {
  switch (cycle.status) {
    case 'ENDED':
      return cycle.endedOn
    case 'UNRECORDED':
      return cycle.expiredOn
    case 'OPEN':
      return null
  }
}

/**
 * `day`, or `windowEnd` when `day` is later: a fill dated after the window end (entry validates
 * against the local date, the timeline is valued at New York's) counts at the window end. No
 * cycle date precedes `start`, the first LEAPS fill — a PMCC's short is never sold before it.
 */
const notPastWindow = (day: string, windowEnd: string): string =>
  daysBetween(day, windowEnd) < 0 ? windowEnd : day

/** A stretch from `from` to `to`, its kind read off which neighbours it has. */
function gapBetween(
  afterCycle: number | null,
  beforeCycle: number | null,
  from: string,
  to: string
): PmccGap {
  const span = { from, to, days: daysBetween(from, to) }
  if (afterCycle === null) {
    return beforeCycle === null
      ? { kind: 'WHOLE_WINDOW', ...span }
      : { kind: 'LEADING', beforeCycle, ...span }
  }
  return beforeCycle === null
    ? { kind: 'TRAILING', afterCycle, ...span }
    : { kind: 'BETWEEN', afterCycle, beforeCycle, ...span }
}

type Walk = {
  gaps: PmccGap[]
  /** The furthest day the cycles walked so far cover the window to. */
  coveredTo: string
  /** The cycle that covers to `coveredTo`; null before any. */
  coveredBy: number | null
}

/**
 * Every stretch of the window no cycle covers: the complement, within `[start, windowEnd]`, of
 * the union of the cycles' coverage. A cycle covers from its sale until its coverage end (see
 * `coverageEnd`), or the window end while open, each capped at the window end. Cycles are walked
 * in sale order, so a stretch lies between the cycle that covered furthest before it (the later
 * one on a tie) and the cycle sold at its end.
 */
export function coverageGaps(cycles: PmccCycle[], start: string, windowEnd: string): PmccGap[] {
  const clamp = (day: string): string => notPastWindow(day, windowEnd)
  const walked = cycles.reduce<Walk>(
    ({ gaps, coveredTo, coveredBy }, cycle) => {
      const from = clamp(cycle.openedOn)
      const to = clamp(coverageEnd(cycle) ?? windowEnd)
      const uncovered = daysBetween(coveredTo, from) > 0
      const next = uncovered
        ? [...gaps, gapBetween(coveredBy, cycle.number, coveredTo, from)]
        : gaps
      return daysBetween(coveredTo, to) >= 0
        ? { gaps: next, coveredTo: to, coveredBy: cycle.number }
        : { gaps: next, coveredTo, coveredBy }
    },
    { gaps: [], coveredTo: start, coveredBy: null }
  )
  const { gaps, coveredTo, coveredBy } = walked
  return daysBetween(coveredTo, windowEnd) > 0
    ? [...gaps, gapBetween(coveredBy, null, coveredTo, windowEnd)]
    : gaps
}

const sumOf = (amounts: string[]): Decimal =>
  amounts.reduce((total, amount) => total.plus(amount), new Decimal(0))

type SummaryInput = {
  cycles: PmccCycle[]
  gaps: PmccGap[]
  /** Signed dollars of every LEAPS roll; null when there is none. */
  leapsRollNet: Decimal | null
  /** Signed dollars of the short rolls and ends no cycle took; null when there is none. */
  unattributedShort: Decimal | null
  /** Shares the LEAPS covers: the per-share divisor. */
  shares: number
  final: PmccLedgerResult
  totalDays: number
}

/** Totals in dollars, each divided once by the LEAPS shares; ledger fields from `final`. */
export function timelineSummary({
  cycles,
  gaps,
  leapsRollNet,
  unattributedShort,
  shares,
  final,
  totalDays
}: SummaryInput): PmccTimelineSummary {
  const ended = cycles.filter((cycle) => cycle.status === 'ENDED')
  // A cycle past its expiration with no recorded outcome is still open: its credit is unrealized.
  const open = cycles.filter((cycle) => cycle.status !== 'ENDED')
  const realized = sumOf(ended.map((cycle) => cycle.netTotal))
  const perShare = (total: Decimal): string => money4(total.dividedBy(shares))
  const uncoveredDays = gaps.reduce((days, gap) => days + gap.days, 0)
  return {
    cycleCount: cycles.length,
    closedCount: ended.length,
    open:
      open.length === 0
        ? null
        : {
            count: open.length,
            creditPerShare: perShare(sumOf(open.map((cycle) => cycle.netTotal)))
          },
    realizedPerShare: perShare(realized),
    realizedTotal: money4(realized),
    average:
      ended.length === 0
        ? null
        : {
            perShare: money4(realized.dividedBy(shares * ended.length)),
            total: money4(realized.dividedBy(ended.length))
          },
    leapsRollNetPerShare: leapsRollNet === null ? null : perShare(leapsRollNet),
    unattributedShortPerShare: unattributedShort === null ? null : perShare(unattributedShort),
    totalDays,
    uncoveredDays,
    coveredDays: totalDays - uncoveredDays,
    shortCreditsPerShare: final.shortCreditsPerShare,
    leapsCostPerShare: final.leapsCostPerShare,
    basisPerShare: final.basisPerShare
  }
}
