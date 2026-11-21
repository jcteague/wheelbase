// [US-109] PMCC leg timeline: folds a PMCC's ledger events into one LEAPS track and a list of
// short-call cycles, replaying the US-103 ledger for the basis after each event.
import Decimal from 'decimal.js'
import { money4 } from '../../shared/decimal-text'
import { netDirection } from '../../shared/net-direction'
import {
  calculatePmccLedger,
  contributionDollars,
  sharesFromContracts,
  type PmccContribution,
  type PmccLedgerResult
} from './costbasis'
import { daysBetween } from './dte'
import { coverageGaps, timelineSummary } from './pmcc-timeline-summary'
import type {
  ContractRef,
  PmccCycle,
  PmccCycleCommon,
  PmccCycleFlag,
  PmccCycleStatus,
  PmccEndCash,
  PmccLeapsRollCoverage,
  PmccLeapsRow,
  PmccNet,
  PmccShortOutcome,
  PmccTimeline,
  PmccTimelineEvent,
  PmccTimelineInput
} from './pmcc-timeline-types'

export type * from './pmcc-timeline-types'

/** Same-day order (research ADR "Timeline order"): LEAPS, then ends, rolls, opens, unknown, close. */
const EVENT_RANK: Record<PmccTimelineEvent['kind'], number> = {
  LEAPS_OPEN: 0,
  LEAPS_ROLL: 0,
  SHORT_END: 1,
  SHORT_ROLL: 2,
  SHORT_OPEN: 3,
  UNKNOWN: 4,
  LEAPS_CLOSE: 5
}

/** The day an event folds on: its fill, or for a LEAPS roll the earlier of its two fills. */
export function timelineEventDate(event: PmccTimelineEvent): string {
  if (event.kind !== 'LEAPS_ROLL') return event.date
  return event.openedOn < event.closedOn ? event.openedOn : event.closedOn
}

const byTimelineOrder = (a: PmccTimelineEvent, b: PmccTimelineEvent): number =>
  timelineEventDate(a).localeCompare(timelineEventDate(b)) ||
  EVENT_RANK[a.kind] - EVENT_RANK[b.kind] ||
  a.seq - b.seq

const contractKey = ({ strike, expiration }: ContractRef): string => `${strike}@${expiration}`

/** The short contract a roll or an end gives up; null for any other event. */
function givenUpKey(event: PmccTimelineEvent): string | null {
  if (event.kind === 'SHORT_ROLL') return contractKey(event.from)
  return event.kind === 'SHORT_END' ? contractKey(event.contract) : null
}

/** The short contract an open or a roll leaves held; null for any other event. */
function takenKey(event: PmccTimelineEvent): string | null {
  if (event.kind === 'SHORT_OPEN') return contractKey(event.contract)
  return event.kind === 'SHORT_ROLL' ? contractKey(event.to) : null
}

/** Whether `events` leave short contract `key` held: taken more often than given up. */
function isHeld(events: PmccTimelineEvent[], key: string): boolean {
  const times = (keyOf: (event: PmccTimelineEvent) => string | null): number =>
    events.filter((event) => keyOf(event) === key).length
  return times(takenKey) > times(givenUpKey)
}

/**
 * The ADR order (date, rank, seq), except that a short roll or end waits on its day for the
 * open or roll that takes its contract: a short sold and rolled, or sold and bought back, the
 * same day folds open first. A contract already held, or one nothing that day takes, keeps the
 * rank. Depends only on the events, not the order they arrive in.
 */
function timelineOrder(
  pending: PmccTimelineEvent[],
  ordered: PmccTimelineEvent[] = []
): PmccTimelineEvent[] {
  const [first] = pending
  if (first === undefined) return ordered
  const day = timelineEventDate(first)
  const sameDay = pending.filter((event) => timelineEventDate(event) === day)
  const ready = (event: PmccTimelineEvent): boolean => {
    const givenUp = givenUpKey(event)
    return (
      givenUp === null ||
      isHeld(ordered, givenUp) ||
      !sameDay.some((other) => takenKey(other) === givenUp)
    )
  }
  // Only a same-day loop of rolls (A → B, B → A, neither held) leaves nothing ready.
  const next = sameDay.find(ready) ?? first
  return timelineOrder(
    pending.filter((event) => event !== next),
    [...ordered, next]
  )
}

