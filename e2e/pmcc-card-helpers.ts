// [US-108] Helpers for the PMCC position-card e2e spec: launch the US-18 Background with the XYZ
// PMCC's quotes and snapshots, seed its ledger through the API and the `_test:pmcc-record-leg-event`
// seam, and read that ledger back through the API. The card's DOM readers live in
// pmcc-card-readers.ts.
//
// Dates are run-day relative. The PMCC opens 203 days before the run day (the AC's 2026-04-17 →
// 2026-11-06) and every later leg event lands on its own earlier day, so the ledger replays in
// fill-date order without depending on two rows' created-at stamps differing.
import type { Page } from 'playwright'
import { localDate } from './dates'
import { occSymbol, sqlite } from './pmcc-helpers'
import { createXyzPmcc, recordEvents, type PmccLegEvent } from './pmcc-ledger-helpers'
import {
  launchBackground,
  type BackgroundOptions,
  type CardsHarness,
  type OptionQuote
} from './position-card-helpers'

// ── The Background ───────────────────────────────────────────────────────────

/** Days between the PMCC's opening and the run day. */
export const OPENED_DAYS_AGO = 203

/** The XYZ legs as day offsets and strikes: the LEAPS and, if open, the current short call. */
export interface PmccCardLegs {
  leapsDte: number
  leapsStrike: number
  shortDte: number
  shortStrike: number
}

export const BACKGROUND_LEGS: PmccCardLegs = {
  leapsDte: 315,
  leapsStrike: 80,
  shortDte: 14,
  shortStrike: 108
}

export const LEAPS_QUOTE: OptionQuote = ['25.70', '26.50', '26.10']
export const SHORT_QUOTE: OptionQuote = ['0.85', '0.95', '0.90']

/** Greeks with `delta`; the other fields only fill the provider's shape. */
export function greeks(delta: string): Record<string, string> {
  return { delta, gamma: '0.0100', theta: '-0.0200', vega: '0.3000', iv: '0.2500' }
}

export function leapsSymbol(legs: Pick<PmccCardLegs, 'leapsDte' | 'leapsStrike'>): string {
  return occSymbol('XYZ', localDate(legs.leapsDte), 'C', legs.leapsStrike)
}

export function shortSymbol(legs: Pick<PmccCardLegs, 'shortDte' | 'shortStrike'>): string {
  return occSymbol('XYZ', localDate(legs.shortDte), 'C', legs.shortStrike)
}

export interface PmccCardsOptions extends BackgroundOptions {
  /** XYZ's stock price; the Background's is 104.20. */
  price?: string
  legs?: Partial<PmccCardLegs>
  /** The LEAPS quote; `null` returns no snapshot for it. */
  leapsQuote?: OptionQuote | null
  /** The LEAPS delta; `null` returns its snapshot without greeks. */
  leapsDelta?: string | null
  /** The open short call's quote; `null` returns no snapshot for it. */
  shortQuote?: OptionQuote | null
  /** Days from the run day to XYZ's next earnings; `null` (the default) is a calendar with none. */
  earningsInDays?: number | null
}

export type PmccCardsHarness = CardsHarness & { legs: PmccCardLegs }

/**
 * Launches the US-18 Background (MSFT 10 DTE, AAPL 30 DTE, NVDA shares, TSLA closed) plus XYZ's
 * price, its two legs' snapshots and a faked earnings calendar. The PMCC itself is not seeded.
 */
