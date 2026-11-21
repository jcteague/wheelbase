// Shared fast-check arbitraries for property tests over the pure core engines.
//
// Money is generated the way the engines store it — a 4-dp decimal string — so a
// property can reason about exact Decimal arithmetic rather than float noise.
import fc from 'fast-check'
import Decimal from 'decimal.js'
import { addDays, format, parseISO } from 'date-fns'
import { WheelPhase } from '../types'
import type { PmccContribution, PmccUnrealizedPnlInput } from '../costbasis'
import type { PmccSignalInput, PmccSignalShort } from '../pmcc-card'
import {
  timelineEventDate,
  type ContractRef,
  type Fill,
  type PmccShortEnd,
  type PmccShortOutcome,
  type PmccTimelineEvent,
  type PmccTimelineInput
} from '../pmcc-timeline'

const MONEY_SCALE = 10_000
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const scaled = (units: number): string => new Decimal(units).div(MONEY_SCALE).toFixed(4)

/** Strictly positive money, 0.0001 … maxDollars, as a 4-dp string. */
export const positiveMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: 1, max: maxDollars * MONEY_SCALE }).map(scaled)

/** Money that may be exactly zero. */
export const nonNegativeMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: maxDollars * MONEY_SCALE }).map(scaled)

/** Zero or negative money — what a "must be positive" guard has to reject. */
export const nonPositiveMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: -maxDollars * MONEY_SCALE, max: 0 }).map(scaled)

/** Money of either sign, −maxDollars … maxDollars, as a 4-dp string. */
export const signedMoney = (maxDollars = 1000): fc.Arbitrary<string> =>
  fc.integer({ min: -maxDollars * MONEY_SCALE, max: maxDollars * MONEY_SCALE }).map(scaled)

export const contracts = fc.integer({ min: 1, max: 50 })

/** A real calendar day as YYYY-MM-DD. Day ≤ 28 so every month is valid without date math. */
export const isoDay = fc
  .record({
    year: fc.integer({ min: 2020, max: 2035 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 })
  })
  .map(
    ({ year, month, day }) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  )

/** `count` ISO days sorted ascending — for "fill ≤ expiration ≤ reference" style inputs. */
export const orderedDays = (count: number): fc.Arbitrary<string[]> =>
  fc.array(isoDay, { minLength: count, maxLength: count }).map((days) => [...days].sort())

/** `count` distinct ISO days sorted ascending — each strictly before the next. */
export const strictlyOrderedDays = (count: number): fc.Arbitrary<string[]> =>
  fc.uniqueArray(isoDay, { minLength: count, maxLength: count }).map((days) => [...days].sort())

export const wheelPhase = fc.constantFrom(...WheelPhase.options)

/** 1–5 uppercase letters, the ticker shape the lifecycle engine accepts. */
export const ticker = fc
  .array(fc.constantFrom(...UPPERCASE), { minLength: 1, maxLength: 5 })
  .map((letters) => letters.join(''))

/**
 * One signed PMCC ledger contribution: a debit (+) or credit (−) per share on either side,
 * with non-negative fees — what `calculatePmccLedger` folds.
 */
export const pmccContribution: fc.Arbitrary<PmccContribution> = fc.record({
  side: fc.constantFrom('LONG' as const, 'SHORT' as const),
  cashPerShare: fc
    .tuple(positiveMoney(100), fc.boolean())
    .map(([amount, negative]) => (negative ? `-${amount}` : amount)),
  contracts,
  fees: nonNegativeMoney(10)
})

type PmccMarkedLeg = PmccUnrealizedPnlInput['legs'][number]

/** One open PMCC leg on `side` with a non-negative mid — what `computePmccUnrealizedPnl` marks. */
export const pmccMarkedLeg = (side: PmccMarkedLeg['side']): fc.Arbitrary<PmccMarkedLeg> =>
  fc.record({ side: fc.constant(side), mid: nonNegativeMoney(100), contracts })

/** One open PMCC short call, dte −5 … 60 so the expiring and management windows both draw. */
export const pmccSignalShort: fc.Arbitrary<PmccSignalShort> = fc.record({
  legId: fc.uuid(),
  strike: positiveMoney(500),
  dte: fc.integer({ min: -5, max: 60 }),
  expiration: isoDay
})

/**
 * Any PMCC card's signal input: 0–3 shorts sorted nearest first, an optional delta in [0, 1],
 * an optional LEAPS spread, a basis of either sign, and earnings around the short windows.
 */
