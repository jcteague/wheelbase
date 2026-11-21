// [US-109] The PMCC leg timeline's input events and output shape (plans/us-109/data-model.md).
// Re-exported from `./pmcc-timeline`, which is the module callers import.
import type { NetDirection } from '../../shared/net-direction'
import type { PmccContribution } from './costbasis'

/** A contract's terms: 4-dp strike and `YYYY-MM-DD` expiration. */
export type ContractRef = { strike: string; expiration: string }

/** A contract plus the 4-dp per-share price it filled at. */
export type Fill = ContractRef & { pricePerShare: string }

/** How a short-call cycle ended. */
export type PmccShortOutcome = 'EXPIRED' | 'CLOSED' | 'ASSIGNED'

/** How a short call ended: only a close has a buyback price. */
export type PmccShortEnd =
  | { outcome: 'CLOSED'; pricePerShare: string }
  | { outcome: 'EXPIRED' | 'ASSIGNED'; pricePerShare: null }

type EventBase = {
  /** The ledger's fill-date-then-createdAt index: the last tie-break. */
  seq: number
  contracts: number
}

/** A known event carries the contribution the US-103 ledger assigns it. */
type LedgerEventBase = EventBase & { contribution: PmccContribution }

type Dated = { date: string }

/**
 * Every event but a LEAPS roll is dated by its fill. A roll is dated by the earlier of its two
 * fills (`timelineEventDate`), so it carries no date that could disagree with them.
 */
export type PmccTimelineEvent =
  | (LedgerEventBase & Dated & { kind: 'LEAPS_OPEN'; contract: Fill })
  | (LedgerEventBase & {
      kind: 'LEAPS_ROLL'
      from: Fill
      to: Fill
      /** The day the old LEAPS was sold. */
      closedOn: string
      /** The day the replacement was bought. */
      openedOn: string
    })
  | (LedgerEventBase & Dated & { kind: 'LEAPS_CLOSE'; contract: Fill })
  | (LedgerEventBase & Dated & { kind: 'SHORT_OPEN'; contract: Fill })
  | (LedgerEventBase & Dated & { kind: 'SHORT_ROLL'; from: Fill; to: Fill })
  | (LedgerEventBase & Dated & { kind: 'SHORT_END'; contract: ContractRef } & PmccShortEnd)
  | (EventBase & Dated & { kind: 'UNKNOWN'; role: string })

export type PmccTimelineInput = {
  events: PmccTimelineEvent[]
  valuationDate: string
  closedDate: string | null
}

/** An unsigned 4-dp net with its direction. */
export type PmccNet = { direction: NetDirection; perShare: string; total: string }

/** Whether a LEAPS roll's replacement was bought before, on or after the old one was sold. */
export type PmccLeapsRollCoverage =
  | { unbroken: true; extensionDays: number }
  | { unbroken: false; gapDays: number; extensionDays: number }

export type PmccLeapsRow =
  | {
      kind: 'PURCHASE'
      date: string
      contract: Fill
      total: string
      dteAtFill: number
      basisAfter: string
      fees: string
    }
  | {
      kind: 'ROLL'
      number: number
      date: string
      from: Fill
      to: Fill
      net: PmccNet
      coverage: PmccLeapsRollCoverage
      basisAfter: string
      fees: string
    }
  | { kind: 'CLOSE'; date: string; contract: Fill; total: string; fees: string }
  | { kind: 'UNKNOWN'; date: string; role: string }

export type PmccCycleRow =
  | { kind: 'OPEN'; date: string; contract: Fill; total: string; fees: string }
  | { kind: 'ROLL'; number: number; date: string; from: Fill; to: Fill; net: PmccNet; fees: string }
  | { kind: 'UNKNOWN'; date: string; role: string }
  | ({ kind: 'END'; date: string; contract: ContractRef; fees: string } & PmccEndCash)

