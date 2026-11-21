// [US-109] The story's XYZ Background (plans/us-109/data-model.md § 5) as the literal
// `PmccTimeline` the engine returns for it at 2027-08-13: 1 contract, no fees. Variants are
// small patches over this literal.
import type { Fill, PmccCycle, PmccGap, PmccTimeline } from '../../../../main/core/pmcc-timeline'

const NO_FEES = '0.0000'

const fill = (strike: string, expiration: string, pricePerShare: string): Fill => ({
  strike,
  expiration,
  pricePerShare
})

type EndedCycleTerms = {
  number: number
  openedOn: string
  opening: Fill
  total: string
  dteAtOpen: number
  endedOn: string
  daysHeld: number
  netPerShare: string
  netTotal: string
  basisAfter: string
}

/** A cycle sold once and left to expire worthless on its expiration. */
const expiredCycle = (terms: EndedCycleTerms): PmccCycle => ({
  number: terms.number,
  openedOn: terms.openedOn,
  opening: terms.opening,
  current: { strike: terms.opening.strike, expiration: terms.opening.expiration },
  dteAtOpen: terms.dteAtOpen,
  rollCount: 0,
  netPerShare: terms.netPerShare,
  netTotal: terms.netTotal,
  basisAfter: terms.basisAfter,
  flag: null,
  rows: [
    {
      kind: 'OPEN',
      date: terms.openedOn,
      contract: terms.opening,
      total: terms.total,
      fees: NO_FEES
    },
    {
      kind: 'END',
      date: terms.endedOn,
      outcome: 'EXPIRED',
      contract: { strike: terms.opening.strike, expiration: terms.opening.expiration },
      pricePerShare: null,
      total: null,
      fees: NO_FEES
    }
  ],
  status: 'ENDED',
  outcome: 'EXPIRED',
  endedOn: terms.endedOn,
  daysHeld: terms.daysHeld
})

const CYCLE_1 = expiredCycle({
  number: 1,
  openedOn: '2026-09-14',
  opening: fill('110.0000', '2026-10-16', '2.0000'),
  total: '200.0000',
  dteAtOpen: 32,
  endedOn: '2026-10-16',
  daysHeld: 32,
  netPerShare: '2.0000',
  netTotal: '200.0000',
  basisAfter: '23.0000'
})

/** Sold $108 at $1.80, rolled up and out to $112 for a $0.60 debit, then expired. */
const CYCLE_2: PmccCycle = {
  number: 2,
  openedOn: '2026-10-23',
  opening: fill('108.0000', '2026-11-20', '1.8000'),
  current: { strike: '112.0000', expiration: '2026-12-18' },
  dteAtOpen: 28,
  rollCount: 1,
  netPerShare: '1.2000',
  netTotal: '120.0000',
  basisAfter: '21.8000',
  flag: null,
  rows: [
    {
      kind: 'OPEN',
      date: '2026-10-23',
      contract: fill('108.0000', '2026-11-20', '1.8000'),
      total: '180.0000',
      fees: NO_FEES
    },
    {
      kind: 'ROLL',
      number: 1,
      date: '2026-11-06',
      from: fill('108.0000', '2026-11-20', '3.0000'),
      to: fill('112.0000', '2026-12-18', '2.4000'),
      net: { direction: 'debit', perShare: '0.6000', total: '60.0000' },
      fees: NO_FEES
    },
    {
      kind: 'END',
      date: '2026-12-18',
      outcome: 'EXPIRED',
      contract: { strike: '112.0000', expiration: '2026-12-18' },
      pricePerShare: null,
      total: null,
      fees: NO_FEES
    }
  ],
  status: 'ENDED',
  outcome: 'EXPIRED',
  endedOn: '2026-12-18',
  daysHeld: 56
}

const CYCLE_3 = expiredCycle({
  number: 3,
  openedOn: '2027-01-04',
  opening: fill('112.0000', '2027-02-05', '1.7000'),
  total: '170.0000',
  dteAtOpen: 32,
  endedOn: '2027-02-05',
  daysHeld: 32,
  netPerShare: '1.7000',
  netTotal: '170.0000',
  basisAfter: '20.1000'
})