type LeapsHoldingEvent = Extract<PmccTimelineEvent, { kind: 'LEAPS_OPEN' | 'LEAPS_ROLL' }>

const isLeapsHolding = (event: PmccTimelineEvent): event is LeapsHoldingEvent =>
  event.kind === 'LEAPS_OPEN' || event.kind === 'LEAPS_ROLL'

const contractRef = ({ strike, expiration }: ContractRef): ContractRef => ({ strike, expiration })

/** A fill's unsigned gross dollars: price × 100 × contracts. */
const fillTotal = (pricePerShare: string, contracts: number): string =>
  money4(new Decimal(pricePerShare).times(sharesFromContracts(contracts)))

/** Signed received − paid dollars over `contributions`: a credit is positive. */
const netDollars = (contributions: PmccContribution[]): Decimal =>
  contributions
    .reduce((sum, contribution) => sum.plus(contributionDollars(contribution)), new Decimal(0))
    .negated()

type CycleDraft = Omit<PmccCycleCommon, 'netPerShare' | 'netTotal' | 'flag'> & {
  contributions: PmccContribution[]
  end: { outcome: PmccShortOutcome; endedOn: string } | null
}

type Fold = {
  /** Every contribution so far, in timeline order: the ledger replay's prefix. */
  contributions: PmccContribution[]
  leapsRows: PmccLeapsRow[]
  cycles: CycleDraft[]
  /** Short rolls' and ends' contributions no open cycle took (see `holderIndex`). */
  unattributed: PmccContribution[]
}

type Ledger = {
  /** Shares the LEAPS covers: the per-share divisor. */
  shares: number
  basisAfter: (contributions: PmccContribution[]) => string
}

const openCycle = (fold: Fold): CycleDraft | null => {
  const last = fold.cycles.at(-1)
  return last !== undefined && last.end === null ? last : null
}

/** Every short contract a cycle has held: its opening one and each it rolled to. */
const heldContracts = (cycle: CycleDraft): ContractRef[] =>
  cycle.rows.flatMap((row) => {
    if (row.kind === 'OPEN') return [row.contract]
    return row.kind === 'ROLL' ? [row.to] : []
  })

const withCycleAt = (fold: Fold, at: number, update: (cycle: CycleDraft) => CycleDraft): Fold => ({
  ...fold,
  cycles: fold.cycles.map((cycle, index) => (index === at ? update(cycle) : cycle))
})

/**
 * The cycle a short roll or end belongs to; only an open cycle takes one. The latest open cycle
 * holding `contract`, so a cycle sold before the previous one expired does not take its end;
 * else, when no ended cycle ever held it, the latest cycle while it is open. Null otherwise — a
 * duplicate for a contract an ended cycle held (its last, its opening one or one it rolled
 * through), or no cycle open: the event is unattributed instead, and an ended cycle is never
 * re-ended or re-rolled.
 */
function holderIndex(fold: Fold, contract: ContractRef): number | null {
  const heldKey = contractKey(contract)
  const isKey = (held: ContractRef): boolean => contractKey(held) === heldKey
  const holder = fold.cycles.findLastIndex((cycle) => cycle.end === null && isKey(cycle.current))
  if (holder !== -1) return holder
  const endedHeldIt = fold.cycles.some(
    (cycle) => cycle.end !== null && heldContracts(cycle).some(isKey)
  )
  if (endedHeldIt || openCycle(fold) === null) return null
  return fold.cycles.length - 1
}

/** A roll's own net: the one contribution it made, unsigned with its direction. */
function rollNet(contribution: PmccContribution, ledger: Ledger): PmccNet {
  const total = netDollars([contribution])
  return {
    direction: netDirection(total),
    perShare: money4(total.abs().dividedBy(ledger.shares)),
    total: money4(total.abs())
  }
}

type LeapsEvent = Extract<PmccTimelineEvent, { kind: 'LEAPS_OPEN' | 'LEAPS_ROLL' | 'LEAPS_CLOSE' }>
type ShortEvent = Extract<PmccTimelineEvent, { kind: 'SHORT_OPEN' | 'SHORT_ROLL' | 'SHORT_END' }>
type UnknownEvent = Extract<PmccTimelineEvent, { kind: 'UNKNOWN' }>

