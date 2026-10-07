// [US-104] Pure helpers behind the Roll Short Call sheet. Money is `Decimal`; display strings
// are 2 dp with ROUND_HALF_UP. Inputs are the form's free text, so an undecided value is `null`.
import Decimal from 'decimal.js'
import { format, isSameMonth, isSameYear, parseISO } from 'date-fns'
import { calculatePmccLedger } from '../../../main/core/costbasis'
import type { PmccShortCallTerms } from '../../../main/core/lifecycle'
import { ISO_DATE_REGEX } from '../schemas/common'
import { parseInputDecimal, parsePositiveInputDecimal } from './decimal-input'

const SHARES_PER_CONTRACT = 100

const money = (value: Decimal): string => value.toFixed(2, Decimal.ROUND_HALF_UP)

/** `net` is signed premium − cost to close: a credit is positive, a debit negative. */
export type PmccRollNetAmounts = {
  net: Decimal
  perShare: string
  total: string
}

/** `null` while either cash field is undecided. */
export type PmccRollNet = PmccRollNetAmounts | null

type RollNetInput = { costToClose: string; premium: string; contracts: number }

function rollNet(cost: Decimal, premium: Decimal, contracts: number): PmccRollNetAmounts {
  const net = premium.minus(cost)
  return {
    net,
    perShare: money(net.abs()),
    total: money(net.abs().times(SHARES_PER_CONTRACT).times(contracts))
  }
}

/** The net of the roll being entered; the inputs are the form's free text. */
export function pmccRollNet({ costToClose, premium, contracts }: RollNetInput): PmccRollNet {
  const cost = parsePositiveInputDecimal(costToClose)
  const prem = parsePositiveInputDecimal(premium)
  if (cost === null || prem === null) return null
  return rollNet(cost, prem, contracts)
}

/** The net of a recorded roll, whose leg prices the main process already validated. */
export function pmccRecordedRollNet({
  costToClose,
  premium,
  contracts
}: RollNetInput): PmccRollNetAmounts {
  return rollNet(new Decimal(costToClose), new Decimal(premium), contracts)
}

export interface PmccRollLabelInput {
  openShort: Pick<PmccShortCallTerms, 'strike' | 'expiration'>
  newStrike: string
  newExpiration: string
}

const dollars = (strike: Decimal): string => `$${strike.toString()}`

function strikePart(current: Decimal, next: Decimal): string {
  return current.equals(next)
    ? `same ${dollars(current)} strike`
    : `${dollars(current)} to ${dollars(next)} strike`
}

function expirationPart(current: string, next: string): string {
  const month = (d: string): string => format(parseISO(d), 'MMM')
  if (current === next) return `same ${month(current)} expiration`
  const [from, to] = [parseISO(current), parseISO(next)]
  const pattern = isSameMonth(from, to) ? 'MMM d' : isSameYear(from, to) ? 'MMM' : 'MMM yyyy'
  const label = (d: string): string => format(parseISO(d), pattern)
  return `${label(current)} to ${label(next)} expiration`
}

function verticalKind(strikeMove: number): string {
  if (strikeMove > 0) return 'Roll Up'
  if (strikeMove < 0) return 'Roll Down'
  return 'Roll'
}

function rollKind(strikeMove: number, expirationChanged: boolean): string {
  const vertical = verticalKind(strikeMove)
  if (!expirationChanged) return vertical
  return strikeMove === 0 ? 'Roll Out' : `${vertical} & Out`
}

/**
 * `Roll Up & Out: $108 to $112 strike, Nov to Dec expiration` — `Nov 2026 to Nov 2027` across a
 * year end; `null` while undecided or unchanged.
 */
export function pmccRollLabel({
  openShort,
  newStrike,
  newExpiration
}: PmccRollLabelInput): string | null {
  const current = new Decimal(openShort.strike)
  const next = parseInputDecimal(newStrike)
  if (next === null || !ISO_DATE_REGEX.test(newExpiration)) return null
  const expirationChanged = newExpiration !== openShort.expiration
  const strikeMove = next.comparedTo(current)
  if (strikeMove === 0 && !expirationChanged) return null
  const kind = rollKind(strikeMove, expirationChanged)
  const strike = strikePart(current, next)
  const expiration = expirationPart(openShort.expiration, newExpiration)
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
        cashPerShare: net.negated().toFixed(4),
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
