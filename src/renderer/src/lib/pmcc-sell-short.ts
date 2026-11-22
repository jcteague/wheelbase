// [US-115] Pure helpers behind the Sell Short Call sheet: the `After this sale` preview (values
// only — the card formats them), the Coverage card's lines and the partial-coverage note.
import { differenceInCalendarDays, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import {
  projectPmccLedger,
  sharesFromContracts,
  type PmccContribution,
  type PmccLedgerTotals,
  type PmccLedgerWithStrike
} from '../../../main/core/costbasis'
import type { PmccCycle, PmccTimeline } from '../../../main/core/pmcc-timeline'
import { money4 } from '../../../shared/decimal-text'
import { decidedDate } from '../schemas/common'
import type { PmccEntryFormValues } from '../schemas/pmcc-entry'
import { parseInputDecimal, parsePositiveInputDecimal } from './decimal-input'
import { fmtCount, fmtMoney } from './format'
import { outcomeLabel } from './pmcc-timeline-rows'
import { pmccStrikeShortfall } from './pmcc-roll'

/** Where the strike sits against the effective share cost after the sale; 4-dp per share. */
export type StrikeLine =
  | { kind: 'margin'; margin: string }
  | { kind: 'shortfall'; shortfall: string }

/** The `After this sale` card's figures; `null` from `sellPmccShortPreview` while the draft is incomplete. */
export interface SellPmccShortPreview {
  /** Gross credit in dollars, fees excluded: price × 100 × contracts. */
  creditTotal: string
  dte: number
  from: PmccLedgerWithStrike
  to: PmccLedgerWithStrike
  strikeLine: StrikeLine
  uncoveredContracts: number
}

/** The sale being entered, as the form's free text. */
export type SellPmccShortDraft = Pick<PmccEntryFormValues, 'contracts'> & {
  short: Pick<PmccEntryFormValues['short'], 'strike' | 'expiration' | 'fillPrice' | 'fees'>
}

export interface SellPmccShortPreviewInput {
  /** The position's ledger so far; any full ledger satisfies it. */
  ledger: PmccLedgerTotals
  leaps: { strike: string; contracts: number }
  draft: SellPmccShortDraft
  /** The valuation day (`yyyy-MM-dd`) the DTE is counted from. */
  today: string
}

/** The draft's terms once every one is decided. */
interface DecidedSale {
  strike: Decimal
  expiration: string
  price: Decimal
  fees: Decimal
  contracts: number
}

/** `null` while any term is undecided, or the contracts exceed the LEAPS held. */
function decidedSale(
  { contracts, short }: SellPmccShortDraft,
  leapsContracts: number
): DecidedSale | null {
  const strike = parsePositiveInputDecimal(short.strike)
  const price = parsePositiveInputDecimal(short.fillPrice)
  const fees = parseInputDecimal(short.fees)
  const count = parsePositiveInputDecimal(contracts)
  const expiration = decidedDate(short.expiration)
  if (strike === null || price === null || fees === null || fees.isNegative()) return null
  if (count === null || !count.isInteger() || count.gt(leapsContracts)) return null
  if (expiration === undefined) return null
  return { strike, expiration, price, fees, contracts: count.toNumber() }
}

export function sellPmccShortPreview({
  ledger,
  leaps,
  draft,
  today
}: SellPmccShortPreviewInput): SellPmccShortPreview | null {
  const sale = decidedSale(draft, leaps.contracts)
  if (sale === null) return null
  // As `legContribution` reads the recorded SELL leg: a credit is negative cash, fees in dollars.
  const contribution: PmccContribution = {
    side: 'SHORT',
    cashPerShare: money4(sale.price.negated()),
    contracts: sale.contracts,
    fees: money4(sale.fees)
  }
  const project = (contributions: PmccContribution[]): PmccLedgerWithStrike =>
    projectPmccLedger({
      ledger,
      leapsContracts: leaps.contracts,
      longStrike: leaps.strike,
      contributions
    })
  const to = project([contribution])
  const gap = sale.strike.minus(to.effectiveShareCost)
  // One threshold with the roll sheet: strictly below the effective share cost is a shortfall.
  const strikeLine: StrikeLine =
    pmccStrikeShortfall(sale.strike.toString(), to.effectiveShareCost) === null
      ? { kind: 'margin', margin: money4(gap) }
      : { kind: 'shortfall', shortfall: money4(gap.negated()) }
  return {
    creditTotal: money4(sale.price.times(sharesFromContracts(sale.contracts))),
    dte: differenceInCalendarDays(parseISO(sale.expiration), parseISO(today)),
    from: project([]),
    to,
    strikeLine,
    uncoveredContracts: leaps.contracts - sale.contracts
  }
}

/** A short-call cycle that has ended: its outcome and end date are known. */
export type PmccEndedCycle = Extract<PmccCycle, { status: 'ENDED' }>

/** The most recently ended cycle, or `null` when none has ended. */
export function lastEndedCycle(
  timeline: Pick<PmccTimeline, 'cycles'> | null
): PmccEndedCycle | null {
  const ended = (timeline?.cycles ?? []).filter(
    (cycle): cycle is PmccEndedCycle => cycle.status === 'ENDED'
  )
  return ended.at(-1) ?? null
}

/** `Cycle 8 expired worthless 2027-07-16 · 7 days uncovered`. */
export function previousCycleLine(
  cycle: Pick<PmccEndedCycle, 'number' | 'outcome' | 'endedOn'> | null,
  today: string
): string {
  if (cycle === null) return 'No short call has been sold against this LEAPS yet'
  const uncovered = differenceInCalendarDays(parseISO(today), parseISO(cycle.endedOn))
  const outcome = outcomeLabel(cycle.outcome).toLowerCase()
  return `Cycle ${cycle.number} ${outcome} ${cycle.endedOn} · ${fmtCount(uncovered, 'day')} uncovered`
}

/** `$85.00 · 2028-01-21 · 182 DTE · Δ 0.81`. */
export function coverageCardLine(
  leaps: { strike: string; expiration: string },
  dte: number,
  delta: string | null
): string {
  const deltaText = delta === null ? '—' : new Decimal(delta).toFixed(2, Decimal.ROUND_HALF_UP)
  return `${fmtMoney(leaps.strike)} · ${leaps.expiration} · ${dte} DTE · Δ ${deltaText}`
}

/** The partial-coverage note under the preview. */
export function uncoveredContractsNote(n: number): string {
  const [verb, pronoun, stays] = n === 1 ? ['remains', 'it', 'stays'] : ['remain', 'they', 'stay']
  return `${fmtCount(n, 'LEAPS contract')} ${verb} uncovered. Only one short call can be open at a time, so ${pronoun} ${stays} uncovered until this one is retired.`
}
