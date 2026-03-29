// Wheel phase state machine.
// Pure engine — no database or broker imports allowed here.

import Decimal from 'decimal.js'
import type { WheelPhase } from './types'

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

function requirePositiveStrike(strike: string): void {
  if (new Decimal(strike).lte(0)) {
    throw new ValidationError('strike', 'must_be_positive', 'Strike must be positive')
  }
}

function requirePositivePremium(premiumPerContract: string): void {
  if (new Decimal(premiumPerContract).lte(0)) {
    throw new ValidationError(
      'premiumPerContract',
      'must_be_positive',
      'Premium per contract must be positive'
    )
  }
}

function requirePositiveClosePrice(closePricePerContract: string): void {
  if (new Decimal(closePricePerContract).lte(0)) {
    throw new ValidationError(
      'closePricePerContract',
      'must_be_positive',
      'Close price must be greater than zero'
    )
  }
}

export function openWheel(input: OpenWheelInput): OpenWheelResult {
  if (!TICKER_RE.test(input.ticker)) {
    throw new ValidationError('ticker', 'invalid_format', 'Ticker must be 1–5 uppercase letters')
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
  if (input.currentPhase !== 'CC_OPEN') {
    throw new ValidationError('__phase__', 'invalid_phase', 'No open covered call on this position')
  }

  requirePositiveClosePrice(input.closePricePerContract)

  if (input.fillDate < input.openFillDate) {
    throw new ValidationError(
      'fillDate',
      'close_date_before_open',
      'Fill date cannot be before the CC open date'
    )
  }

  if (input.fillDate > input.expiration) {
    throw new ValidationError(
      'fillDate',
      'close_date_after_expiration',
      'Fill date cannot be after the CC expiration date — use Record Expiry instead'
    )
  }

  return { phase: 'HOLDING_SHARES' }
}
