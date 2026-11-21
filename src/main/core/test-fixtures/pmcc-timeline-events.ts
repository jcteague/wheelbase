// [US-109] The story's XYZ Background (plans/us-109/data-model.md § 5) as literal timeline
// events, plus builders for the variants the engine tests need. Each contribution is the one
// the US-103 ledger assigns: `+` debit, `−` credit per share, fees in dollars.
import type { PmccContribution, PmccLedgerSide } from '../costbasis'
import type { Fill, PmccTimelineEvent, PmccTimelineInput } from '../pmcc-timeline'

const NO_FEES = '0.0000'

const fill = (strike: string, expiration: string, pricePerShare: string): Fill => ({
  strike,
  expiration,
  pricePerShare
})

const contribution = (
  side: PmccLedgerSide,
  cashPerShare: string,
  contracts: number,
  fees: string
): PmccContribution => ({ side, cashPerShare, contracts, fees })

/** A short call's end that moves no cash: an expiration or an assignment. */
const noCashEnd = (contracts: number): PmccContribution =>
  contribution('SHORT', '0.0000', contracts, NO_FEES)

/** The XYZ $80 · 2027-09-17 LEAPS bought 2026-09-14 at $25.00: always the first event. */
const xyzLeapsOpen = (contracts: number, fees: string): PmccTimelineEvent => ({
  kind: 'LEAPS_OPEN',
  seq: 0,
  date: '2026-09-14',
  contracts,
  contract: fill('80.0000', '2027-09-17', '25.0000'),
  contribution: contribution('LONG', '25.0000', contracts, fees)
})

export interface XyzOptions {
  /** Contracts on every leg (the LEAPS and every short). */
  contracts?: number
  /** Fees in dollars on the LEAPS purchase. */
  leapsFees?: string
  /** Fees in dollars on cycle 1's sell to open. */
  cycle1Fees?: string
  /** The day the replacement LEAPS was bought; the old one was sold 2027-07-09. */
  leapsRollOpenedOn?: string
  /** Ends cycle 9 by assignment on this day; open otherwise. */
  cycle9AssignedOn?: string
  valuationDate?: string
  closedDate?: string | null
}

/** One open-and-expire cycle: sold at `price`, expired worthless on its expiration. */
const expiredCycle = (
  seq: number,
  opened: string,
  strike: string,
  expiration: string,
  price: string,
  contracts: number
): PmccTimelineEvent[] => [
  {
    kind: 'SHORT_OPEN',
    seq,
    date: opened,
    contracts,
    contract: fill(strike, expiration, price),
    contribution: contribution('SHORT', `-${price}`, contracts, NO_FEES)
  },
  {
    kind: 'SHORT_END',
    seq: seq + 1,
    date: expiration,
    contracts,
    outcome: 'EXPIRED',
    contract: { strike, expiration },
    pricePerShare: null,
    contribution: noCashEnd(contracts)
  }
]

/**
 * The Background in ledger order (`seq`). XYZ: $80 · 2027-09-17 LEAPS bought 2026-09-14 at
 * $25.00, nine short-call cycles, one short roll (cycle 2) and one LEAPS roll (2027-07-09).
 * Valuation date 2027-08-13; cycle 9 open.
 */