const CYCLE_4 = expiredCycle({
  number: 4,
  openedOn: '2027-02-08',
  opening: fill('114.0000', '2027-03-12', '1.5500'),
  total: '155.0000',
  dteAtOpen: 32,
  endedOn: '2027-03-12',
  daysHeld: 32,
  netPerShare: '1.5500',
  netTotal: '155.0000',
  basisAfter: '18.5500'
})

/** Sold $114 at $2.20 and bought back early at $0.55. */
const CYCLE_5: PmccCycle = {
  number: 5,
  openedOn: '2027-03-15',
  opening: fill('114.0000', '2027-04-16', '2.2000'),
  current: { strike: '114.0000', expiration: '2027-04-16' },
  dteAtOpen: 32,
  rollCount: 0,
  netPerShare: '1.6500',
  netTotal: '165.0000',
  basisAfter: '16.9000',
  flag: null,
  rows: [
    {
      kind: 'OPEN',
      date: '2027-03-15',
      contract: fill('114.0000', '2027-04-16', '2.2000'),
      total: '220.0000',
      fees: NO_FEES
    },
    {
      kind: 'END',
      date: '2027-04-02',
      outcome: 'CLOSED',
      contract: { strike: '114.0000', expiration: '2027-04-16' },
      pricePerShare: '0.5500',
      total: '55.0000',
      fees: NO_FEES
    }
  ],
  status: 'ENDED',
  outcome: 'CLOSED',
  endedOn: '2027-04-02',
  daysHeld: 18
}

const CYCLE_6 = expiredCycle({
  number: 6,
  openedOn: '2027-04-05',
  opening: fill('116.0000', '2027-05-07', '1.7500'),
  total: '175.0000',
  dteAtOpen: 32,
  endedOn: '2027-05-07',
  daysHeld: 32,
  netPerShare: '1.7500',
  netTotal: '175.0000',
  basisAfter: '15.1500'
})

const CYCLE_7 = expiredCycle({
  number: 7,
  openedOn: '2027-05-07',
  opening: fill('116.0000', '2027-06-18', '1.7500'),
  total: '175.0000',
  dteAtOpen: 42,
  endedOn: '2027-06-18',
  daysHeld: 42,
  netPerShare: '1.7500',
  netTotal: '175.0000',
  basisAfter: '13.4000'
})

/** Expired after the LEAPS roll, so its basis already carries the roll's credit. */
const CYCLE_8 = expiredCycle({
  number: 8,
  openedOn: '2027-06-22',
  opening: fill('112.0000', '2027-07-16', '2.4000'),
  total: '240.0000',
  dteAtOpen: 24,
  endedOn: '2027-07-16',
  daysHeld: 24,
  netPerShare: '2.4000',
  netTotal: '240.0000',
  basisAfter: '8.5000'
})

const CYCLE_9_OPENING = fill('118.0000', '2027-08-20', '1.9500')

/** Open on 2027-08-13: sold 21 days ago, 7 DTE left. */
const CYCLE_9: PmccCycle = {
  number: 9,
  openedOn: '2027-07-23',
  opening: CYCLE_9_OPENING,
  current: { strike: '118.0000', expiration: '2027-08-20' },
  dteAtOpen: 28,
  rollCount: 0,
  netPerShare: '1.9500',
  netTotal: '195.0000',
  basisAfter: '6.5500',
  flag: null,
  rows: [
    {
      kind: 'OPEN',
      date: '2027-07-23',
      contract: CYCLE_9_OPENING,
      total: '195.0000',
      fees: NO_FEES
    }
  ],
  status: 'OPEN',
  daysSoFar: 21,
  dteRemaining: 7
}

/**
 * Cycle 9 assigned on its expiration, 2027-08-20: an ended cycle, so it has `daysHeld` and no
 * `daysSoFar` / `dteRemaining`. An assignment moves no cash, so its net and footer are unchanged.
 */