const isLeapsEvent = (event: LeapsEvent | ShortEvent): event is LeapsEvent =>
  event.kind === 'LEAPS_OPEN' || event.kind === 'LEAPS_ROLL' || event.kind === 'LEAPS_CLOSE'

/** What a known event's row takes from the replay: the basis after it and its fees. */
type Step = { basisAfter: string; fees: string; ledger: Ledger }

function rollCoverage(event: Extract<LeapsEvent, { kind: 'LEAPS_ROLL' }>): PmccLeapsRollCoverage {
  const extensionDays = daysBetween(event.from.expiration, event.to.expiration)
  return event.openedOn <= event.closedOn
    ? { unbroken: true, extensionDays }
    : { unbroken: false, gapDays: daysBetween(event.closedOn, event.openedOn), extensionDays }
}

function leapsRow(
  event: LeapsEvent,
  { basisAfter, fees, ledger }: Step,
  rollNumber: number
): PmccLeapsRow {
  switch (event.kind) {
    case 'LEAPS_OPEN':
      return {
        kind: 'PURCHASE',
        date: event.date,
        contract: event.contract,
        total: fillTotal(event.contract.pricePerShare, event.contracts),
        dteAtFill: daysBetween(event.date, event.contract.expiration),
        basisAfter,
        fees
      }
    case 'LEAPS_ROLL':
      return {
        kind: 'ROLL',
        number: rollNumber,
        date: timelineEventDate(event),
        from: event.from,
        to: event.to,
        net: rollNet(event.contribution, ledger),
        coverage: rollCoverage(event),
        basisAfter,
        fees
      }
    case 'LEAPS_CLOSE':
      return {
        kind: 'CLOSE',
        date: event.date,
        contract: event.contract,
        total: fillTotal(event.contract.pricePerShare, event.contracts),
        fees
      }
  }
}

/** A LEAPS event adds one row to the LEAPS track; a roll is numbered after the rolls before it. */
function applyLeapsEvent(fold: Fold, event: LeapsEvent, step: Step): Fold {
  const rollNumber = fold.leapsRows.filter((row) => row.kind === 'ROLL').length + 1
  return { ...fold, leapsRows: [...fold.leapsRows, leapsRow(event, step, rollNumber)] }
}

function startCycle(
  event: Extract<ShortEvent, { kind: 'SHORT_OPEN' }>,
  { basisAfter, fees }: Step,
  number: number
): CycleDraft {
  return {
    number,
    openedOn: event.date,
    opening: event.contract,
    current: contractRef(event.contract),
    dteAtOpen: daysBetween(event.date, event.contract.expiration),
    rollCount: 0,
    basisAfter,
    contributions: [event.contribution],
    end: null,
    rows: [
      {
        kind: 'OPEN',
        date: event.date,
        contract: event.contract,
        total: fillTotal(event.contract.pricePerShare, event.contracts),
        fees
      }
    ]
  }
}

function rollCycle(
  cycle: CycleDraft,
  event: Extract<ShortEvent, { kind: 'SHORT_ROLL' }>,
  { basisAfter, fees, ledger }: Step
): CycleDraft {
  const number = cycle.rollCount + 1
  return {
    ...cycle,
    current: contractRef(event.to),
    rollCount: number,
    basisAfter,
    contributions: [...cycle.contributions, event.contribution],
    rows: [
      ...cycle.rows,
      {
        kind: 'ROLL',
        number,
        date: event.date,
        from: event.from,
        to: event.to,
        net: rollNet(event.contribution, ledger),
        fees
      }
    ]
  }
}

type ShortEndEvent = Extract<ShortEvent, { kind: 'SHORT_END' }>

/** A close's buyback price and gross total; an expiry or assignment moves no cash. */
const endCash = (event: ShortEndEvent): PmccEndCash =>
  event.outcome === 'CLOSED'
    ? {
        outcome: event.outcome,
        pricePerShare: event.pricePerShare,
        total: fillTotal(event.pricePerShare, event.contracts)
      }
    : { outcome: event.outcome, pricePerShare: null, total: null }