export const pmccSignalInput: fc.Arbitrary<PmccSignalInput> = fc.record({
  leaps: fc.record({
    strike: positiveMoney(500),
    dte: fc.integer({ min: -5, max: 800 }),
    delta: fc.option(nonNegativeMoney(1)),
    spread: fc.option(
      fc.record({
        bid: nonNegativeMoney(100),
        ask: nonNegativeMoney(100),
        mid: nonNegativeMoney(100)
      })
    )
  }),
  shorts: fc
    .array(pmccSignalShort, { maxLength: 3 })
    .map((shorts) => [...shorts].sort((a, b) => a.dte - b.dte)),
  price: fc.option(positiveMoney(500)),
  basisPerShare: signedMoney(100),
  managementWindowDte: fc.integer({ min: 0, max: 45 }),
  daysToEarnings: fc.option(fc.integer({ min: -5, max: 30 }))
})

// ── PMCC timeline histories ───────────────────────────────────────────────────

const dayAfter = (day: string, days: number): string =>
  format(addDays(parseISO(day), days), 'yyyy-MM-dd')

/** A price received, as the ledger's (negative) credit cash. */
const credit = (price: string): string => new Decimal(price).negated().toFixed(4)

/** Price paid minus price received: the ledger's signed cash for a roll. */
const rollCash = (paid: string, received: string): string =>
  new Decimal(paid).minus(received).toFixed(4)

const contractSpec = fc.record({
  strike: positiveMoney(500),
  price: positiveMoney(50),
  dte: fc.integer({ min: 1, max: 90 })
})

type ContractSpec = { strike: string; price: string; dte: number }

const fillOn = (day: string, { strike, price, dte }: ContractSpec): Fill => ({
  strike,
  expiration: dayAfter(day, dte),
  pricePerShare: price
})

/**
 * Days after the LEAPS purchase or the previous orphan (0 is the same day); for a stray after a
 * cycle, days after the day following its end.
 */
const orphanAfter = fc.integer({ min: 0, max: 10 })

/**
 * A short roll or end for a contract no cycle holds, recorded while no cycle is open: before any
 * short call was sold, or in the gap after a cycle ended.
 */
const orphanSpec = fc.oneof(
  fc.record({
    kind: fc.constant<'SHORT_ROLL'>('SHORT_ROLL'),
    after: orphanAfter,
    contracts,
    /** The contract bought back, at its `price`. */
    from: contractSpec,
    to: contractSpec,
    fees: nonNegativeMoney(10)
  }),
  fc.record({
    kind: fc.constant<'SHORT_END'>('SHORT_END'),
    after: orphanAfter,
    contracts,
    held: contractSpec,
    outcome: fc.constantFrom<PmccShortOutcome>('EXPIRED', 'CLOSED', 'ASSIGNED'),
    closePrice: positiveMoney(50),
    endFees: nonNegativeMoney(10)
  })
)

const cycleSpec = fc.record({
  /** Days after the previous cycle ended (or the LEAPS was bought): 0 is back to back. */
  gapBefore: fc.integer({ min: 0, max: 30 }),
  /**
   * Days after the previous cycle was sold that this one is, in place of `gapBefore`: before
   * the previous one ended, the two overlap. Ignored for the first cycle and after a stray.
   */
  soldAfterPrevious: fc.option(fc.integer({ min: 0, max: 20 }), { nil: null }),
  contracts,
  open: contractSpec,
  openFees: nonNegativeMoney(10),
  rolls: fc.array(
    fc.record({
      /** Days after the cycle's previous open or roll: 0 is a same-day roll. */
      after: fc.integer({ min: 0, max: 20 }),
      buyBack: positiveMoney(50),
      to: contractSpec,
      fees: nonNegativeMoney(10)
    }),
    { maxLength: 2 }
  ),
  /** Days after the cycle's last open or roll: 0 ends it the day it was sold or rolled. */
  endAfter: fc.integer({ min: 0, max: 40 }),
  outcome: fc.constantFrom<PmccShortOutcome>('EXPIRED', 'CLOSED', 'ASSIGNED'),
  closePrice: positiveMoney(50),
  endFees: nonNegativeMoney(10),
  /** A stray roll or end dated after the cycle ended, before the next one opens; or none. */
  strayAfter: fc.option(orphanSpec, { nil: null }),
  /** Whether the stray gives up the contract the ended cycle last held: a duplicate. */
  strayReusesHeld: fc.boolean()
})

