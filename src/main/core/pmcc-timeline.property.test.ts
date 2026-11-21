// Property tests: [US-109] the PMCC leg timeline reconciles to the US-103 ledger (a short roll or
// end no open cycle takes — none holds its contract and none is open, or only an ended cycle
// holds it — counts as unattributed), its coverage days add up, it does not depend on the order
// events arrive in, its per-share figures hold when every leg is scaled, only a short-call open
// ever starts a cycle, and a cycle with no recorded outcome reads open only until its short
// expires.
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import Decimal from 'decimal.js'
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isBefore,
  parseISO,
  subDays
} from 'date-fns'
import { money4 } from '../../shared/decimal-text'
import { calculatePmccLedger, type PmccContribution } from './costbasis'
import {
  buildPmccTimeline,
  timelineEventDate,
  type PmccCycleRow,
  type PmccLeapsRow,
  type PmccNet,
  type PmccTimeline,
  type PmccTimelineEvent,
  type PmccTimelineInput
} from './pmcc-timeline'
import { pmccTimelineEvents } from './test-fixtures/arbitraries'

/** The order the generator built the events in: date, then construction order. */
const inBuiltOrder = (a: PmccTimelineEvent, b: PmccTimelineEvent): number =>
  timelineEventDate(a).localeCompare(timelineEventDate(b)) || a.seq - b.seq

/** The timeline of a generated history, which always has its LEAPS. */
function timelineOf(input: PmccTimelineInput): PmccTimeline {
  const timeline = buildPmccTimeline(input)
  if (timeline === null) throw new Error('a generated history always has its LEAPS')
  return timeline
}

const contributionsOf = (input: PmccTimelineInput): PmccContribution[] =>
  input.events.flatMap((event) => (event.kind === 'UNKNOWN' ? [] : [event.contribution]))

const leapsContractsOf = (input: PmccTimelineInput): number =>
  input.events.filter((event) => event.kind === 'LEAPS_OPEN')[0].contracts

const sumOf = (amounts: string[]): Decimal =>
  amounts.reduce((total, amount) => total.plus(amount), new Decimal(0))

/** The `strike@expiration` identity of a contract. */
const keyOf = ({ strike, expiration }: { strike: string; expiration: string }): string =>
  `${strike}@${expiration}`

type InHand = { held: string[]; orphans: PmccContribution[] }

/** One event's effect on the short contracts in hand: a stray changes nothing in hand. */
function step({ held, orphans }: InHand, event: PmccTimelineEvent): InHand {
  if (event.kind === 'SHORT_OPEN') return { held: [...held, keyOf(event.contract)], orphans }
  if (event.kind !== 'SHORT_ROLL' && event.kind !== 'SHORT_END') return { held, orphans }
  const at = held.indexOf(keyOf(event.kind === 'SHORT_ROLL' ? event.from : event.contract))
  if (at === -1) return { held, orphans: [...orphans, event.contribution] }
  const rest = held.filter((_, index) => index !== at)
  return { held: event.kind === 'SHORT_ROLL' ? [...rest, keyOf(event.to)] : rest, orphans }
}

/**
 * Signed dollars (a credit is positive) of the strays; null when there is none. Walks the events
 * in the order the generator built them (date, then seq) with the short contracts in hand: an
 * open puts its contract in hand and a roll or end gives one up, unless that contract is not in
 * hand — never sold, or already given up (a duplicate) — when it is a stray. The generator only
 * records a stray while no cycle is open (before the first sale, or in the gap after a cycle
 * ended), so every stray is one no cycle can take.
 */
function orphanShortDollars(input: PmccTimelineInput): Decimal | null {
  const built = [...input.events].sort(inBuiltOrder)
  const { orphans } = built.reduce(step, { held: [], orphans: [] })
  if (orphans.length === 0) return null
  return orphans.reduce(
    (total, { cashPerShare, contracts, fees }) =>
      total.minus(new Decimal(cashPerShare).times(100 * contracts).plus(fees)),
    new Decimal(0)
  )
}

/** The calendar days `from` (inclusive) to `to` (exclusive), oldest first. */
const daysFrom = (from: string, to: string): string[] =>
  isBefore(parseISO(from), parseISO(to))
    ? eachDayOfInterval({ start: parseISO(from), end: subDays(parseISO(to), 1) }).map((day) =>
        format(day, 'yyyy-MM-dd')
      )
    : []

/**
 * The window's days: from the LEAPS purchase to the close date (or the valuation date while the
 * position is open), none when that falls on or before the purchase.
 */