export async function launchPmccCards(
  label: string,
  {
    price = '104.20',
    legs: legOverrides = {},
    leapsQuote = LEAPS_QUOTE,
    leapsDelta = '0.82',
    shortQuote = SHORT_QUOTE,
    earningsInDays = null,
    prices = {},
    extraSnapshots = {},
    snapshotOverrides = {},
    ...background
  }: PmccCardsOptions = {}
): Promise<PmccCardsHarness> {
  const legs = { ...BACKGROUND_LEGS, ...legOverrides }
  const leaps = leapsSymbol(legs)
  const short = shortSymbol(legs)
  const harness = await launchBackground(`us108-${label}`, {
    ...background,
    prices: { XYZ: price, ...prices },
    extraSnapshots: {
      ...(leapsQuote && { [leaps]: leapsQuote }),
      ...(shortQuote && { [short]: shortQuote }),
      ...extraSnapshots
    },
    snapshotOverrides: {
      [leaps]: { greeks: leapsDelta === null ? undefined : greeks(leapsDelta) },
      [short]: { greeks: greeks('0.24') },
      ...snapshotOverrides
    },
    earnings: earningsInDays === null ? {} : { XYZ: { dayOffset: earningsInDays } }
  })
  return { ...harness, legs }
}

// ── Seeding the ledger ───────────────────────────────────────────────────────

/** An XYZ PMCC's history: the LEAPS, the expired short calls (entry first), and the open one. */
interface PmccHistory {
  legs: PmccCardLegs
  /** Contracts on the LEAPS and every expired short. */
  contracts: number
  /** Credit per share of each expired short call, the entry short first. */
  expiredCredits: string[]
  openShort: { fill: string; contracts: number } | null
}

/** Every expired short is a $110 call; it is closed before the card reads it. */
const EXPIRED_STRIKE = '110.0000'

const day = (offset: number): string => localDate(offset - OPENED_DAYS_AGO)

function expireEvent(fillDate: string, contracts: number): PmccLegEvent {
  return {
    triggerEvent: 'PMCC_SHORT_EXPIRED',
    eventDate: fillDate,
    legs: [
      {
        legRole: 'SHORT_CALL_EXPIRED',
        action: 'EXPIRE',
        strike: EXPIRED_STRIKE,
        expiration: localDate(1),
        premiumPerContract: '0.0000',
        fillDate,
        contracts
      }
    ]
  }
}

function sellEvent(
  fillDate: string,
  short: { strike: string; expiration: string; credit: string; contracts: number }
): PmccLegEvent {
  return {
    triggerEvent: 'PMCC_SHORT_OPEN',
    eventDate: fillDate,
    legs: [
      {
        legRole: 'SHORT_CALL_OPEN',
        action: 'SELL',
        strike: short.strike,
        expiration: short.expiration,
        premiumPerContract: short.credit,
        fillDate,
        contracts: short.contracts
      }
    ]
  }
}

/**
 * Opens the PMCC ($80 LEAPS @ 25.00 and the entry short) 203 days ago, then expires each short and
 * sells the next one on later days: cycle `i` expires on day `28(i+1)` and its successor sells the
 * day after. The open short call, if any, sells 7 days before the run day.
 */
async function seedPmcc(page: Page, history: PmccHistory): Promise<string> {
  const { legs, contracts, expiredCredits, openShort } = history
  const [entryCredit, ...laterCredits] = expiredCredits
  const positionId = await createXyzPmcc(page, {
    contracts,
    long: {
      strike: String(legs.leapsStrike),
      expiration: localDate(legs.leapsDte),
      fill: '25.00',
      fillDate: day(0)
    },
    short: { strike: EXPIRED_STRIKE, expiration: localDate(1), fill: entryCredit, fillDate: day(0) }
  })

  const expiredCycle = (credit: string, i: number): PmccLegEvent[] => [
    sellEvent(day(28 * i + 1), {
      strike: EXPIRED_STRIKE,
      expiration: localDate(1),
      credit,
      contracts
    }),
    expireEvent(day(28 * (i + 1)), contracts)
  ]
  const openShortEvents = openShort
    ? [
        sellEvent(localDate(-7), {
          strike: legs.shortStrike.toFixed(4),
          expiration: localDate(legs.shortDte),
          credit: openShort.fill,
          contracts: openShort.contracts
        })
      ]
    : []
  await recordEvents(page, positionId, [
    expireEvent(day(28), contracts),
    ...laterCredits.flatMap((credit, i) => expiredCycle(credit, i + 1)),
    ...openShortEvents
  ])
  return positionId
}

