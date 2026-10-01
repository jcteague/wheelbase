// Wheel phase state machine.
// Pure engine — no database or broker imports allowed here.

import Decimal from 'decimal.js'
import { pmccCrossLegIssues } from './pmcc-rules'
import type { OptionInstrumentType, WheelPhase } from './types'

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    public readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

export interface OpenWheelInput {
  ticker: string
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  fillDate: string
  referenceDate: string
}

export interface OpenWheelResult {
  phase: WheelPhase
}

const TICKER_RE = /^[A-Z]{1,5}$/
const TICKER_MESSAGE = 'Ticker must be 1–5 uppercase letters'
const NO_OPEN_COVERED_CALL_MESSAGE = 'No open covered call on this position'

function requirePositiveStrike(strike: string, field: string = 'strike'): void {
  if (new Decimal(strike).lte(0)) {
    throw new ValidationError(field, 'must_be_positive', 'Strike must be positive')
  }
}

function requirePositiveDecimal(value: string, field: string, label: string): void {
  if (new Decimal(value).lte(0)) {
    throw new ValidationError(field, 'must_be_positive', `${label} must be greater than zero`)
  }
}

function requirePositivePremium(premiumPerContract: string): void {
  requirePositiveDecimal(premiumPerContract, 'premiumPerContract', 'Premium per contract')
}

function requirePositiveClosePrice(closePricePerContract: string): void {
  requirePositiveDecimal(closePricePerContract, 'closePricePerContract', 'Close price')
}

function requireCcOpenPhase(currentPhase: WheelPhase): void {
  if (currentPhase !== 'CC_OPEN') {
    throw new ValidationError('__phase__', 'invalid_phase', NO_OPEN_COVERED_CALL_MESSAGE)
  }
}

function requireFillDateOnOrAfterOpen(fillDate: string, openDate: string, message: string): void {
  if (fillDate < openDate) {
    throw new ValidationError('fillDate', 'close_date_before_open', message)
  }
}

export function openWheel(input: OpenWheelInput): OpenWheelResult {
  if (!TICKER_RE.test(input.ticker)) {
    throw new ValidationError('ticker', 'invalid_format', TICKER_MESSAGE)
  }

  requirePositiveStrike(input.strike)

  if (!Number.isInteger(input.contracts) || input.contracts <= 0) {
    throw new ValidationError(
      'contracts',
      'must_be_positive_integer',
      'Contracts must be a positive integer'
    )
  }

  requirePositivePremium(input.premiumPerContract)

  if (input.fillDate > input.referenceDate) {
    throw new ValidationError('fillDate', 'cannot_be_future', 'Fill date cannot be in the future')
  }

  if (input.expiration < input.fillDate) {
    throw new ValidationError(
      'expiration',
      'must_be_before_fill_date',
      'Expiration cannot be before fill date'
    )
  }

  return { phase: 'CSP_OPEN' }
}

export interface OpenPmccLegInput {
  underlying: string
  instrumentType: OptionInstrumentType
  deliverableShares: number
  strike: string
  expiration: string
  contracts: number
  fillPrice: string
  fillDate: string
  fees: string
}

export interface OpenPmccInput {
  ticker: string
  long: OpenPmccLegInput
  short: OpenPmccLegInput
  referenceDate: string
}

export interface OpenPmccResult {
  phase: 'PMCC_OPEN'
}

type PmccSide = 'long' | 'short'

/** Every field path `openPmcc` can reject on — a misspelled path is a typecheck failure. */
export type PmccField = 'ticker' | '__pair__' | `${PmccSide}.${keyof OpenPmccLegInput}`

const PMCC_SIDES: readonly PmccSide[] = ['long', 'short']

function rejectPmcc(field: PmccField, code: string, message: string): never {
  throw new ValidationError(field, code, message)
}

function requireCall(instrumentType: OptionInstrumentType, field: PmccField): void {
  if (instrumentType !== 'CALL') {
    rejectPmcc(field, 'not_a_call', 'PMCC entry requires two call options.')
  }
}