function windowDays(input: PmccTimelineInput): string[] {
  const purchase = input.events.find((event) => event.kind === 'LEAPS_OPEN')
  if (purchase === undefined) return []
  return daysFrom(purchase.date, input.closedDate ?? input.valuationDate)
}

/** A short call sold, with the contract it holds now and the day its end was recorded. */
type Sold = { soldOn: string; held: string; expiration: string; endedOn: string | null }

/**
 * Every short call sold, replayed in the order the generator built the events: a roll or end
 * moves the latest call still unended that holds the contract it gives up; a stray that none
 * holds moves nothing.
 */
function soldCalls(input: PmccTimelineInput): Sold[] {
  const built = [...input.events].sort(inBuiltOrder)
  return built.reduce<Sold[]>((sold, event) => {
    if (event.kind === 'SHORT_OPEN') {
      const { contract } = event
      const call = { soldOn: event.date, held: keyOf(contract), expiration: contract.expiration }
      return [...sold, { ...call, endedOn: null }]
    }
    if (event.kind !== 'SHORT_ROLL' && event.kind !== 'SHORT_END') return sold
    const givenUp = keyOf(event.kind === 'SHORT_ROLL' ? event.from : event.contract)
    const at = sold.findLastIndex((call) => call.endedOn === null && call.held === givenUp)
    return sold.map((call, index) => {
      if (index !== at) return call
      if (event.kind === 'SHORT_END') return { ...call, endedOn: event.date }
      return { ...call, held: keyOf(event.to), expiration: event.to.expiration }
    })
  }, [])
}

/**
 * Whether a call covers the LEAPS on `day`: from its sale until its recorded end or, none
 * recorded, until its short expires — the day of the end or expiration is no longer covered.
 */
const isCovering = ({ soldOn, expiration, endedOn }: Sold, day: string): boolean =>
  soldOn <= day && day < (endedOn ?? expiration)

describe('buildPmccTimeline properties', () => {
  it('oracle: realized, open and unattributed short nets equal the ledger short credits, and the basis matches', () => {
    fc.assert(
      fc.property(pmccTimelineEvents, (input) => {
        const { cycles, summary } = timelineOf(input)
        const ledger = calculatePmccLedger({
          leapsContracts: leapsContractsOf(input),
          longStrike: null,
          contributions: contributionsOf(input)
        })
        const unattributed = orphanShortDollars(input)
        // A cycle with no recorded outcome (open, or past its expiration) is not realized.
        const openTotal = sumOf(cycles.filter((c) => c.status !== 'ENDED').map((c) => c.netTotal))
        const shortTotal = openTotal.plus(summary.realizedTotal).plus(unattributed ?? 0)
        expect(shortTotal.equals(ledger.shortCreditsTotal)).toBe(true)
        expect(summary).toMatchObject({
          unattributedShortPerShare:
            unattributed === null
              ? null
              : money4(unattributed.dividedBy(100 * leapsContractsOf(input))),
          shortCreditsPerShare: ledger.shortCreditsPerShare,
          leapsCostPerShare: ledger.leapsCostPerShare,
          basisPerShare: ledger.basisPerShare
        })
      })
    )
  })

  it('oracle: counted day by day, the covered days are those some short call covers, and the gaps are exactly the rest', () => {
    fc.assert(
      fc.property(pmccTimelineEvents, (input) => {
        const { gaps, summary } = timelineOf(input)
        const window = windowDays(input)
        const covers = soldCalls(input)
        const uncovered = window.filter((day) => !covers.some((sold) => isCovering(sold, day)))
        expect(summary).toMatchObject({
          totalDays: window.length,
          coveredDays: window.length - uncovered.length,
          uncoveredDays: uncovered.length
        })
        expect(gaps.flatMap(({ from, to }) => daysFrom(from, to))).toEqual(uncovered)
        expect(gaps.reduce((days, gap) => days + gap.days, 0)).toBe(uncovered.length)
      })
    )
  })

  it('invariant: an open cycle has DTE left at the window end, or at its sale when that is later; one past its expiration is unrecorded', () => {
    fc.assert(
      fc.property(pmccTimelineEvents, (input) => {
        const { cycles, windowEnd } = timelineOf(input)
        const end = parseISO(windowEnd)
        cycles.forEach((cycle) => {
          if (cycle.status === 'OPEN') {
            const sold = parseISO(cycle.openedOn)
            const asOf = isBefore(end, sold) ? sold : end
            expect(cycle.dteRemaining).toBe(
              differenceInCalendarDays(parseISO(cycle.current.expiration), asOf)
            )
            expect(cycle.daysSoFar).toBe(differenceInCalendarDays(asOf, sold))
            expect(cycle.dteRemaining).toBeGreaterThanOrEqual(0)
          }
          if (cycle.status === 'UNRECORDED') {
            expect(cycle.expiredOn).toBe(cycle.current.expiration)
            expect(isBefore(parseISO(cycle.expiredOn), end)).toBe(true)
          }
        })
      })
    )
  })

  it('order independence: any permutation of the events gives the same timeline', () => {
    const shuffled = pmccTimelineEvents.chain((input) =>
      fc
        .shuffledSubarray(input.events, {
          minLength: input.events.length,
          maxLength: input.events.length
        })
        .map((events) => ({ input, permuted: { ...input, events } }))
    )
    fc.assert(
      fc.property(shuffled, ({ input, permuted }) => {
        expect(timelineOf(permuted)).toEqual(timelineOf(input))
      })
    )
  })

  it('scale invariance: k × every contract and fee keeps per-share figures and scales totals', () => {
    fc.assert(
      fc.property(pmccTimelineEvents, fc.integer({ min: 2, max: 5 }), (input, k) => {
        const base = timelineOf(input)
        const scaled = timelineOf(scaledBy(input, k))
        expect(perShareFigures(scaled)).toEqual(perShareFigures(base))
        expect(totals(scaled)).toEqual(totals(base).map((total) => times(total, k)))
      })
    )
  })

  it('guard: one cycle per short-call open, whatever the number of rolls', () => {
    fc.assert(
      fc.property(pmccTimelineEvents, (input) => {
        const opens = input.events.filter((event) => event.kind === 'SHORT_OPEN').length
        expect(timelineOf(input).cycles).toHaveLength(opens)
      })
    )
  })
})