export function xyzBackground(options: XyzOptions = {}): PmccTimelineInput {
  const {
    contracts = 1,
    leapsFees = NO_FEES,
    cycle1Fees = NO_FEES,
    leapsRollOpenedOn = '2027-07-09',
    cycle9AssignedOn,
    valuationDate = '2027-08-13',
    closedDate = null
  } = options
  const leapsRollClosedOn = '2027-07-09'

  const cycle9End: PmccTimelineEvent[] =
    cycle9AssignedOn === undefined
      ? []
      : [
          {
            kind: 'SHORT_END',
            seq: 20,
            date: cycle9AssignedOn,
            contracts,
            outcome: 'ASSIGNED',
            contract: { strike: '118.0000', expiration: '2027-08-20' },
            pricePerShare: null,
            contribution: noCashEnd(contracts)
          }
        ]

  const events: PmccTimelineEvent[] = [
    xyzLeapsOpen(contracts, leapsFees),
    {
      kind: 'SHORT_OPEN',
      seq: 1,
      date: '2026-09-14',
      contracts,
      contract: fill('110.0000', '2026-10-16', '2.0000'),
      contribution: contribution('SHORT', '-2.0000', contracts, cycle1Fees)
    },
    {
      kind: 'SHORT_END',
      seq: 2,
      date: '2026-10-16',
      contracts,
      outcome: 'EXPIRED',
      contract: { strike: '110.0000', expiration: '2026-10-16' },
      pricePerShare: null,
      contribution: noCashEnd(contracts)
    },
    {
      kind: 'SHORT_OPEN',
      seq: 3,
      date: '2026-10-23',
      contracts,
      contract: fill('108.0000', '2026-11-20', '1.8000'),
      contribution: contribution('SHORT', '-1.8000', contracts, NO_FEES)
    },
    {
      // Buy the $108 back at 3.00, sell the $112 · 2026-12-18 at 2.40: a 0.60 debit.
      kind: 'SHORT_ROLL',
      seq: 4,
      date: '2026-11-06',
      contracts,
      from: fill('108.0000', '2026-11-20', '3.0000'),
      to: fill('112.0000', '2026-12-18', '2.4000'),
      contribution: contribution('SHORT', '0.6000', contracts, NO_FEES)
    },
    {
      kind: 'SHORT_END',
      seq: 5,
      date: '2026-12-18',
      contracts,
      outcome: 'EXPIRED',
      contract: { strike: '112.0000', expiration: '2026-12-18' },
      pricePerShare: null,
      contribution: noCashEnd(contracts)
    },
    ...expiredCycle(6, '2027-01-04', '112.0000', '2027-02-05', '1.7000', contracts),
    ...expiredCycle(8, '2027-02-08', '114.0000', '2027-03-12', '1.5500', contracts),
    {
      kind: 'SHORT_OPEN',
      seq: 10,
      date: '2027-03-15',
      contracts,
      contract: fill('114.0000', '2027-04-16', '2.2000'),
      contribution: contribution('SHORT', '-2.2000', contracts, NO_FEES)
    },
    {
      kind: 'SHORT_END',
      seq: 11,
      date: '2027-04-02',
      contracts,
      outcome: 'CLOSED',
      contract: { strike: '114.0000', expiration: '2027-04-16' },
      pricePerShare: '0.5500',
      contribution: contribution('SHORT', '0.5500', contracts, NO_FEES)
    },
    {
      kind: 'SHORT_OPEN',
      seq: 12,
      date: '2027-04-05',
      contracts,
      contract: fill('116.0000', '2027-05-07', '1.7500'),
      contribution: contribution('SHORT', '-1.7500', contracts, NO_FEES)
    },
    // 2027-05-07: cycle 7 was recorded before cycle 6's expiration (lower seq), so only the
    // event rank puts cycle 6's end first.
    {
      kind: 'SHORT_OPEN',
      seq: 13,
      date: '2027-05-07',
      contracts,
      contract: fill('116.0000', '2027-06-18', '1.7500'),
      contribution: contribution('SHORT', '-1.7500', contracts, NO_FEES)
    },
    {
      kind: 'SHORT_END',
      seq: 14,
      date: '2027-05-07',
      contracts,
      outcome: 'EXPIRED',
      contract: { strike: '116.0000', expiration: '2027-05-07' },
      pricePerShare: null,
      contribution: noCashEnd(contracts)
    },
    {
      kind: 'SHORT_END',
      seq: 15,
      date: '2027-06-18',
      contracts,
      outcome: 'EXPIRED',
      contract: { strike: '116.0000', expiration: '2027-06-18' },
      pricePerShare: null,
      contribution: noCashEnd(contracts)
    },
    {
      kind: 'SHORT_OPEN',
      seq: 16,
      date: '2027-06-22',
      contracts,
      contract: fill('112.0000', '2027-07-16', '2.4000'),
      contribution: contribution('SHORT', '-2.4000', contracts, NO_FEES)
    },
    {
      // Sell the $80 at 26.00, buy the $85 · 2028-01-21 at 23.50: a 2.50 credit.
      kind: 'LEAPS_ROLL',
      seq: 17,
      contracts,
      from: fill('80.0000', '2027-09-17', '26.0000'),
      to: fill('85.0000', '2028-01-21', '23.5000'),
      closedOn: leapsRollClosedOn,
      openedOn: leapsRollOpenedOn,
      contribution: contribution('LONG', '-2.5000', contracts, NO_FEES)
    },
    {
      kind: 'SHORT_END',
      seq: 18,
      date: '2027-07-16',
      contracts,
      outcome: 'EXPIRED',
      contract: { strike: '112.0000', expiration: '2027-07-16' },
      pricePerShare: null,
      contribution: noCashEnd(contracts)
    },
    {
      kind: 'SHORT_OPEN',
      seq: 19,
      date: '2027-07-23',
      contracts,
      contract: fill('118.0000', '2027-08-20', '1.9500'),
      contribution: contribution('SHORT', '-1.9500', contracts, NO_FEES)
    },
    ...cycle9End
  ]

  return { events, valuationDate, closedDate }
}