/** Each way a short call ends, with a gross total that is null exactly when its price is. */
type WithTotal<End> = End extends PmccShortEnd ? End & { total: End['pricePerShare'] } : never

/** An end row's cash: a close's buyback price and gross total; none for an expiry or assignment. */
export type PmccEndCash = WithTotal<PmccShortEnd>

/**
 * A short call whose coverage ran, or will run, past the LEAPS held now: the days from the
 * LEAPS expiration to its end (or, none recorded, its expiration) — the stretch it was uncovered.
 */
export type PmccCycleFlag = { daysPastLeaps: number; leapsExpiration: string }

export type PmccCycleCommon = {
  number: number
  openedOn: string
  opening: Fill
  current: ContractRef
  dteAtOpen: number
  rollCount: number
  /** Signed: a credit is positive. */
  netPerShare: string
  netTotal: string
  basisAfter: string
  flag: PmccCycleFlag | null
  rows: PmccCycleRow[]
}

/**
 * How a cycle stands at the window end. With no terminal event recorded, it is `OPEN` until its
 * short's expiration and `UNRECORDED` after it: expired, assigned or bought back, the journal
 * cannot know which, so it has neither DTE left nor an outcome.
 */
export type PmccCycleStatus =
  | { status: 'OPEN'; daysSoFar: number; dteRemaining: number }
  | { status: 'UNRECORDED'; expiredOn: string; daysHeld: number }
  | { status: 'ENDED'; outcome: PmccShortOutcome; endedOn: string; daysHeld: number }

export type PmccCycle = PmccCycleCommon & PmccCycleStatus

export type PmccLeapsTrack = {
  current: ContractRef
  costPerShare: string
  rows: PmccLeapsRow[]
}

type GapSpan = { from: string; to: string; days: number }

/**
 * A stretch of the window, `from` (inclusive) to `to` (exclusive), with no short call covering
 * the LEAPS. Its neighbours are the cycle whose coverage it follows and the cycle sold at its
 * end: a leading gap has only the latter, a trailing gap only the former, and the whole window
 * is one gap with neither when no cycle was ever sold.
 */
export type PmccGap =
  | (GapSpan & { kind: 'LEADING'; beforeCycle: number })
  | (GapSpan & { kind: 'BETWEEN'; afterCycle: number; beforeCycle: number })
  | (GapSpan & { kind: 'TRAILING'; afterCycle: number })
  | (GapSpan & { kind: 'WHOLE_WINDOW' })

export type PmccTimelineSummary = {
  cycleCount: number
  closedCount: number
  /**
   * The cycles not yet ended (open, or past expiration with no outcome recorded) and the signed
   * sum of their nets; null when there is none.
   */
  open: { count: number; creditPerShare: string } | null
  /** Signed sums of the ended cycles' nets. */
  realizedPerShare: string
  realizedTotal: string
  /** Realized ÷ closed cycles, per share and in dollars; null when none has ended. */
  average: { perShare: string; total: string } | null
  /** Signed sum of the LEAPS roll nets (a credit is positive); null when there is no roll. */
  leapsRollNetPerShare: string | null
  /**
   * Signed sum (a credit is positive) of the short rolls and ends no cycle took — only an open
   * cycle takes one, so these are duplicates for a contract only an ended cycle holds, or ones
   * folded while no cycle held their contract and none was open — each listed on the LEAPS
   * track as an `UNKNOWN` row; null when there is none. With it, realized + open +
   * unattributed = the ledger's short credits (exact in dollars; each per-share figure rounds on
   * its own).
   */
  unattributedShortPerShare: string | null
  totalDays: number
  uncoveredDays: number
  coveredDays: number
  shortCreditsPerShare: string
  leapsCostPerShare: string
  basisPerShare: string
}

export type PmccTimeline = {
  start: string
  windowEnd: string
  valuationDate: string
  closedDate: string | null
  leapsTrack: PmccLeapsTrack
  cycles: PmccCycle[]
  gaps: PmccGap[]
  summary: PmccTimelineSummary
}