const times = (amount: string | null, k: number): string | null =>
  amount === null ? null : new Decimal(amount).times(k).toFixed(4)

function scaledBy(input: PmccTimelineInput, k: number): PmccTimelineInput {
  const scale = (event: PmccTimelineEvent): PmccTimelineEvent =>
    event.kind === 'UNKNOWN'
      ? { ...event, contracts: event.contracts * k }
      : {
          ...event,
          contracts: event.contracts * k,
          contribution: {
            ...event.contribution,
            contracts: event.contribution.contracts * k,
            fees: new Decimal(event.contribution.fees).times(k).toFixed(4)
          }
        }
  return { ...input, events: input.events.map(scale) }
}

/** Every per-share figure and running basis, in a fixed traversal. */
function perShareFigures({ leapsTrack, cycles, summary }: PmccTimeline): (string | null)[] {
  const rollPerShare = (net: PmccNet): string[] => [net.direction, net.perShare]
  return [
    leapsTrack.costPerShare,
    ...leapsTrack.rows.flatMap((row) => {
      if (row.kind === 'PURCHASE') return [row.basisAfter]
      if (row.kind === 'ROLL') return [row.basisAfter, ...rollPerShare(row.net)]
      return []
    }),
    ...cycles.flatMap((cycle) => [
      cycle.netPerShare,
      cycle.basisAfter,
      ...cycle.rows.flatMap((row) => (row.kind === 'ROLL' ? rollPerShare(row.net) : []))
    ]),
    summary.realizedPerShare,
    summary.average?.perShare ?? null,
    summary.open?.creditPerShare ?? null,
    summary.leapsRollNetPerShare,
    summary.unattributedShortPerShare,
    summary.shortCreditsPerShare,
    summary.leapsCostPerShare,
    summary.basisPerShare
  ]
}

/**
 * Every dollar total that is an exact sum of fills and fees, in a fixed traversal.
 * `average.total` is left out: realized ÷ closed count rounds before it scales.
 */
function totals({ leapsTrack, cycles, summary }: PmccTimeline): (string | null)[] {
  const rowTotals = (row: PmccLeapsRow | PmccCycleRow): (string | null)[] => {
    if (row.kind === 'ROLL') return [row.net.total, row.fees]
    if (row.kind === 'UNKNOWN') return []
    return [row.total, row.fees]
  }
  return [
    ...leapsTrack.rows.flatMap(rowTotals),
    ...cycles.flatMap((cycle) => [cycle.netTotal, ...cycle.rows.flatMap(rowTotals)]),
    summary.realizedTotal
  ]
}