/** Records cycle 9's $118 · 2027-08-20 short as expired worthless on its expiration. */
export const cycle9ExpiredEvent = (seq: number): PmccTimelineEvent => ({
  kind: 'SHORT_END',
  seq,
  date: '2027-08-20',
  contracts: 1,
  outcome: 'EXPIRED',
  contract: { strike: '118.0000', expiration: '2027-08-20' },
  pricePerShare: null,
  contribution: noCashEnd(1)
})

/** The input with the event recorded at `seq` moved to `date`. */
export const withEventDate = (
  input: PmccTimelineInput,
  seq: number,
  date: string
): PmccTimelineInput => ({
  ...input,
  events: input.events.map((event) => (event.seq === seq ? { ...event, date } : event))
})

/** The input with `extra` events appended to the end of the events array. */
export const withEvents = (
  input: PmccTimelineInput,
  ...extra: PmccTimelineEvent[]
): PmccTimelineInput => ({ ...input, events: [...input.events, ...extra] })

/** A leg whose role the timeline does not know: no contribution. */
export const unknownEvent = (seq: number, date: string, role: string): PmccTimelineEvent => ({
  kind: 'UNKNOWN',
  seq,
  date,
  contracts: 1,
  role
})

/**
 * A second LEAPS roll on 2027-08-06: sell the $85 · 2028-01-21 at 24.00, buy the
 * $90 · 2028-06-16 at `buyPrice` (22.00 by default — a 2.00 credit; `cashPerShare` is
 * `buyPrice − 24.00`).
 */
export const secondLeapsRollEvent = (
  seq: number,
  { buyPrice = '22.0000', cashPerShare = '-2.0000' } = {}
): PmccTimelineEvent => ({
  kind: 'LEAPS_ROLL',
  seq,
  contracts: 1,
  from: fill('85.0000', '2028-01-21', '24.0000'),
  to: fill('90.0000', '2028-06-16', buyPrice),
  closedOn: '2027-08-06',
  openedOn: '2027-08-06',
  contribution: contribution('LONG', cashPerShare, 1, NO_FEES)
})

/** A $95 · 2028-06-16 LEAPS bought 2027-06-01 at $19.80 and no short call ever sold. */
export function leapsOnlyInput(valuationDate = '2027-08-13'): PmccTimelineInput {
  return {
    valuationDate,
    closedDate: null,
    events: [
      {
        kind: 'LEAPS_OPEN',
        seq: 0,
        date: '2027-06-01',
        contracts: 1,
        contract: fill('95.0000', '2028-06-16', '19.8000'),
        contribution: contribution('LONG', '19.8000', 1, NO_FEES)
      }
    ]
  }
}