function requireStandardDeliverable(deliverableShares: number, field: PmccField): void {
  if (deliverableShares !== 100) {
    rejectPmcc(
      field,
      'nonstandard_deliverable',
      'This entry supports standard 100-share contracts only.'
    )
  }
}

function requirePositiveWholeContracts(contracts: number, field: PmccField): void {
  if (!Number.isInteger(contracts) || contracts <= 0) {
    rejectPmcc(field, 'must_be_positive_integer', 'Contracts must be a positive whole number.')
  }
}

function requirePositiveFillPrice(fillPrice: string, field: PmccField): void {
  if (new Decimal(fillPrice).lte(0)) {
    rejectPmcc(field, 'must_be_positive', 'Actual fill price must be greater than zero.')
  }
}

function requireNonNegativeFees(fees: string, field: PmccField): void {
  if (new Decimal(fees).lt(0)) {
    rejectPmcc(field, 'must_be_non_negative', 'Fees cannot be negative.')
  }
}

/**
 * Validates a poor man's covered call entry: a long LEAPS call plus a shorter-dated, higher-strike
 * short call on the same underlying, opened for a net debit. Rules are checked in a fixed order
 * (per-leg rules long then short, then the cross-leg rules shared with the entry form via
 * `pmccCrossLegIssues`) and the first failure throws. ISO dates compare as strings.
 */
export function openPmcc(input: OpenPmccInput): OpenPmccResult {
  const { long, short, referenceDate } = input
  function eachLeg(check: (leg: OpenPmccLegInput, side: PmccSide) => void): void {
    PMCC_SIDES.forEach((side) => check(input[side], side))
  }

  if (!TICKER_RE.test(input.ticker)) {
    rejectPmcc('ticker', 'invalid_format', TICKER_MESSAGE)
  }
  eachLeg((leg, side) => {
    if (leg.underlying !== input.ticker) {
      rejectPmcc(
        `${side}.underlying`,
        'underlying_mismatch',
        'Both calls must have the same underlying.'
      )
    }
  })
  eachLeg((leg, side) => requireCall(leg.instrumentType, `${side}.instrumentType`))
  eachLeg((leg, side) =>
    requireStandardDeliverable(leg.deliverableShares, `${side}.deliverableShares`)
  )
  eachLeg((leg, side) => requirePositiveWholeContracts(leg.contracts, `${side}.contracts`))
  if (long.contracts !== short.contracts) {
    rejectPmcc(
      'short.contracts',
      'quantity_mismatch',
      'Opening quantities must match for this PMCC entry.'
    )
  }
  eachLeg((leg, side) => requirePositiveStrike(leg.strike, `${side}.strike` satisfies PmccField))
  eachLeg((leg, side) => requirePositiveFillPrice(leg.fillPrice, `${side}.fillPrice`))
  eachLeg((leg, side) => requireNonNegativeFees(leg.fees, `${side}.fees`))
  const [crossLegIssue] = pmccCrossLegIssues({ long, short, referenceDate })
  if (crossLegIssue) {
    rejectPmcc(crossLegIssue.field, crossLegIssue.code, crossLegIssue.message)
  }

  return { phase: 'PMCC_OPEN' }
}

export interface CloseCspInput {
  currentPhase: WheelPhase
  closePricePerContract: string
  openPremiumPerContract: string
  closeFillDate: string
  openFillDate: string
  expiration: string
}

export interface CloseCspResult {
  phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
}

export function closeCsp(input: CloseCspInput): CloseCspResult {
  if (input.currentPhase !== 'CSP_OPEN') {
    throw new ValidationError('__phase__', 'invalid_phase', 'Position is not in CSP_OPEN phase')
  }

  requirePositiveClosePrice(input.closePricePerContract)

  if (input.closeFillDate < input.openFillDate) {
    throw new ValidationError(
      'fillDate',
      'close_date_before_open',
      'Close date cannot be before the open date'
    )
  }

  if (input.closeFillDate > input.expiration) {
    throw new ValidationError(
      'fillDate',
      'close_date_after_expiration',
      'Close date cannot be after expiration date'
    )
  }

  const netPnl = new Decimal(input.openPremiumPerContract).minus(input.closePricePerContract)
  return { phase: netPnl.gt(0) ? 'CSP_CLOSED_PROFIT' : 'CSP_CLOSED_LOSS' }
}