export interface BackgroundPmccOptions {
  legs?: PmccCardLegs
  /** The open short call's fill per share. */
  shortFill?: string
  contracts?: number
  /** Contracts on the open short call; fewer than `contracts` is partial coverage. */
  shortContracts?: number
  /** Credits per share of the expired cycles after the entry short. */
  priorCredits?: string[]
}

/**
 * The Background ledger: entry short $1.80 (entry debit $23.20), two expired $0.10 cycles, then
 * the open $108 call sold at $1.80 → credits $3.80, basis $21.20, 4 cycles.
 */
export async function seedBackgroundPmcc(
  page: Page,
  {
    legs = BACKGROUND_LEGS,
    shortFill = '1.80',
    contracts = 1,
    shortContracts = contracts,
    priorCredits = ['0.10', '0.10']
  }: BackgroundPmccOptions = {}
): Promise<string> {
  return seedPmcc(page, {
    legs,
    contracts,
    expiredCredits: ['1.80', ...priorCredits],
    openShort: { fill: shortFill, contracts: shortContracts }
  })
}

/** The LEAPS-only state: two $1.00 cycles have expired and no short is open → basis $23.00. */
export async function seedLeapsOnlyPmcc(page: Page, legs: PmccCardLegs): Promise<string> {
  return seedPmcc(page, { legs, contracts: 1, expiredCredits: ['1.00', '1.00'], openShort: null })
}

/**
 * 3 LEAPS and one 1-lot $108 short: 3-lot cycles at $1.80, $1.30 and $0.10 plus the 1-lot $1.80
 * total $1,140.00 → basis $21.20 / share on 300 shares, as the AC's figures require.
 */
export async function seedPartialCoveragePmcc(page: Page): Promise<string> {
  return seedBackgroundPmcc(page, {
    contracts: 3,
    shortContracts: 1,
    priorCredits: ['1.30', '0.10']
  })
}

export function setPmccStatus(dbPath: string, positionId: string, status: 'CLOSED'): void {
  sqlite(dbPath, `UPDATE positions SET status = '${status}' WHERE id = '${positionId}';`)
}

export function setPmccPhase(dbPath: string, positionId: string, phase: string): void {
  sqlite(dbPath, `UPDATE positions SET phase = '${phase}' WHERE id = '${positionId}';`)
}

// ── Reading the ledger ───────────────────────────────────────────────────────

export interface PmccLedgerFacts {
  basisPerShare: string | undefined
  shortCreditsPerShare: string | undefined
  leapsCostPerShare: string | undefined
  initialNetDebit: string | null | undefined
  cycles: number | undefined
}

/** The seeded ledger as `getPosition` and `listPositions` report it — checked before the UI. */
export async function readLedger(page: Page, positionId: string): Promise<PmccLedgerFacts> {
  return page.evaluate(async (id) => {
    const [position, list] = await Promise.all([
      window.api.getPosition(id),
      window.api.listPositions()
    ])
    if (!position.ok) throw new Error(`getPosition failed: ${JSON.stringify(position)}`)
    const item = list.find((p) => p.id === id)
    return {
      basisPerShare: position.pmccLedger?.basisPerShare,
      shortCreditsPerShare: position.pmccLedger?.shortCreditsPerShare,
      leapsCostPerShare: position.pmccLedger?.leapsCostPerShare,
      initialNetDebit: position.initialNetDebit,
      cycles: item?.strategyType === 'PMCC' ? item.pmcc.cycles : undefined
    }
  }, positionId)
}

export const BACKGROUND_LEDGER: PmccLedgerFacts = {
  basisPerShare: '21.2000',
  shortCreditsPerShare: '3.8000',
  leapsCostPerShare: '25.0000',
  initialNetDebit: '2320.0000',
  cycles: 4
}

/** The day the PMCC opened, as tier 2's Entry net debit note states it. */
export function openedDate(): string {
  return day(0)
}