/**
 * A $90 · 2027-09-17 LEAPS bought 2026-09-14 at $20.00 and one $120 short sold 2027-07-06 at
 * $1.50, expiring `shortExpiration`. Valuation date 2027-08-13; the short is open.
 */
export function outlastingShortInput(shortExpiration: string): PmccTimelineInput {
  return {
    valuationDate: '2027-08-13',
    closedDate: null,
    events: [
      {
        kind: 'LEAPS_OPEN',
        seq: 0,
        date: '2026-09-14',
        contracts: 1,
        contract: fill('90.0000', '2027-09-17', '20.0000'),
        contribution: contribution('LONG', '20.0000', 1, NO_FEES)
      },
      {
        kind: 'SHORT_OPEN',
        seq: 1,
        date: '2027-07-06',
        contracts: 1,
        contract: fill('120.0000', shortExpiration, '1.5000'),
        contribution: contribution('SHORT', '-1.5000', 1, NO_FEES)
      }
    ]
  }
}

/** Sells the $85 · 2028-01-21 LEAPS to close at `price` per share. */
export const leapsCloseEvent = (seq: number, date: string, price: string): PmccTimelineEvent => ({
  kind: 'LEAPS_CLOSE',
  seq,
  date,
  contracts: 1,
  contract: fill('85.0000', '2028-01-21', price),
  contribution: contribution('LONG', `-${price}`, 1, NO_FEES)
})

/** One LEAPS and one $108 short sold 2026-10-23 at 1.00, bought back 2026-11-06 at 1.50. */
export function lossCycleInput(): PmccTimelineInput {
  return {
    valuationDate: '2026-11-13',
    closedDate: null,
    events: [
      xyzLeapsOpen(1, NO_FEES),
      {
        kind: 'SHORT_OPEN',
        seq: 1,
        date: '2026-10-23',
        contracts: 1,
        contract: fill('108.0000', '2026-11-20', '1.0000'),
        contribution: contribution('SHORT', '-1.0000', 1, NO_FEES)
      },
      {
        kind: 'SHORT_END',
        seq: 2,
        date: '2026-11-06',
        contracts: 1,
        outcome: 'CLOSED',
        contract: { strike: '108.0000', expiration: '2026-11-20' },
        pricePerShare: '1.5000',
        contribution: contribution('SHORT', '1.5000', 1, NO_FEES)
      }
    ]
  }
}

export interface ShortRollOptions {
  /** Price paid to buy the $108 · 2026-11-20 back. */
  buyBack: string
  /** Price the $112 · 2026-12-18 replacement sold for. */
  sellNew: string
  /** The ledger's per-share cash for the roll: `buyBack − sellNew`. */
  cashPerShare: string
  fees?: string
}

/** One LEAPS and one $108 short sold 2026-10-23 at 1.80, rolled on 2026-11-06. */
export function shortRollInput({
  buyBack,
  sellNew,
  cashPerShare,
  fees = NO_FEES
}: ShortRollOptions): PmccTimelineInput {
  return {
    valuationDate: '2026-11-13',
    closedDate: null,
    events: [
      xyzLeapsOpen(1, NO_FEES),
      {
        kind: 'SHORT_OPEN',
        seq: 1,
        date: '2026-10-23',
        contracts: 1,
        contract: fill('108.0000', '2026-11-20', '1.8000'),
        contribution: contribution('SHORT', '-1.8000', 1, NO_FEES)
      },
      {
        kind: 'SHORT_ROLL',
        seq: 2,
        date: '2026-11-06',
        contracts: 1,
        from: fill('108.0000', '2026-11-20', buyBack),
        to: fill('112.0000', '2026-12-18', sellNew),
        contribution: contribution('SHORT', cashPerShare, 1, fees)
      }
    ]
  }
}