export interface ExpireCspInput {
  currentPhase: WheelPhase
  expirationDate: string
  referenceDate: string
}

export interface ExpireCspResult {
  phase: 'WHEEL_COMPLETE'
}

export function expireCsp(input: ExpireCspInput): ExpireCspResult {
  if (input.currentPhase !== 'CSP_OPEN') {
    throw new ValidationError('__phase__', 'invalid_phase', 'Position is not in CSP_OPEN phase')
  }

  if (input.referenceDate < input.expirationDate) {
    throw new ValidationError(
      'expiration',
      'too_early',
      'Cannot record expiration before the expiration date'
    )
  }

  return { phase: 'WHEEL_COMPLETE' }
}

export interface OpenCoveredCallInput {
  currentPhase: WheelPhase
  strike: string
  contracts: number
  positionContracts: number
  premiumPerContract: string
  fillDate: string
  assignmentDate: string
  referenceDate: string
  expiration: string
}

export interface OpenCoveredCallResult {
  phase: 'CC_OPEN'
}

export function openCoveredCall(input: OpenCoveredCallInput): OpenCoveredCallResult {
  if (input.currentPhase === 'CC_OPEN') {
    throw new ValidationError(
      '__phase__',
      'invalid_phase',
      'A covered call is already open on this position'
    )
  }

  if (input.currentPhase !== 'HOLDING_SHARES') {
    throw new ValidationError(
      '__phase__',
      'invalid_phase',
      'Position is not in HOLDING_SHARES phase'
    )
  }

  requirePositiveStrike(input.strike)
  requirePositivePremium(input.premiumPerContract)

  if (input.contracts > input.positionContracts) {
    throw new ValidationError(
      'contracts',
      'exceeds_shares',
      `Contracts cannot exceed shares held (${input.positionContracts})`
    )
  }

  if (input.fillDate < input.assignmentDate) {
    throw new ValidationError(
      'fillDate',
      'before_assignment',
      'Fill date cannot be before the assignment date'
    )
  }

  if (input.fillDate > input.referenceDate) {
    throw new ValidationError('fillDate', 'cannot_be_future', 'Fill date cannot be in the future')
  }

  if (input.expiration < input.fillDate) {
    throw new ValidationError(
      'expiration',
      'before_fill_date',
      'Expiration cannot be before fill date'
    )
  }

  return { phase: 'CC_OPEN' }
}

export interface RecordCallAwayInput {
  currentPhase: WheelPhase
  contracts: number
  fillDate: string
  ccOpenFillDate: string
}

export interface RecordCallAwayResult {
  phase: 'WHEEL_COMPLETE'
}

export function recordCallAway(input: RecordCallAwayInput): RecordCallAwayResult {
  requireCcOpenPhase(input.currentPhase)

  if (input.contracts > 1) {
    throw new ValidationError(
      'contracts',
      'multi_contract_unsupported',
      'Multi-contract call-away is not yet supported'
    )
  }

  requireFillDateOnOrAfterOpen(
    input.fillDate,
    input.ccOpenFillDate,
    'Fill date cannot be before the CC open date'
  )

  return { phase: 'WHEEL_COMPLETE' }
}

export interface RecordAssignmentInput {
  currentPhase: WheelPhase
  assignmentDate: string
  openFillDate: string
}

export interface RecordAssignmentResult {
  phase: 'HOLDING_SHARES'
}

