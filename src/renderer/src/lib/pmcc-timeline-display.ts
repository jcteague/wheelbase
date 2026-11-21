// [US-109] The PMCC leg timeline's section copy: the drawer meta, track and cycle headers, gap
// rows, the coverage flag and strip, and the Timeline summary, formatted from the engine's
// `PmccTimeline`. Row cells are in `pmcc-timeline-rows.ts`. Formatting only — every figure is
// computed in main.
import Decimal from 'decimal.js'
import type {
  PmccCycle,
  PmccCycleFlag,
  PmccGap,
  PmccLeapsTrack,
  PmccTimeline,
  PmccTimelineSummary
} from '../../../main/core/pmcc-timeline'
import { fmtCount, fmtMoneyGrouped as money } from './format'
import { minusMoneyGrouped, signedMoneyGrouped } from './money-format'
import { contractLabel } from './pmcc-timeline-rows'

type OpenCycle = Extract<PmccCycle, { status: 'OPEN' }>
type HeldCycle = Extract<PmccCycle, { status: 'ENDED' | 'UNRECORDED' }>

export type SummaryStatTone = 'default' | 'credit' | 'open' | 'muted'

/** One Timeline summary cell; `muted` marks an empty value (`—`, `no roll yet`). */
export type SummaryStat = { label: string; value: string; tone: SummaryStatTone }

/** The reconciliation sentence, split so the component can colour the basis. */
export type ReconciliationLine = { lead: string; basis: string; tail: string }

const DASH = '—'

/** `9 cycles · 44d uncovered`. */
export function timelineDrawerMeta({
  summary
}: {
  summary: Pick<PmccTimelineSummary, 'cycleCount' | 'uncoveredDays'>
}): string {
  return `${fmtCount(summary.cycleCount, 'cycle')} · ${summary.uncoveredDays}d uncovered`
}

export function leapsTrackHeader({
  closedDate,
  leapsTrack
}: Pick<PmccTimeline, 'closedDate'> & {
  leapsTrack: Pick<PmccLeapsTrack, 'current' | 'costPerShare'>
}): string {
  const state = closedDate === null ? 'open' : 'closed'
  return `${state} ${contractLabel(leapsTrack.current)} · LEAPS cost to date ${money(leapsTrack.costPerShare)} / share`
}

/** `8 closed · 1 open`, or `9 closed` with none open. */
function closedAndOpen(summary: Pick<PmccTimelineSummary, 'closedCount' | 'open'>): string {
  const open = summary.open === null ? '' : ` · ${summary.open.count} open`
  return `${summary.closedCount} closed${open}`
}

export function cyclesHeader({
  summary
}: {
  summary: Pick<PmccTimelineSummary, 'cycleCount' | 'closedCount' | 'open'>
}): string {
  return `${fmtCount(summary.cycleCount, 'cycle')} · ${closedAndOpen(summary)}`
}

export function cycleHeader(
  cycle: Pick<PmccCycle, 'current' | 'openedOn' | 'dteAtOpen'> &
    (Pick<OpenCycle, 'status' | 'daysSoFar'> | Pick<HeldCycle, 'status' | 'daysHeld'>)
): string {
  const days =
    cycle.status === 'OPEN'
      ? `${fmtCount(cycle.daysSoFar, 'day')} so far`
      : `${fmtCount(cycle.daysHeld, 'day')} held`
  return `${money(cycle.current.strike)} call · sold ${cycle.openedOn} at ${cycle.dteAtOpen} DTE · ${days}`
}

/** `1 roll`, `2 rolls`; null for an unrolled cycle. */
export function rollMarker(rollCount: number): string | null {
  return rollCount === 0 ? null : fmtCount(rollCount, 'roll')
}

/** Open until an outcome is recorded: a cycle past its expiration with none is not realized. */
export function cycleNetLabel({ status }: Pick<PmccCycle, 'status'>): string {
  return status === 'ENDED' ? 'Net credit' : 'Net credit, open'
}

/** `+$1.20 / share (+$120.00)`; a negative reads with the U+2212 minus. */
export function signedPerShareAndTotal(perShare: string, total: string): string {
  return `${signedMoneyGrouped(perShare)} / share (${signedMoneyGrouped(total)})`
}