function endCycle(cycle: CycleDraft, event: ShortEndEvent, { basisAfter, fees }: Step): CycleDraft {
  return {
    ...cycle,
    basisAfter,
    contributions: [...cycle.contributions, event.contribution],
    end: { outcome: event.outcome, endedOn: event.date },
    rows: [
      ...cycle.rows,
      { kind: 'END', date: event.date, contract: event.contract, fees, ...endCash(event) }
    ]
  }
}

/**
 * A short roll or end with no cycle to join (see `holderIndex`): a neutral LEAPS-track row named
 * for its kind, its dollars kept as unattributed so the summary still reconciles to the ledger.
 */
function unattributedShortEvent(
  fold: Fold,
  event: Extract<ShortEvent, { kind: 'SHORT_ROLL' | 'SHORT_END' }>
): Fold {
  return {
    ...fold,
    leapsRows: [...fold.leapsRows, { kind: 'UNKNOWN', date: event.date, role: event.kind }],
    unattributed: [...fold.unattributed, event.contribution]
  }
}

/**
 * A short-call open starts the next cycle; a roll or an end extends the open cycle holding it (or
 * the open cycle, when no cycle holds it), or is unattributed when there is neither.
 */
function applyShortEvent(fold: Fold, event: ShortEvent, step: Step): Fold {
  if (event.kind === 'SHORT_OPEN') {
    return { ...fold, cycles: [...fold.cycles, startCycle(event, step, fold.cycles.length + 1)] }
  }
  const holder = holderIndex(fold, event.kind === 'SHORT_ROLL' ? event.from : event.contract)
  if (holder === null) return unattributedShortEvent(fold, event)
  return withCycleAt(fold, holder, (cycle) =>
    event.kind === 'SHORT_ROLL' ? rollCycle(cycle, event, step) : endCycle(cycle, event, step)
  )
}

/**
 * An unknown leg joins the latest cycle open on its date — no end folded yet and its short not
 * yet expired — else the LEAPS track. It moves no figure, not even the cycle's footer: that
 * stays the basis after the cycle's last known event.
 */
function applyUnknownEvent(fold: Fold, event: UnknownEvent): Fold {
  const row = { kind: 'UNKNOWN' as const, date: event.date, role: event.role }
  const openOnDate = fold.cycles.findLastIndex(
    (cycle) => cycle.end === null && daysBetween(event.date, cycle.current.expiration) >= 0
  )
  return openOnDate === -1
    ? { ...fold, leapsRows: [...fold.leapsRows, row] }
    : withCycleAt(fold, openOnDate, (cycle) => ({ ...cycle, rows: [...cycle.rows, row] }))
}

function applyEvent(fold: Fold, event: PmccTimelineEvent, ledger: Ledger): Fold {
  if (event.kind === 'UNKNOWN') return applyUnknownEvent(fold, event)
  const contributions = [...fold.contributions, event.contribution]
  const step: Step = {
    basisAfter: ledger.basisAfter(contributions),
    fees: money4(event.contribution.fees),
    ledger
  }
  const next: Fold = { ...fold, contributions }
  return isLeapsEvent(event)
    ? applyLeapsEvent(next, event, step)
    : applyShortEvent(next, event, step)
}

/**
 * Flags a cycle whose coverage ran, or will run, past the LEAPS held now — until its end, or
 * with none recorded its short's expiration — by the days it outlasts the LEAPS.
 */
function outlastFlag(coveredUntil: string, leapsExpiration: string): PmccCycleFlag | null {
  const daysPastLeaps = daysBetween(leapsExpiration, coveredUntil)
  return daysPastLeaps > 0 ? { daysPastLeaps, leapsExpiration } : null
}

/**
 * `day`, or `floor` when `day` is earlier: a valuation date behind a fill (the user's local date
 * ahead of New York's) counts from the fill, not before it.
 */
const notBefore = (floor: string, day: string): string =>
  // Stryker disable next-line EqualityOperator: at 0 days `floor` and `day` are the same date, so `<=` is equivalent
  daysBetween(floor, day) < 0 ? floor : day