export const XYZ_CYCLE_9_ASSIGNED: PmccCycle = {
  number: 9,
  openedOn: '2027-07-23',
  opening: CYCLE_9_OPENING,
  current: { strike: '118.0000', expiration: '2027-08-20' },
  dteAtOpen: 28,
  rollCount: 0,
  netPerShare: '1.9500',
  netTotal: '195.0000',
  basisAfter: '6.5500',
  flag: null,
  rows: [
    ...CYCLE_9.rows,
    {
      kind: 'END',
      date: '2027-08-20',
      outcome: 'ASSIGNED',
      contract: { strike: '118.0000', expiration: '2027-08-20' },
      pricePerShare: null,
      total: null,
      fees: NO_FEES
    }
  ],
  status: 'ENDED',
  outcome: 'ASSIGNED',
  endedOn: '2027-08-20',
  daysHeld: 28
}

/**
 * Cycle 9 valued 2027-08-24 with no expiration, assignment or buyback recorded: past its
 * 2027-08-20 expiration, so it has `expiredOn` and `daysHeld` (sold 2027-07-23, 28 days) and no
 * `dteRemaining` or outcome. Nothing moved cash, so its net, rows and footer are unchanged.
 */
export const XYZ_CYCLE_9_UNRECORDED: PmccCycle = {
  number: 9,
  openedOn: '2027-07-23',
  opening: CYCLE_9_OPENING,
  current: { strike: '118.0000', expiration: '2027-08-20' },
  dteAtOpen: 28,
  rollCount: 0,
  netPerShare: '1.9500',
  netTotal: '195.0000',
  basisAfter: '6.5500',
  flag: null,
  rows: CYCLE_9.rows,
  status: 'UNRECORDED',
  expiredOn: '2027-08-20',
  daysHeld: 28
}

const gap = (afterCycle: number, from: string, to: string, days: number): PmccGap => ({
  kind: 'BETWEEN',
  afterCycle,
  beforeCycle: afterCycle + 1,
  from,
  to,
  days
})

export const XYZ_TIMELINE: PmccTimeline = {
  start: '2026-09-14',
  windowEnd: '2027-08-13',
  valuationDate: '2027-08-13',
  closedDate: null,
  leapsTrack: {
    current: { strike: '85.0000', expiration: '2028-01-21' },
    costPerShare: '22.5000',
    rows: [
      {
        kind: 'PURCHASE',
        date: '2026-09-14',
        contract: fill('80.0000', '2027-09-17', '25.0000'),
        total: '2500.0000',
        dteAtFill: 368,
        basisAfter: '25.0000',
        fees: NO_FEES
      },
      {
        kind: 'ROLL',
        number: 1,
        date: '2027-07-09',
        from: fill('80.0000', '2027-09-17', '26.0000'),
        to: fill('85.0000', '2028-01-21', '23.5000'),
        net: { direction: 'credit', perShare: '2.5000', total: '250.0000' },
        coverage: { unbroken: true, extensionDays: 126 },
        basisAfter: '8.5000',
        fees: NO_FEES
      }
    ]
  },
  cycles: [CYCLE_1, CYCLE_2, CYCLE_3, CYCLE_4, CYCLE_5, CYCLE_6, CYCLE_7, CYCLE_8, CYCLE_9],
  // Cycles 6 and 7 are back to back (2027-05-07): no gap between them.
  gaps: [
    gap(1, '2026-10-16', '2026-10-23', 7),
    gap(2, '2026-12-18', '2027-01-04', 17),
    gap(3, '2027-02-05', '2027-02-08', 3),
    gap(4, '2027-03-12', '2027-03-15', 3),
    gap(5, '2027-04-02', '2027-04-05', 3),
    gap(7, '2027-06-18', '2027-06-22', 4),
    gap(8, '2027-07-16', '2027-07-23', 7)
  ],
  summary: {
    cycleCount: 9,
    closedCount: 8,
    open: { count: 1, creditPerShare: '1.9500' },
    realizedPerShare: '14.0000',
    realizedTotal: '1400.0000',
    average: { perShare: '1.7500', total: '175.0000' },
    leapsRollNetPerShare: '2.5000',
    unattributedShortPerShare: null,
    totalDays: 333,
    uncoveredDays: 44,
    coveredDays: 289,
    shortCreditsPerShare: '15.9500',
    leapsCostPerShare: '22.5000',
    basisPerShare: '6.5500'
  }
}