const historySpec = fc.record({
  start: isoDay,
  leapsContracts: contracts,
  leaps: fc.record({
    strike: positiveMoney(500),
    price: positiveMoney(100),
    dte: fc.integer({ min: 30, max: 800 }),
    fees: nonNegativeMoney(10)
  }),
  leapsRolls: fc.array(
    fc.record({
      /** Days after the LEAPS purchase that the old LEAPS was sold. */
      day: fc.integer({ min: 0, max: 400 }),
      /** Days after that the replacement was bought. */
      openLag: fc.integer({ min: 0, max: 3 }),
      sellPrice: positiveMoney(100),
      to: fc.record({
        strike: positiveMoney(500),
        price: positiveMoney(100),
        dte: fc.integer({ min: 30, max: 800 })
      }),
      fees: nonNegativeMoney(10)
    }),
    { maxLength: 2 }
  ),
  orphans: fc.array(orphanSpec, { maxLength: 2 }),
  cycles: fc.array(cycleSpec, { maxLength: 5 }),
  lastCycleOpen: fc.boolean(),
  /** Whether a last cycle left open is valued after its short expired, no outcome recorded. */
  valuedPastExpiry: fc.boolean(),
  unknowns: fc.array(
    fc.record({
      /** Days after the LEAPS purchase: anywhere in the history, or past its last event. */
      day: fc.integer({ min: 0, max: 200 }),
      role: fc.constantFrom('CC_CLOSE', 'CSP_OPEN')
    }),
    { maxLength: 2 }
  ),
  /** The sale that closes the LEAPS on the close date, when the position closed. */
  leapsClose: fc.record({ price: positiveMoney(100), fees: nonNegativeMoney(10) }),
  /** Days after its last event that the position closed; null while it is open. */
  closedAfter: fc.option(fc.integer({ min: 0, max: 30 }), { nil: null }),
  /**
   * Days from the window's end to the valuation date; negative values it before the history's
   * last events (the user's local date ahead of New York's), as far back as before the LEAPS.
   */
  valuationAfter: fc.oneof(fc.integer({ min: 0, max: 30 }), fc.integer({ min: -60, max: -1 }))
})

type HistorySpec = typeof historySpec extends fc.Arbitrary<infer T> ? T : never
type CycleSpec = HistorySpec['cycles'][number]
type OrphanSpec = HistorySpec['orphans'][number]

/** Events are built with a placeholder `seq`; the history numbers them once at the end. */
const UNSEQUENCED = 0

function leapsEvents({ start, leapsContracts, leaps, leapsRolls }: HistorySpec): {
  held: Fill
  events: PmccTimelineEvent[]
} {
  const bought = fillOn(start, leaps)
  const purchase: PmccTimelineEvent = {
    kind: 'LEAPS_OPEN',
    seq: UNSEQUENCED,
    date: start,
    contracts: leapsContracts,
    contract: bought,
    contribution: {
      side: 'LONG',
      cashPerShare: bought.pricePerShare,
      contracts: leapsContracts,
      fees: leaps.fees
    }
  }
  const rolls = [...leapsRolls]
    .sort((a, b) => a.day - b.day)
    .reduce<{ held: Fill; events: PmccTimelineEvent[] }>(
      ({ held, events }, roll) => {
        const closedOn = dayAfter(start, roll.day)
        const openedOn = dayAfter(closedOn, roll.openLag)
        const to = fillOn(openedOn, roll.to)
        const event: PmccTimelineEvent = {
          kind: 'LEAPS_ROLL',
          seq: UNSEQUENCED,
          contracts: leapsContracts,
          from: { ...held, pricePerShare: roll.sellPrice },
          to,
          closedOn,
          openedOn,
          contribution: {
            side: 'LONG',
            cashPerShare: rollCash(to.pricePerShare, roll.sellPrice),
            contracts: leapsContracts,
            fees: roll.fees
          }
        }
        return { held: to, events: [...events, event] }
      },
      { held: bought, events: [] }
    )
  return { held: rolls.held, events: [purchase, ...rolls.events] }
}

/** One cycle opened on `opened`: its open, its rolls and, when it `ends`, its end. */
function cycleEvents(spec: CycleSpec, opened: string, ends: boolean): PmccTimelineEvent[] {
  const { contracts } = spec
  const opening = fillOn(opened, spec.open)
  const open: PmccTimelineEvent = {
    kind: 'SHORT_OPEN',
    seq: UNSEQUENCED,
    date: opened,
    contracts,
    contract: opening,
    contribution: {
      side: 'SHORT',
      cashPerShare: credit(opening.pricePerShare),
      contracts,
      fees: spec.openFees
    }
  }
  const rolled = spec.rolls.reduce<{ day: string; held: Fill; events: PmccTimelineEvent[] }>(
    ({ day, held, events }, roll) => {
      const rolledOn = dayAfter(day, roll.after)
      const to = fillOn(rolledOn, roll.to)
      const event: PmccTimelineEvent = {
        kind: 'SHORT_ROLL',
        seq: UNSEQUENCED,
        date: rolledOn,
        contracts,
        from: { ...held, pricePerShare: roll.buyBack },
        to,
        contribution: {
          side: 'SHORT',
          cashPerShare: rollCash(roll.buyBack, to.pricePerShare),
          contracts,
          fees: roll.fees
        }
      }
      return { day: rolledOn, held: to, events: [...events, event] }
    },
    { day: opened, held: opening, events: [open] }
  )
  if (!ends) return rolled.events
  return [...rolled.events, shortEndEvent(spec, dayAfter(rolled.day, spec.endAfter), rolled.held)]
}

