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

export function openWheel(input: OpenWheelInput): OpenWheelResult {
  if (!TICKER_RE.test(input.ticker)) {
    throw new ValidationError('ticker', 'invalid_format', 'Ticker must be 1–5 uppercase letters')
  }

  if (new Decimal(input.strike).lte(0)) {
    throw new ValidationError('strike', 'must_be_positive', 'Strike must be positive')
  }

  if (!Number.isInteger(input.contracts) || input.contracts <= 0) {
    throw new ValidationError(
      'contracts',
      'must_be_positive_integer',
      'Contracts must be a positive integer'
    )
  }

  if (new Decimal(input.premiumPerContract).lte(0)) {
    throw new ValidationError(
      'premiumPerContract',
      'must_be_positive',
      'Premium per contract must be positive'
    )
  }

  if (input.fillDate > input.referenceDate) {
    throw new ValidationError('fillDate', 'cannot_be_future', 'Fill date cannot be in the future')
  }

  if (input.expiration <= input.fillDate) {
    throw new ValidationError(
      'expiration',
      'must_be_after_fill_date',
      'Expiration must be strictly after fill date'
    )
  }

  return { phase: 'CSP_OPEN' }
}