export function recordAssignment(input: RecordAssignmentInput): RecordAssignmentResult {
  if (input.currentPhase !== 'CSP_OPEN') {
    throw new ValidationError(
      '__phase__',
      'invalid_phase',
      'Assignment can only be recorded on a CSP_OPEN position'
    )
  }

  if (input.assignmentDate < input.openFillDate) {
    throw new ValidationError(
      'assignmentDate',
      'date_before_open',
      'Assignment date cannot be before the CSP open date'
    )
  }

  return { phase: 'HOLDING_SHARES' }
}

export interface ExpireCcInput {
  currentPhase: WheelPhase
  expirationDate: string
  referenceDate: string
}

export interface ExpireCcResult {
  phase: 'HOLDING_SHARES'
}

export function expireCc(input: ExpireCcInput): ExpireCcResult {
  if (input.currentPhase !== 'CC_OPEN') {
    throw new ValidationError('__phase__', 'invalid_phase', 'No open covered call on this position')
  }

  if (input.referenceDate < input.expirationDate) {
    throw new ValidationError(
      'expiration',
      'too_early',
      `Cannot record expiration before the expiration date (${input.expirationDate})`
    )
  }

  return { phase: 'HOLDING_SHARES' }
}

export interface CloseCoveredCallInput {
  currentPhase: WheelPhase
  closePricePerContract: string
  openFillDate: string
  fillDate: string
  expiration: string
}

export interface CloseCoveredCallResult {
  phase: 'HOLDING_SHARES'
}

export function closeCoveredCall(input: CloseCoveredCallInput): CloseCoveredCallResult {
  requireCcOpenPhase(input.currentPhase)

  requirePositiveClosePrice(input.closePricePerContract)

  requireFillDateOnOrAfterOpen(
    input.fillDate,
    input.openFillDate,
    'Fill date cannot be before the CC open date'
  )

  if (input.fillDate > input.expiration) {
    throw new ValidationError(
      'fillDate',
      'close_date_after_expiration',
      'Fill date cannot be after the CC expiration date — use Record Expiry instead'
    )
  }

  return { phase: 'HOLDING_SHARES' }
}

export interface RollCspInput {
  currentPhase: WheelPhase
  currentExpiration: string
  newExpiration: string
  costToClosePerContract: string
  newPremiumPerContract: string
}

export interface RollCspResult {
  phase: 'CSP_OPEN'
}

export function rollCsp(input: RollCspInput): RollCspResult {
  if (input.currentPhase !== 'CSP_OPEN') {
    throw new ValidationError('__phase__', 'invalid_phase', 'Position is not in CSP_OPEN phase')
  }

  if (input.newExpiration <= input.currentExpiration) {
    throw new ValidationError(
      'newExpiration',
      'must_be_after_current',
      'New expiration must be after the current expiration'
    )
  }

  requirePositiveDecimal(input.costToClosePerContract, 'costToClosePerContract', 'Cost to close')
  requirePositiveDecimal(input.newPremiumPerContract, 'newPremiumPerContract', 'New premium')

  return { phase: 'CSP_OPEN' }
}

export interface RollCcInput {
  currentPhase: WheelPhase
  currentStrike: string
  currentExpiration: string
  newStrike: string
  newExpiration: string
  costToClosePerContract: string
  newPremiumPerContract: string
}

export interface RollCcResult {
  phase: 'CC_OPEN'
}

export function rollCc(input: RollCcInput): RollCcResult {
  requireCcOpenPhase(input.currentPhase)

  if (input.newExpiration < input.currentExpiration) {
    throw new ValidationError(
      'newExpiration',
      'must_be_on_or_after_current',
      'New expiration must be on or after the current expiration'
    )
  }

  if (input.newStrike === input.currentStrike && input.newExpiration === input.currentExpiration) {
    throw new ValidationError(
      '__roll__',
      'no_change',
      'Roll must change at least one of strike or expiration'
    )
  }

  requirePositiveDecimal(input.costToClosePerContract, 'costToClosePerContract', 'Cost to close')
  requirePositiveDecimal(input.newPremiumPerContract, 'newPremiumPerContract', 'New premium')

  return { phase: 'CC_OPEN' }
}