type EndSpec = Pick<CycleSpec, 'contracts' | 'outcome' | 'closePrice' | 'endFees'>

/** A short call `held` ending on `date`: a close buys it back at `closePrice`, else no cash. */
function shortEndEvent(spec: EndSpec, date: string, held: ContractRef): PmccTimelineEvent {
  const end: PmccShortEnd =
    spec.outcome === 'CLOSED'
      ? { outcome: spec.outcome, pricePerShare: spec.closePrice }
      : { outcome: spec.outcome, pricePerShare: null }
  return {
    kind: 'SHORT_END',
    seq: UNSEQUENCED,
    date,
    contracts: spec.contracts,
    contract: { strike: held.strike, expiration: held.expiration },
    ...end,
    contribution: {
      side: 'SHORT',
      cashPerShare: end.pricePerShare ?? '0.0000',
      contracts: spec.contracts,
      fees: spec.endFees
    }
  }
}

/** A short roll or end on `date` giving up `givenUp`, or the contract its spec draws. */
function orphanEvent(spec: OrphanSpec, date: string, givenUp?: ContractRef): PmccTimelineEvent {
  if (spec.kind === 'SHORT_END') {
    return shortEndEvent(spec, date, givenUp ?? fillOn(date, spec.held))
  }
  const drawn = fillOn(date, spec.from)
  const from = givenUp === undefined ? drawn : { ...givenUp, pricePerShare: drawn.pricePerShare }
  const to = fillOn(date, spec.to)
  return {
    kind: 'SHORT_ROLL',
    seq: UNSEQUENCED,
    date,
    contracts: spec.contracts,
    from,
    to,
    contribution: {
      side: 'SHORT',
      cashPerShare: rollCash(from.pricePerShare, to.pricePerShare),
      contracts: spec.contracts,
      fees: spec.fees
    }
  }
}

/** The day of the last of `events`; undefined when there is none. */
const lastDayOf = (events: PmccTimelineEvent[]): string | undefined => {
  const last = events.at(-1)
  return last === undefined ? undefined : timelineEventDate(last)
}

/** The orphans in sequence from the LEAPS purchase, each `after` days after the previous one. */
function orphanEvents({ start, orphans }: HistorySpec): PmccTimelineEvent[] {
  return orphans.reduce<PmccTimelineEvent[]>(
    (events, spec) => [
      ...events,
      orphanEvent(spec, dayAfter(lastDayOf(events) ?? start, spec.after))
    ],
    []
  )
}

/**
 * An ended cycle's stray roll or end, at least a day after the cycle's `last` event (its end) so
 * it can only fold once that cycle has ended; when `strayReusesHeld`, it gives up the contract
 * that end gave up (a duplicate). None for an open cycle or a cycle drawn without one.
 */
function strayAfterCycle(
  spec: CycleSpec,
  last: PmccTimelineEvent | undefined
): PmccTimelineEvent[] {
  const end = last?.kind === 'SHORT_END' ? last : null
  if (end === null || spec.strayAfter === null) return []
  const date = dayAfter(end.date, 1 + spec.strayAfter.after)
  return [orphanEvent(spec.strayAfter, date, spec.strayReusesHeld ? end.contract : undefined)]
}

type ShortsSoFar = {
  /** The previous cycle's last event: its end, or the stray after it. */
  after: string
  /** The day the previous cycle was sold, unless a stray followed it; null for the first. */
  previousSold: string | null
  events: PmccTimelineEvent[]
}

/**
 * The day a cycle is sold: `soldAfterPrevious` days after the previous cycle was sold, which may
 * be before that one ended; else `gapBefore` days after the previous one's last event. A cycle
 * never overlaps one a stray followed, so a stray only ever folds while the latest cycle sold
 * has ended.
 */
