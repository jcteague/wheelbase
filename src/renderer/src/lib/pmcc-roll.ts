// [US-104][US-105] Pure helpers behind the Roll Short Call and Roll LEAPS sheets. Money is
// `Decimal`; display strings are 2 dp with ROUND_HALF_UP. Inputs are the form's free text, so an
// undecided value is `null`.
import Decimal from 'decimal.js'
import { differenceInCalendarDays, format, isSameMonth, isSameYear, parseISO } from 'date-fns'
import {
  calculatePmccLedger,
  type PmccContribution,
  type PmccLedgerSide,
  type PmccLedgerWithStrike
} from '../../../main/core/costbasis'
import type { PmccLegTerms } from '../../../main/core/lifecycle'
import type { PmccLedgerResult } from '../api/positions'
import { ISO_DATE_REGEX } from '../schemas/common'
import { parseInputDecimal, parsePositiveInputDecimal } from './decimal-input'
import { money4 } from '../../../shared/decimal-text'

const SHARES_PER_CONTRACT = 100

const money = (value: Decimal): string => value.toFixed(2, Decimal.ROUND_HALF_UP)

const GROUPED = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

/** `money` with thousands separators: `1100` → `1,100.00`. */
const groupedMoney = (value: Decimal): string => GROUPED.format(Number(money(value)))

/** `net` is signed received − paid: a credit is positive, a debit negative. */
export type PmccRollNetAmounts = {
  net: Decimal
  perShare: string
  total: string
}

/** `null` while either cash field is undecided. */
export type PmccRollNet = PmccRollNetAmounts | null

/**
 * A roll's two cash legs per share, direction-neutral: a short roll receives the new premium and
 * pays the cost to close; a LEAPS roll receives the sale proceeds and pays the replacement debit.
 */
export type PmccRollCash = { received: string; paid: string; contracts: number }

function rollNet(received: Decimal, paid: Decimal, contracts: number): PmccRollNetAmounts {
  const net = received.minus(paid)
  return {
    net,
    perShare: money(net.abs()),
    total: groupedMoney(net.abs().times(SHARES_PER_CONTRACT).times(contracts))
  }
}

/** Which way a roll's cash went: paid out, taken in, or neither. */
export type NetDirection = 'debit' | 'credit' | 'even'

/** The direction of a signed received − paid net. */
export function netDirection(net: Decimal): NetDirection {
  if (net.isZero()) return 'even'
  return net.isNegative() ? 'debit' : 'credit'
}

/** The net of the roll being entered; the inputs are the form's free text. */
export function pmccRollNet({ received, paid, contracts }: PmccRollCash): PmccRollNet {
  const inflow = parsePositiveInputDecimal(received)
  const outflow = parsePositiveInputDecimal(paid)
  if (inflow === null || outflow === null) return null
  return rollNet(inflow, outflow, contracts)
}

/** The net of a recorded roll, whose leg prices the main process already validated. */
export function pmccRecordedRollNet({
  received,
  paid,
  contracts
}: PmccRollCash): PmccRollNetAmounts {
  return rollNet(new Decimal(received), new Decimal(paid), contracts)
}

/** The two expiration formats the roll labels use: month only (short roll) or month and year (LEAPS). */
export type RollLabelMonthFormat = 'MMM' | 'MMM yyyy'

/** The same-month form of each format: the day disambiguates two expirations in one month. */
const SAME_MONTH_FORMAT: Record<RollLabelMonthFormat, string> = {
  MMM: 'MMM d',
  'MMM yyyy': 'MMM d, yyyy'
}

const dollars = (strike: Decimal): string => `$${strike.toString()}`

function strikePart(current: Decimal, next: Decimal): string {
  return current.equals(next)
    ? `same ${dollars(current)} strike`
    : `${dollars(current)} to ${dollars(next)} strike`
}

function expirationPattern(from: Date, to: Date, monthFormat: RollLabelMonthFormat): string {
  if (isSameMonth(from, to)) return SAME_MONTH_FORMAT[monthFormat]
  return isSameYear(from, to) ? monthFormat : 'MMM yyyy'
}

function expirationPart(current: string, next: string, monthFormat: RollLabelMonthFormat): string {
  const [from, to] = [parseISO(current), parseISO(next)]
  if (current === next) return `same ${format(from, monthFormat)} expiration`
  const pattern = expirationPattern(from, to, monthFormat)
  return `${format(from, pattern)} to ${format(to, pattern)} expiration`
}

function verticalKind(strikeMove: number): string {
  if (strikeMove > 0) return 'Roll Up'
  if (strikeMove < 0) return 'Roll Down'
  return 'Roll'
}

/** `expirationMove`: `+1` later (Out), `−1` earlier (In), `0` unchanged. */
function rollKind(strikeMove: number, expirationMove: number): string {
  const vertical = verticalKind(strikeMove)
  if (expirationMove === 0) return vertical
  const timing = expirationMove > 0 ? 'Out' : 'In'
  return strikeMove === 0 ? `Roll ${timing}` : `${vertical} & ${timing}`
}

/**
 * `Roll Up & Out: $108 to $112 strike, Nov to Dec expiration` — `Nov 2026 to Nov 2027` across a
 * year end; with `'MMM yyyy'` every month carries its year (`Sep 2027 to Aug 2027` for a Roll In).
 * `null` while undecided or unchanged.
 */