/** The Background's cycle `number` (1-based). */
export function xyzCycle(number: number): PmccCycle {
  const cycle = XYZ_TIMELINE.cycles[number - 1]
  if (cycle === undefined) throw new Error(`no XYZ cycle ${number}`)
  return cycle
}

/** The $95 · 2028-06-16 LEAPS bought 2027-06-01 at $19.80, no short call ever sold. */
export const LEAPS_ONLY_TIMELINE: PmccTimeline = {
  start: '2027-06-01',
  windowEnd: '2027-08-13',
  valuationDate: '2027-08-13',
  closedDate: null,
  leapsTrack: {
    current: { strike: '95.0000', expiration: '2028-06-16' },
    costPerShare: '19.8000',
    rows: [
      {
        kind: 'PURCHASE',
        date: '2027-06-01',
        contract: fill('95.0000', '2028-06-16', '19.8000'),
        total: '1980.0000',
        dteAtFill: 381,
        basisAfter: '19.8000',
        fees: NO_FEES
      }
    ]
  },
  cycles: [],
  gaps: [{ kind: 'WHOLE_WINDOW', from: '2027-06-01', to: '2027-08-13', days: 73 }],
  summary: {
    cycleCount: 0,
    closedCount: 0,
    open: null,
    realizedPerShare: '0.0000',
    realizedTotal: '0.0000',
    average: null,
    leapsRollNetPerShare: null,
    unattributedShortPerShare: null,
    totalDays: 73,
    uncoveredDays: 73,
    coveredDays: 0,
    shortCreditsPerShare: '0.0000',
    leapsCostPerShare: '19.8000',
    basisPerShare: '19.8000'
  }
}

/**
 * The Background closed 2027-08-20 with cycle 9 assigned, valued 2027-09-02: what the engine
 * returns for `xyzBackground({ cycle9AssignedOn: '2027-08-20', valuationDate: '2027-09-02',
 * closedDate: '2027-08-20' })`. That history records no LEAPS sale, so the LEAPS track and the
 * ledger figures are the Background's. All nine cycles have ended: realized is every cycle's
 * net ($15.95 / share, $1,595.00), the average is ÷ 9 ($1.7722, $177.2222), nothing is open, and
 * the window stops at the close date (340 days, no trailing gap).
 */
export const XYZ_CLOSED_TIMELINE: PmccTimeline = {
  ...XYZ_TIMELINE,
  windowEnd: '2027-08-20',
  valuationDate: '2027-09-02',
  closedDate: '2027-08-20',
  cycles: [...XYZ_TIMELINE.cycles.slice(0, 8), XYZ_CYCLE_9_ASSIGNED],
  summary: {
    cycleCount: 9,
    closedCount: 9,
    open: null,
    realizedPerShare: '15.9500',
    realizedTotal: '1595.0000',
    average: { perShare: '1.7722', total: '177.2222' },
    leapsRollNetPerShare: '2.5000',
    unattributedShortPerShare: null,
    totalDays: 340,
    uncoveredDays: 44,
    coveredDays: 296,
    shortCreditsPerShare: '15.9500',
    leapsCostPerShare: '22.5000',
    basisPerShare: '6.5500'
  }
}

/**
 * The Background valued 2027-08-24 with cycle 9's outcome never recorded: what the engine
 * returns for `xyzBackground({ valuationDate: '2027-08-24' })`. Cycle 9's coverage ends at its
 * 2027-08-20 expiration, so a 4-day trailing gap runs to the valuation date (344 days, 48
 * uncovered); it still counts as open, its credit unrealized.
 */
export const XYZ_UNRECORDED_TIMELINE: PmccTimeline = {
  ...XYZ_TIMELINE,
  windowEnd: '2027-08-24',
  valuationDate: '2027-08-24',
  cycles: [...XYZ_TIMELINE.cycles.slice(0, 8), XYZ_CYCLE_9_UNRECORDED],
  gaps: [
    ...XYZ_TIMELINE.gaps,
    { kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-08-24', days: 4 }
  ],
  summary: { ...XYZ_TIMELINE.summary, totalDays: 344, uncoveredDays: 48, coveredDays: 296 }
}