export function basisFooter({ number, basisAfter }: Pick<PmccCycle, 'number' | 'basisAfter'>): {
  label: string
  value: string
} {
  return { label: `PMCC cost basis after cycle ${number}`, value: `${money(basisAfter)} / share` }
}

export function gapRow(gap: Pick<PmccGap, 'days' | 'from' | 'to'>): string {
  return `Uncovered · ${fmtCount(gap.days, 'day')} · ${gap.from} to ${gap.to}`
}

export function coverageFlag(flag: PmccCycleFlag): string {
  return `This short expires ${fmtCount(flag.daysPastLeaps, 'day')} after the open LEAPS (${flag.leapsExpiration}). It was uncovered for that stretch.`
}

type CoverageSummary = Pick<PmccTimelineSummary, 'coveredDays' | 'totalDays' | 'uncoveredDays'>

/** `289 of 333 days · 44 uncovered`. */
function coverageDays(summary: CoverageSummary): string {
  return `${summary.coveredDays} of ${summary.totalDays} days · ${summary.uncoveredDays} uncovered`
}

export function coverageStripLine({ summary }: { summary: CoverageSummary }): string {
  return `covered ${coverageDays(summary)}`
}

export function closedBanner({ closedDate }: Pick<PmccTimeline, 'closedDate'>): string | null {
  return closedDate === null ? null : `Position closed ${closedDate} · the timeline is complete`
}

const muted = (label: string, value: string): SummaryStat => ({ label, value, tone: 'muted' })

/** A net reads green only when it is a credit; zero and a debit stay neutral. */
const creditTone = (net: string): SummaryStatTone => (new Decimal(net).gt(0) ? 'credit' : 'default')

export function summaryStats({ summary }: { summary: PmccTimelineSummary }): SummaryStat[] {
  const { average, open, leapsRollNetPerShare } = summary
  return [
    {
      label: 'Cycles',
      value: `${summary.cycleCount} · ${closedAndOpen(summary)}`,
      tone: 'default'
    },
    {
      label: 'Realized net credits',
      value: signedPerShareAndTotal(summary.realizedPerShare, summary.realizedTotal),
      tone: creditTone(summary.realizedPerShare)
    },
    average === null
      ? muted('Average per closed cycle', DASH)
      : {
          label: 'Average per closed cycle',
          value: signedPerShareAndTotal(average.perShare, average.total),
          tone: 'default'
        },
    open === null
      ? muted('Open cycle credit', DASH)
      : {
          label: 'Open cycle credit',
          value: `${signedMoneyGrouped(open.creditPerShare)} / share · open`,
          tone: 'open'
        },
    leapsRollNetPerShare === null
      ? muted('LEAPS roll net', 'no roll yet')
      : {
          label: 'LEAPS roll net',
          value: `${signedMoneyGrouped(leapsRollNetPerShare)} / share · on the LEAPS track`,
          tone: creditTone(leapsRollNetPerShare)
        },
    { label: 'Coverage', value: coverageDays(summary), tone: 'default' }
  ]
}

export function reconciliationLine({
  summary
}: {
  summary: Pick<
    PmccTimelineSummary,
    | 'realizedPerShare'
    | 'open'
    | 'unattributedShortPerShare'
    | 'shortCreditsPerShare'
    | 'leapsCostPerShare'
    | 'basisPerShare'
  >
}): ReconciliationLine {
  // Unsigned, but a negative reads `−$0.61` (U+2212) like every other figure in the section.
  const amount = minusMoneyGrouped
  const credits = amount(summary.shortCreditsPerShare)
  const open = amount(summary.open?.creditPerShare ?? '0')
  const unattributed =
    summary.unattributedShortPerShare === null
      ? ''
      : ` + unattributed ${amount(summary.unattributedShortPerShare)}`
  return {
    lead:
      `Realized ${amount(summary.realizedPerShare)} + open ${open}${unattributed} = ${credits} short-call credits to date. ` +
      `LEAPS cost to date ${amount(summary.leapsCostPerShare)} − ${credits} = `,
    basis: amount(summary.basisPerShare),
    tail: ' cost basis per share.'
  }
}