export function pmccRollLabel(
  current: PmccLegTerms,
  /** The replacement's terms as the form's free text. */
  next: PmccLegTerms,
  monthFormat: RollLabelMonthFormat = 'MMM'
): string | null {
  const currentStrike = new Decimal(current.strike)
  const nextStrike = parseInputDecimal(next.strike)
  if (nextStrike === null || !ISO_DATE_REGEX.test(next.expiration)) return null
  const strikeMove = nextStrike.comparedTo(currentStrike)
  const expirationMove = Math.sign(
    differenceInCalendarDays(parseISO(next.expiration), parseISO(current.expiration))
  )
  if (strikeMove === 0 && expirationMove === 0) return null
  const kind = rollKind(strikeMove, expirationMove)
  const strike = strikePart(currentStrike, nextStrike)
  const expiration = expirationPart(current.expiration, next.expiration, monthFormat)
  return `${kind}: ${strike}, ${expiration}`
}

/** The per-share cost basis and effective share cost once the roll is recorded. */
export interface PmccPostRoll {
  postBasis: string
  effectiveAfter: string
}

/**
 * Basis after the roll (a debit raises it) and the LEAPS strike plus that basis, from the core
 * PMCC ledger: the basis so far as one LEAPS-share contribution plus the roll's net on the short's
 * contracts, so a short on fewer contracts than the LEAPS is spread across every LEAPS share.
 */
export function pmccPostRollEffectiveCost({
  basisPerShare,
  leaps,
  shortContracts,
  net
}: {
  basisPerShare: string
  leaps: { strike: string; contracts: number }
  shortContracts: number
  net: Decimal
}): PmccPostRoll {
  const ledger = calculatePmccLedger({
    leapsContracts: leaps.contracts,
    longStrike: leaps.strike,
    contributions: [
      { side: 'LONG', cashPerShare: basisPerShare, contracts: leaps.contracts, fees: '0' },
      // The ledger's sign: `+` debit, `−` credit — the negated net.
      {
        side: 'SHORT',
        cashPerShare: money4(net.negated()),
        contracts: shortContracts,
        fees: '0'
      }
    ]
  })
  return {
    postBasis: money(new Decimal(ledger.basisPerShare)),
    effectiveAfter: money(new Decimal(ledger.effectiveShareCost))
  }
}

/** Per-share loss realised if assigned below the effective share cost; `null` at or above it. */
export function pmccStrikeShortfall(strike: string, effectiveAfter: string): string | null {
  const parsed = parseInputDecimal(strike)
  if (parsed === null || parsed.gte(effectiveAfter)) return null
  return money(new Decimal(effectiveAfter).minus(parsed))
}

/**
 * Calendar days the replacement LEAPS adds to (positive) or takes from (negative) the current
 * LEAPS' coverage; `null` while the new expiration is incomplete.
 */
export function leapsCoverageChange(
  currentExpiration: string,
  newExpiration: string
): number | null {
  if (!ISO_DATE_REGEX.test(newExpiration)) return null
  return differenceInCalendarDays(parseISO(newExpiration), parseISO(currentExpiration))
}

/** The PMCC ledger's per-share figures a LEAPS roll moves; the effective cost is known (a LEAPS is open). */
export type PmccLeapsLedger = Pick<
  PmccLedgerWithStrike,
  'basisPerShare' | 'leapsCostPerShare' | 'effectiveShareCost'
>

/** The LEAPS roll's post-roll figures: basis, LEAPS cost to date and the re-anchored effective cost. */
export interface PmccLeapsPostRoll extends PmccPostRoll {
  leapsCostAfter: string
}

/**
 * The ledger once the LEAPS roll is recorded, from the core PMCC ledger: the LEAPS cost so far and
 * the short credits so far as one contribution each, plus the roll's net on the LONG side — so the
 * net moves the basis and the LEAPS cost alike (a credit lowers both), and the effective share
 * cost re-anchors to the replacement strike. `null` while the strike is undecided.
 */
export function pmccLeapsPostRoll({
  ledger,
  newStrike,
  contracts,
  net
}: {
  ledger: Pick<PmccLeapsLedger, 'basisPerShare' | 'leapsCostPerShare'>
  newStrike: string
  contracts: number
  net: Decimal
}): PmccLeapsPostRoll | null {
  const strike = parsePositiveInputDecimal(newStrike)
  if (strike === null) return null
  // The ledger's sign: `+` debit, `−` credit. Short credits so far are the LEAPS cost less the basis.
  const contribution = (side: PmccLedgerSide, cashPerShare: Decimal): PmccContribution => ({
    side,
    cashPerShare: money4(cashPerShare),
    contracts,
    fees: '0'
  })
  const after = calculatePmccLedger({
    leapsContracts: contracts,
    longStrike: strike.toString(),
    contributions: [
      contribution('LONG', new Decimal(ledger.leapsCostPerShare)),
      contribution('SHORT', new Decimal(ledger.basisPerShare).minus(ledger.leapsCostPerShare)),
      contribution('LONG', net.negated())
    ]
  })
  return {
    postBasis: money(new Decimal(after.basisPerShare)),
    leapsCostAfter: money(new Decimal(after.leapsCostPerShare)),
    effectiveAfter: money(new Decimal(after.effectiveShareCost))
  }
}

/** `up $2.50 from $101.80`, `down …`, or `unchanged`: how the effective share cost moves. */
export function effectiveCostMove(before: string, after: string): string {
  const change = new Decimal(after).minus(before)
  if (change.isZero()) return 'unchanged'
  const direction = change.isPositive() ? 'up' : 'down'
  return `${direction} $${money(change.abs())} from $${money(new Decimal(before))}`
}

/** The ledger as a PMCC roll sheet reads it, or `null` while no LEAPS strike anchors its effective share cost. */
export function pmccLeapsLedger(ledger: PmccLedgerResult | null): PmccLeapsLedger | null {
  if (ledger === null) return null
  const { effectiveShareCost } = ledger
  return effectiveShareCost === null ? null : { ...ledger, effectiveShareCost }
}