const saleDay = (spec: CycleSpec, { after, previousSold }: ShortsSoFar): string =>
  previousSold !== null && spec.soldAfterPrevious !== null
    ? dayAfter(previousSold, spec.soldAfterPrevious)
    : dayAfter(after, spec.gapBefore)

/** The cycles in order of sale, the first sold after `from`; see `saleDay`. */
function shortEvents({ cycles, lastCycleOpen }: HistorySpec, from: string): PmccTimelineEvent[] {
  return cycles.reduce<ShortsSoFar>(
    (soFar, spec, index) => {
      const ends = !(lastCycleOpen && index === cycles.length - 1)
      const sold = saleDay(spec, soFar)
      const cycle = cycleEvents(spec, sold, ends)
      const stray = strayAfterCycle(spec, cycle.at(-1))
      const withStray = [...cycle, ...stray]
      return {
        after: timelineEventDate(withStray[withStray.length - 1]),
        previousSold: stray.length === 0 ? sold : null,
        events: [...soFar.events, ...withStray]
      }
    },
    { after: from, previousSold: null, events: [] }
  ).events
}

const unknownEvents = ({ start, unknowns }: HistorySpec): PmccTimelineEvent[] =>
  unknowns.map(({ day, role }) => ({
    kind: 'UNKNOWN',
    seq: UNSEQUENCED,
    date: dayAfter(start, day),
    contracts: 1,
    role
  }))

/** Sells the LEAPS `held` to close on `date`. */
function leapsCloseEvent(
  { leapsContracts, leapsClose }: HistorySpec,
  held: Fill,
  date: string
): PmccTimelineEvent {
  return {
    kind: 'LEAPS_CLOSE',
    seq: UNSEQUENCED,
    date,
    contracts: leapsContracts,
    contract: { ...held, pricePerShare: leapsClose.price },
    contribution: {
      side: 'LONG',
      cashPerShare: credit(leapsClose.price),
      contracts: leapsContracts,
      fees: leapsClose.fees
    }
  }
}

/** The expiration of the short the last cycle holds when it is left open: its last open or roll. */
function heldShortExpiration(shorts: PmccTimelineEvent[]): string | null {
  const last = shorts.at(-1)
  if (last?.kind === 'SHORT_OPEN') return last.contract.expiration
  return last?.kind === 'SHORT_ROLL' ? last.to.expiration : null
}

/**
 * A valid PMCC history by construction: one LEAPS bought on `start`, up to two LEAPS rolls, up
 * to two orphan short rolls or ends dated before any short call is sold, up to five short-call
 * cycles in order of sale (each with up to two rolls and an outcome, the last possibly still
 * open; one may be sold before the previous one ended, so the two overlap; an ended one possibly
 * followed by a stray roll or end in the gap after it, which may give up the contract that cycle
 * last held), up to two unknown legs anywhere, and fees on every leg. A closed position's window
 * ends at its close date, on or after the last event, and it sells its LEAPS then, even with a
 * short still open. An open position's valuation date may fall after the last event, after a
 * last open cycle's short expired with no outcome recorded, or before its last events. `seq` is
 * the construction order, so it only breaks same-day ties the ADR order leaves.
 */
export const pmccTimelineEvents: fc.Arbitrary<PmccTimelineInput> = historySpec.map((spec) => {
  const leaps = leapsEvents(spec)
  const orphans = orphanEvents(spec)
  const lastOrphan = orphans.at(-1)
  // The first cycle opens after the last orphan's day, so no cycle exists when one is folded.
  const cyclesFrom =
    lastOrphan === undefined ? spec.start : dayAfter(timelineEventDate(lastOrphan), 1)
  const shorts = shortEvents(spec, cyclesFrom)
  const built = [...leaps.events, ...orphans, ...shorts, ...unknownEvents(spec)]
  const lastDay = built.map(timelineEventDate).sort()[built.length - 1]
  const closedDate = spec.closedAfter === null ? null : dayAfter(lastDay, spec.closedAfter)
  const close = closedDate === null ? [] : [leapsCloseEvent(spec, leaps.held, closedDate)]
  const cycleOpen = spec.lastCycleOpen && spec.cycles.length > 0
  const expired = cycleOpen && spec.valuedPastExpiry ? heldShortExpiration(shorts) : null
  const windowEnd = closedDate ?? lastDay
  const pastExpiry = expired === null ? windowEnd : dayAfter(expired, 1)
  return {
    events: [...built, ...close].map((event, seq) => ({ ...event, seq })),
    closedDate,
    valuationDate: dayAfter(pastExpiry > windowEnd ? pastExpiry : windowEnd, spec.valuationAfter)
  }
})