/**
 * A short roll no short call was sold for: buys a $120 · 2027-07-16 back at 1.50 and sells a
 * $125 · 2027-08-20 at 2.50 on `date` — a 1.00 credit.
 */
export const strayShortRollEvent = (seq: number, date: string): PmccTimelineEvent => ({
  kind: 'SHORT_ROLL',
  seq,
  date,
  contracts: 1,
  from: fill('120.0000', '2027-07-16', '1.5000'),
  to: fill('125.0000', '2027-08-20', '2.5000'),
  contribution: contribution('SHORT', '-1.0000', 1, NO_FEES)
})

/** A buyback no short call was sold for: the $120 · 2027-07-16 bought to close at `price`. */
export const strayShortCloseEvent = (
  seq: number,
  date: string,
  price: string,
  fees = NO_FEES
): PmccTimelineEvent => ({
  kind: 'SHORT_END',
  seq,
  date,
  contracts: 1,
  outcome: 'CLOSED',
  contract: { strike: '120.0000', expiration: '2027-07-16' },
  pricePerShare: price,
  contribution: contribution('SHORT', price, 1, fees)
})

/**
 * One LEAPS (the XYZ $80, bought 2026-09-14) and one $112 · 2027-02-05 short sold 2027-01-04 at
 * 1.70 that expired 2027-02-05. Valuation date 2027-03-15; no cycle is open.
 */
export function endedCycleInput(): PmccTimelineInput {
  return {
    valuationDate: '2027-03-15',
    closedDate: null,
    events: [
      xyzLeapsOpen(1, NO_FEES),
      ...expiredCycle(1, '2027-01-04', '112.0000', '2027-02-05', '1.7000', 1)
    ]
  }
}

/** Sells a `strike` · `expiration` short call to open at `price` on `date`. */
export const shortSaleEvent = (
  seq: number,
  date: string,
  { strike, expiration, price }: { strike: string; expiration: string; price: string }
): PmccTimelineEvent => ({
  kind: 'SHORT_OPEN',
  seq,
  date,
  contracts: 1,
  contract: fill(strike, expiration, price),
  contribution: contribution('SHORT', `-${price}`, 1, NO_FEES)
})

/** Records the `strike` · `expiration` short call as expired worthless on its expiration. */
export const shortExpiredEvent = (
  seq: number,
  strike: string,
  expiration: string
): PmccTimelineEvent => ({
  kind: 'SHORT_END',
  seq,
  date: expiration,
  contracts: 1,
  outcome: 'EXPIRED',
  contract: { strike, expiration },
  pricePerShare: null,
  contribution: noCashEnd(1)
})

/**
 * Two short calls on the XYZ $80 LEAPS (bought 2026-09-14) that overlap: cycle 1, a
 * $120 · 2027-03-19 sold 2027-01-04 at 3.00 and still open; cycle 2, a $115 · 2027-01-29 sold
 * 2027-01-10 at 1.00 that expired 2027-01-29. Valuation date 2027-02-10.
 */
export function overlappingCyclesInput(): PmccTimelineInput {
  return {
    valuationDate: '2027-02-10',
    closedDate: null,
    events: [
      xyzLeapsOpen(1, NO_FEES),
      shortSaleEvent(1, '2027-01-04', {
        strike: '120.0000',
        expiration: '2027-03-19',
        price: '3.0000'
      }),
      shortSaleEvent(2, '2027-01-10', {
        strike: '115.0000',
        expiration: '2027-01-29',
        price: '1.0000'
      }),
      shortExpiredEvent(3, '115.0000', '2027-01-29')
    ]
  }
}

/** Sells a $118 · 2027-07-16 short call to open at 1.20 on `date`. */
export const shortOpenEvent = (seq: number, date: string): PmccTimelineEvent => ({
  kind: 'SHORT_OPEN',
  seq,
  date,
  contracts: 1,
  contract: fill('118.0000', '2027-07-16', '1.2000'),
  contribution: contribution('SHORT', '-1.2000', 1, NO_FEES)
})