/**
 * A cycle's status at `windowEnd`, or at its sale when that is later. With no terminal event it
 * is open through its short's expiration and unrecorded after it: the days past the expiration
 * are not counted as held.
 */
function cycleStatus(
  { openedOn, current, end }: Pick<CycleDraft, 'openedOn' | 'current' | 'end'>,
  windowEnd: string
): PmccCycleStatus {
  if (end !== null) {
    const { outcome, endedOn } = end
    return { status: 'ENDED', outcome, endedOn, daysHeld: daysBetween(openedOn, endedOn) }
  }
  const asOf = notBefore(openedOn, windowEnd)
  const dteRemaining = daysBetween(asOf, current.expiration)
  if (dteRemaining < 0) {
    const expiredOn = current.expiration
    return { status: 'UNRECORDED', expiredOn, daysHeld: daysBetween(openedOn, expiredOn) }
  }
  return { status: 'OPEN', daysSoFar: daysBetween(openedOn, asOf), dteRemaining }
}

type CycleContext = { ledger: Ledger; windowEnd: string; leapsExpiration: string }

function toCycle(
  draft: CycleDraft,
  { ledger, windowEnd, leapsExpiration }: CycleContext
): PmccCycle {
  const { contributions, end, ...common } = draft
  const total = netDollars(contributions)
  const status = cycleStatus({ ...common, end }, windowEnd)
  const coveredUntil = status.status === 'ENDED' ? status.endedOn : common.current.expiration
  return {
    ...common,
    netPerShare: money4(total.dividedBy(ledger.shares)),
    netTotal: money4(total),
    flag: outlastFlag(coveredUntil, leapsExpiration),
    ...status
  }
}

const EMPTY_FOLD: Fold = {
  // Stryker disable next-line ArrayDeclaration: the ledger's side filter drops a non-contribution entry, so a seeded prefix is unobservable
  contributions: [],
  leapsRows: [],
  cycles: [],
  unattributed: []
}

/** The timeline of a PMCC's events; null when there is no LEAPS purchase or roll among them. */
export function buildPmccTimeline(input: PmccTimelineInput): PmccTimeline | null {
  const events = timelineOrder([...input.events].sort(byTimelineOrder))
  const [first, ...later] = events.filter(isLeapsHolding)
  if (first === undefined) return null
  const held = later.at(-1) ?? first

  const leapsContracts = held.contracts
  const ledgerOf = (contributions: PmccContribution[]): PmccLedgerResult =>
    calculatePmccLedger({ leapsContracts, longStrike: null, contributions })
  const ledger: Ledger = {
    shares: sharesFromContracts(leapsContracts),
    basisAfter: (contributions) => ledgerOf(contributions).basisPerShare
  }

  const fold = events.reduce((state, event) => applyEvent(state, event, ledger), EMPTY_FOLD)
  const final = ledgerOf(fold.contributions)
  const current = contractRef(held.kind === 'LEAPS_OPEN' ? held.contract : held.to)
  const start = timelineEventDate(first)
  // A valuation date behind the first LEAPS fill gives an empty window, not a negative one.
  const windowEnd = notBefore(start, input.closedDate ?? input.valuationDate)
  const cycleContext: CycleContext = { ledger, windowEnd, leapsExpiration: current.expiration }
  const cycles = fold.cycles.map((draft) => toCycle(draft, cycleContext))
  const gaps = coverageGaps(cycles, start, windowEnd)
  const leapsRolls = events.flatMap((event) =>
    event.kind === 'LEAPS_ROLL' ? [event.contribution] : []
  )

  return {
    start,
    windowEnd,
    valuationDate: input.valuationDate,
    closedDate: input.closedDate,
    leapsTrack: { current, costPerShare: final.leapsCostPerShare, rows: fold.leapsRows },
    cycles,
    gaps,
    summary: timelineSummary({
      cycles,
      gaps,
      leapsRollNet: leapsRolls.length === 0 ? null : netDollars(leapsRolls),
      unattributedShort: fold.unattributed.length === 0 ? null : netDollars(fold.unattributed),
      shares: ledger.shares,
      final,
      totalDays: daysBetween(start, windowEnd)
    })
  }
}
