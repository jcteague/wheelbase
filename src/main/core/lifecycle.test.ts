import { describe, expect, it } from 'vitest'
import { localDate } from '../dates'
import * as lifecycle from './lifecycle'
import {
  ValidationError,
  openWheel,
  closeCsp,
  expireCsp,
  openCoveredCall,
  closeCoveredCall,
  expireCc,
  rollCc,
  requirePmccOpenPhase,
  rollPmccShortCall,
  rollPmccLeaps,
  openPmcc
} from './lifecycle'
import type {
  CloseCspInput,
  CloseCoveredCallInput,
  ExpireCcInput,
  ExpireCspInput,
  OpenWheelInput,
  OpenCoveredCallInput,
  RollCspInput,
  RollCcInput,
  OpenPmccInput,
  OpenPmccLegInput,
  RollPmccShortCallInput,
  RollPmccLeapsInput
} from './lifecycle'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(offsetDays: number): string {
  return localDate(offsetDays)
}

const TODAY = isoDate(0)
const TOMORROW = isoDate(1)
const YESTERDAY = isoDate(-1)
const NEXT_MONTH = isoDate(30)

function validInput(overrides: Partial<OpenWheelInput> = {}): OpenWheelInput {
  return {
    ticker: 'AAPL',
    strike: '150.00',
    expiration: NEXT_MONTH,
    contracts: 1,
    premiumPerContract: '3.50',
    fillDate: TODAY,
    referenceDate: TODAY,
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('openWheel', () => {
  it('returns CSP_OPEN phase for valid input', () => {
    const result = openWheel(validInput())
    expect(result.phase).toBe('CSP_OPEN')
  })

  // -------------------------------------------------------------------------
  // Ticker validation
  // -------------------------------------------------------------------------

  it('rejects empty ticker', () => {
    expect(() => openWheel(validInput({ ticker: '' }))).toThrow(ValidationError)
    try {
      openWheel(validInput({ ticker: '' }))
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError)
      expect((e as ValidationError).field).toBe('ticker')
      expect((e as ValidationError).code).toBe('invalid_format')
    }
  })

  it('rejects lowercase ticker', () => {
    const e = catchValidation(() => openWheel(validInput({ ticker: 'aapl' })))
    expect(e.field).toBe('ticker')
    expect(e.code).toBe('invalid_format')
  })

  it('rejects ticker longer than 5 chars', () => {
    const e = catchValidation(() => openWheel(validInput({ ticker: 'TOOLNG' })))
    expect(e.field).toBe('ticker')
    expect(e.code).toBe('invalid_format')
  })

  it('rejects ticker with digits', () => {
    const e = catchValidation(() => openWheel(validInput({ ticker: 'AA1' })))
    expect(e.field).toBe('ticker')
    expect(e.code).toBe('invalid_format')
  })

  // -------------------------------------------------------------------------
  // Strike validation
  // -------------------------------------------------------------------------

  it('rejects zero strike', () => {
    const e = catchValidation(() => openWheel(validInput({ strike: '0' })))
    expect(e.field).toBe('strike')
    expect(e.code).toBe('must_be_positive')
  })

  it('rejects negative strike', () => {
    const e = catchValidation(() => openWheel(validInput({ strike: '-10.00' })))
    expect(e.field).toBe('strike')
    expect(e.code).toBe('must_be_positive')
  })

  // -------------------------------------------------------------------------
  // Contracts validation
  // -------------------------------------------------------------------------

  it('rejects zero contracts', () => {
    const e = catchValidation(() => openWheel(validInput({ contracts: 0 })))
    expect(e.field).toBe('contracts')
    expect(e.code).toBe('must_be_positive_integer')
  })

  it('rejects negative contracts', () => {
    const e = catchValidation(() => openWheel(validInput({ contracts: -1 })))
    expect(e.field).toBe('contracts')
    expect(e.code).toBe('must_be_positive_integer')
  })

  // -------------------------------------------------------------------------
  // Premium validation
  // -------------------------------------------------------------------------

  it('rejects zero premium', () => {
    const e = catchValidation(() => openWheel(validInput({ premiumPerContract: '0' })))
    expect(e.field).toBe('premiumPerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('rejects negative premium', () => {
    const e = catchValidation(() => openWheel(validInput({ premiumPerContract: '-1.00' })))
    expect(e.field).toBe('premiumPerContract')
    expect(e.code).toBe('must_be_positive')
  })

  // -------------------------------------------------------------------------
  // fillDate validation
  // -------------------------------------------------------------------------

  it('rejects future fill date', () => {
    const e = catchValidation(() => openWheel(validInput({ fillDate: TOMORROW })))
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('cannot_be_future')
  })

  // -------------------------------------------------------------------------
  // Expiration validation
  // -------------------------------------------------------------------------

  it('allows same-day expiration (0-DTE)', () => {
    const result = openWheel(validInput({ fillDate: YESTERDAY, expiration: YESTERDAY }))
    expect(result.phase).toBe('CSP_OPEN')
  })

  it('rejects expiration before fill date', () => {
    const e = catchValidation(() =>
      openWheel(validInput({ fillDate: TODAY, expiration: YESTERDAY }))
    )
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('must_be_before_fill_date')
  })
})

// ---------------------------------------------------------------------------
// closeCsp
// ---------------------------------------------------------------------------

describe('closeCsp', () => {
  const BASE_OPEN_DATE = '2026-03-01'
  const BASE_EXPIRATION = '2026-04-17'

  function validCloseInput(): CloseCspInput {
    return {
      currentPhase: 'CSP_OPEN',
      closePricePerContract: '1.00',
      openPremiumPerContract: '2.50',
      closeFillDate: '2026-03-15',
      openFillDate: BASE_OPEN_DATE,
      expiration: BASE_EXPIRATION
    }
  }

  it('throws ValidationError when currentPhase is not CSP_OPEN', () => {
    const e = catchValidation(() =>
      closeCsp({ ...validCloseInput(), currentPhase: 'HOLDING_SHARES' as never })
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('Position is not in CSP_OPEN phase')
  })

  it('throws ValidationError when closePricePerContract is 0', () => {
    const e = catchValidation(() => closeCsp({ ...validCloseInput(), closePricePerContract: '0' }))
    expect(e.field).toBe('closePricePerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('throws ValidationError when closePricePerContract is negative', () => {
    const e = catchValidation(() =>
      closeCsp({ ...validCloseInput(), closePricePerContract: '-1.00' })
    )
    expect(e.field).toBe('closePricePerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('throws ValidationError when closeFillDate is before openFillDate', () => {
    const e = catchValidation(() =>
      closeCsp({
        ...validCloseInput(),
        closeFillDate: '2026-03-15',
        openFillDate: '2026-03-20'
      })
    )
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('close_date_before_open')
    expect(e.message).toBe('Close date cannot be before the open date')
  })

  it('throws ValidationError when closeFillDate is after expiration', () => {
    const e = catchValidation(() =>
      closeCsp({
        ...validCloseInput(),
        closeFillDate: '2026-04-18',
        expiration: '2026-04-17'
      })
    )
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('close_date_after_expiration')
    expect(e.message).toBe('Close date cannot be after expiration date')
  })

  it('returns CSP_CLOSED_PROFIT when closePrice < openPremium', () => {
    const result = closeCsp({
      ...validCloseInput(),
      closePricePerContract: '1.00',
      openPremiumPerContract: '2.50'
    })
    expect(result.phase).toBe('CSP_CLOSED_PROFIT')
  })

  it('returns CSP_CLOSED_LOSS when closePrice > openPremium', () => {
    const result = closeCsp({
      ...validCloseInput(),
      closePricePerContract: '3.50',
      openPremiumPerContract: '2.50'
    })
    expect(result.phase).toBe('CSP_CLOSED_LOSS')
  })

  it('returns CSP_CLOSED_LOSS when closePrice equals openPremium (breakeven)', () => {
    const result = closeCsp({
      ...validCloseInput(),
      closePricePerContract: '2.50',
      openPremiumPerContract: '2.50'
    })
    expect(result.phase).toBe('CSP_CLOSED_LOSS')
  })

  it('passes validation when closeFillDate equals expiration', () => {
    const result = closeCsp({
      ...validCloseInput(),
      closeFillDate: '2026-04-17',
      expiration: '2026-04-17'
    })
    expect(result.phase).toBe('CSP_CLOSED_PROFIT')
  })
})

// ---------------------------------------------------------------------------
// expireCsp
// ---------------------------------------------------------------------------

describe('expireCsp', () => {
  const BASE_EXPIRATION = '2025-01-17'

  function validExpireInput(overrides: Partial<ExpireCspInput> = {}): ExpireCspInput {
    return {
      currentPhase: 'CSP_OPEN',
      expirationDate: BASE_EXPIRATION,
      referenceDate: BASE_EXPIRATION,
      ...overrides
    }
  }

  it('returns WHEEL_COMPLETE when referenceDate equals expirationDate (same-day boundary)', () => {
    const result = expireCsp(validExpireInput())
    expect(result.phase).toBe('WHEEL_COMPLETE')
  })

  it('returns WHEEL_COMPLETE when referenceDate is after expirationDate', () => {
    const result = expireCsp(validExpireInput({ referenceDate: '2025-01-18' }))
    expect(result.phase).toBe('WHEEL_COMPLETE')
  })

  it('throws ValidationError with invalid_phase when currentPhase is not CSP_OPEN', () => {
    const e = catchValidation(() =>
      expireCsp(validExpireInput({ currentPhase: 'CSP_CLOSED_PROFIT' as never }))
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('Position is not in CSP_OPEN phase')
  })

  it('throws ValidationError with too_early when referenceDate is before expirationDate', () => {
    const e = catchValidation(() => expireCsp(validExpireInput({ referenceDate: '2025-01-16' })))
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('too_early')
    expect(e.message).toBe('Cannot record expiration before the expiration date')
  })
})

describe('recordAssignment', () => {
  type RecordAssignmentTestInput = {
    currentPhase: 'CSP_OPEN' | 'HOLDING_SHARES' | 'CC_OPEN'
    assignmentDate: string
    openFillDate: string
  }

  const recordAssignment = (
    lifecycle as typeof lifecycle & {
      recordAssignment?: (input: RecordAssignmentTestInput) => { phase: string }
    }
  ).recordAssignment

  function validAssignmentInput(
    overrides: Partial<RecordAssignmentTestInput> = {}
  ): RecordAssignmentTestInput {
    return {
      currentPhase: 'CSP_OPEN',
      assignmentDate: '2026-01-17',
      openFillDate: '2026-01-03',
      ...overrides
    }
  }

  it('returns HOLDING_SHARES for valid CSP_OPEN input', () => {
    const result = recordAssignment!(validAssignmentInput())
    expect(result.phase).toBe('HOLDING_SHARES')
  })

  it('throws invalid_phase when currentPhase is HOLDING_SHARES', () => {
    const e = catchValidation(() =>
      recordAssignment!(validAssignmentInput({ currentPhase: 'HOLDING_SHARES' }))
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('Assignment can only be recorded on a CSP_OPEN position')
  })

  it('throws invalid_phase when currentPhase is CC_OPEN', () => {
    const e = catchValidation(() =>
      recordAssignment!(validAssignmentInput({ currentPhase: 'CC_OPEN' }))
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('Assignment can only be recorded on a CSP_OPEN position')
  })

  it('throws date_before_open when assignmentDate is before openFillDate', () => {
    const e = catchValidation(() =>
      recordAssignment!(
        validAssignmentInput({
          assignmentDate: '2026-01-02',
          openFillDate: '2026-01-03'
        })
      )
    )
    expect(e.field).toBe('assignmentDate')
    expect(e.code).toBe('date_before_open')
    expect(e.message).toBe('Assignment date cannot be before the CSP open date')
  })

  it('succeeds when assignmentDate is a future date', () => {
    const result = recordAssignment!(
      validAssignmentInput({
        assignmentDate: '2099-01-01'
      })
    )
    expect(result.phase).toBe('HOLDING_SHARES')
  })

  it('succeeds when assignmentDate equals openFillDate', () => {
    const result = recordAssignment!(
      validAssignmentInput({
        assignmentDate: '2026-01-03',
        openFillDate: '2026-01-03'
      })
    )
    expect(result.phase).toBe('HOLDING_SHARES')
  })
})

// ---------------------------------------------------------------------------
// openCoveredCall
// ---------------------------------------------------------------------------

describe('openCoveredCall', () => {
  function validCcInput(overrides: Partial<OpenCoveredCallInput> = {}): OpenCoveredCallInput {
    return {
      currentPhase: 'HOLDING_SHARES',
      strike: '182.00',
      contracts: 1,
      positionContracts: 1,
      premiumPerContract: '2.30',
      fillDate: '2026-01-20',
      assignmentDate: '2026-01-17',
      referenceDate: '2026-03-20',
      expiration: '2026-04-17',
      ...overrides
    }
  }

  it('returns CC_OPEN when current phase is HOLDING_SHARES', () => {
    const result = openCoveredCall(validCcInput())
    expect(result.phase).toBe('CC_OPEN')
  })

  it('throws ValidationError when phase is CC_OPEN', () => {
    const e = catchValidation(() => openCoveredCall(validCcInput({ currentPhase: 'CC_OPEN' })))
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('A covered call is already open on this position')
  })

  it('throws ValidationError when phase is CSP_OPEN', () => {
    const e = catchValidation(() => openCoveredCall(validCcInput({ currentPhase: 'CSP_OPEN' })))
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('Position is not in HOLDING_SHARES phase')
  })

  it('throws ValidationError when contracts exceed position contracts', () => {
    const e = catchValidation(() =>
      openCoveredCall(validCcInput({ contracts: 2, positionContracts: 1 }))
    )
    expect(e.field).toBe('contracts')
    expect(e.code).toBe('exceeds_shares')
  })

  it('throws ValidationError when fill date is before assignment date', () => {
    const e = catchValidation(() =>
      openCoveredCall(validCcInput({ fillDate: '2026-01-16', assignmentDate: '2026-01-17' }))
    )
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('before_assignment')
  })

  it('throws ValidationError when fill date is in the future', () => {
    const e = catchValidation(() =>
      openCoveredCall(validCcInput({ fillDate: '2026-03-21', referenceDate: '2026-03-20' }))
    )
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('cannot_be_future')
  })

  it('throws ValidationError when strike is not positive', () => {
    const e = catchValidation(() => openCoveredCall(validCcInput({ strike: '0' })))
    expect(e.field).toBe('strike')
    expect(e.code).toBe('must_be_positive')
  })

  it('throws ValidationError when premium is not positive', () => {
    const e = catchValidation(() => openCoveredCall(validCcInput({ premiumPerContract: '0' })))
    expect(e.field).toBe('premiumPerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('throws ValidationError when expiration is before fill date', () => {
    const e = catchValidation(() =>
      openCoveredCall(validCcInput({ fillDate: '2026-01-20', expiration: '2026-01-19' }))
    )
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('before_fill_date')
  })

  it('accepts 0DTE — expiration equal to fillDate is valid', () => {
    const result = openCoveredCall(
      validCcInput({ expiration: '2026-01-20', fillDate: '2026-01-20' })
    )
    expect(result.phase).toBe('CC_OPEN')
  })
})

// ---------------------------------------------------------------------------
// closeCoveredCall
// ---------------------------------------------------------------------------

describe('closeCoveredCall', () => {
  function validCloseCcInput(
    overrides: Partial<CloseCoveredCallInput> = {}
  ): CloseCoveredCallInput {
    return {
      currentPhase: 'CC_OPEN',
      closePricePerContract: '1.10',
      openFillDate: '2026-01-20',
      fillDate: '2026-02-01',
      expiration: '2026-02-21',
      ...overrides
    }
  }

  it('throws ValidationError with field=__phase__, code=invalid_phase when currentPhase is HOLDING_SHARES', () => {
    const e = catchValidation(() =>
      closeCoveredCall(validCloseCcInput({ currentPhase: 'HOLDING_SHARES' }))
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('No open covered call on this position')
  })

  it('throws ValidationError with field=__phase__, code=invalid_phase when currentPhase is CSP_OPEN', () => {
    const e = catchValidation(() =>
      closeCoveredCall(validCloseCcInput({ currentPhase: 'CSP_OPEN' }))
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('No open covered call on this position')
  })

  it('throws ValidationError with field=closePricePerContract, code=must_be_positive when closePricePerContract is 0', () => {
    const e = catchValidation(() =>
      closeCoveredCall(validCloseCcInput({ closePricePerContract: '0' }))
    )
    expect(e.field).toBe('closePricePerContract')
    expect(e.code).toBe('must_be_positive')
    expect(e.message).toBe('Close price must be greater than zero')
  })

  it('throws ValidationError with field=closePricePerContract, code=must_be_positive when closePricePerContract is negative', () => {
    const e = catchValidation(() =>
      closeCoveredCall(validCloseCcInput({ closePricePerContract: '-1' }))
    )
    expect(e.field).toBe('closePricePerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('throws ValidationError with field=fillDate, code=close_date_before_open when fillDate is before openFillDate', () => {
    const e = catchValidation(() =>
      closeCoveredCall(validCloseCcInput({ fillDate: '2026-01-19', openFillDate: '2026-01-20' }))
    )
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('close_date_before_open')
    expect(e.message).toBe('Fill date cannot be before the CC open date')
  })

  it('throws ValidationError with field=fillDate, code=close_date_after_expiration when fillDate is after expiration', () => {
    const e = catchValidation(() =>
      closeCoveredCall(validCloseCcInput({ fillDate: '2026-02-22', expiration: '2026-02-21' }))
    )
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('close_date_after_expiration')
    expect(e.message).toContain('Record Expiry')
  })

  it('returns { phase: HOLDING_SHARES } for valid profit close (closePrice < openPremium)', () => {
    const result = closeCoveredCall(validCloseCcInput({ closePricePerContract: '1.10' }))
    expect(result.phase).toBe('HOLDING_SHARES')
  })

  it('returns { phase: HOLDING_SHARES } for valid loss close (closePrice > openPremium)', () => {
    const result = closeCoveredCall(validCloseCcInput({ closePricePerContract: '3.50' }))
    expect(result.phase).toBe('HOLDING_SHARES')
  })

  it('returns { phase: HOLDING_SHARES } when fillDate equals openFillDate (boundary)', () => {
    const result = closeCoveredCall(
      validCloseCcInput({ fillDate: '2026-01-20', openFillDate: '2026-01-20' })
    )
    expect(result.phase).toBe('HOLDING_SHARES')
  })

  it('returns { phase: HOLDING_SHARES } when fillDate equals expiration (boundary)', () => {
    const result = closeCoveredCall(
      validCloseCcInput({ fillDate: '2026-02-21', expiration: '2026-02-21' })
    )
    expect(result.phase).toBe('HOLDING_SHARES')
  })
})

// ---------------------------------------------------------------------------
// recordCallAway
// ---------------------------------------------------------------------------

describe('recordCallAway', () => {
  const recordCallAway = (
    lifecycle as typeof lifecycle & {
      recordCallAway?: (input: {
        currentPhase: string
        contracts: number
        fillDate: string
        ccOpenFillDate: string
      }) => { phase: string }
    }
  ).recordCallAway

  it('returns { phase: WHEEL_COMPLETE } when currentPhase is CC_OPEN and fillDate equals ccOpenFillDate', () => {
    const result = recordCallAway!({
      currentPhase: 'CC_OPEN',
      contracts: 1,
      fillDate: '2026-01-17',
      ccOpenFillDate: '2026-01-17'
    })
    expect(result.phase).toBe('WHEEL_COMPLETE')
  })

  it('throws ValidationError (invalid_phase) when currentPhase is HOLDING_SHARES', () => {
    const e = catchValidation(() =>
      recordCallAway!({
        currentPhase: 'HOLDING_SHARES',
        contracts: 1,
        fillDate: '2026-01-17',
        ccOpenFillDate: '2026-01-03'
      })
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('No open covered call on this position')
  })

  it('throws ValidationError (invalid_phase) when currentPhase is CSP_OPEN', () => {
    const e = catchValidation(() =>
      recordCallAway!({
        currentPhase: 'CSP_OPEN',
        contracts: 1,
        fillDate: '2026-01-17',
        ccOpenFillDate: '2026-01-03'
      })
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('No open covered call on this position')
  })

  it('throws ValidationError (multi_contract_unsupported) when contracts > 1', () => {
    const e = catchValidation(() =>
      recordCallAway!({
        currentPhase: 'CC_OPEN',
        contracts: 2,
        fillDate: '2026-01-17',
        ccOpenFillDate: '2026-01-03'
      })
    )
    expect(e.field).toBe('contracts')
    expect(e.code).toBe('multi_contract_unsupported')
    expect(e.message).toBe('Multi-contract call-away is not yet supported')
  })

  it('throws ValidationError (close_date_before_open) when fillDate is before ccOpenFillDate', () => {
    const e = catchValidation(() =>
      recordCallAway!({
        currentPhase: 'CC_OPEN',
        contracts: 1,
        fillDate: '2026-01-02',
        ccOpenFillDate: '2026-01-03'
      })
    )
    expect(e.field).toBe('fillDate')
    expect(e.code).toBe('close_date_before_open')
    expect(e.message).toBe('Fill date cannot be before the CC open date')
  })

  it('returns WHEEL_COMPLETE when fillDate is after ccOpenFillDate', () => {
    const result = recordCallAway!({
      currentPhase: 'CC_OPEN',
      contracts: 1,
      fillDate: '2026-01-17',
      ccOpenFillDate: '2026-01-03'
    })
    expect(result.phase).toBe('WHEEL_COMPLETE')
  })
})

// ---------------------------------------------------------------------------
// expireCc
// ---------------------------------------------------------------------------

describe('expireCc', () => {
  const BASE_EXPIRATION = '2026-02-21'

  function validExpireCcInput(overrides: Partial<ExpireCcInput> = {}): ExpireCcInput {
    return {
      currentPhase: 'CC_OPEN',
      expirationDate: BASE_EXPIRATION,
      referenceDate: BASE_EXPIRATION,
      ...overrides
    }
  }

  it('returns HOLDING_SHARES when referenceDate equals expirationDate (same-day boundary)', () => {
    const result = expireCc(validExpireCcInput())
    expect(result.phase).toBe('HOLDING_SHARES')
  })

  it('returns HOLDING_SHARES when referenceDate is after expirationDate', () => {
    const result = expireCc(validExpireCcInput({ referenceDate: '2026-02-22' }))
    expect(result.phase).toBe('HOLDING_SHARES')
  })

  it('throws ValidationError with invalid_phase when currentPhase is not CC_OPEN', () => {
    const e = catchValidation(() =>
      expireCc(validExpireCcInput({ currentPhase: 'HOLDING_SHARES' }))
    )
    expect(e.field).toBe('__phase__')
    expect(e.code).toBe('invalid_phase')
    expect(e.message).toBe('No open covered call on this position')
  })

  it('throws ValidationError with too_early when referenceDate is before expirationDate', () => {
    const e = catchValidation(() => expireCc(validExpireCcInput({ referenceDate: '2026-02-19' })))
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('too_early')
    expect(e.message).toBe('Cannot record expiration before the expiration date (2026-02-21)')
  })

  it('throws too_early when referenceDate is one day before expirationDate (boundary case)', () => {
    const e = catchValidation(() => expireCc(validExpireCcInput({ referenceDate: '2026-02-20' })))
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('too_early')
    expect(e.message).toBe('Cannot record expiration before the expiration date (2026-02-21)')
  })

  it('does NOT throw when referenceDate equals expirationDate exactly (boundary passing)', () => {
    expect(() => expireCc(validExpireCcInput({ referenceDate: '2026-02-21' }))).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// rollCsp
// ---------------------------------------------------------------------------

describe('rollCsp', () => {
  const { rollCsp } = lifecycle as typeof lifecycle & {
    rollCsp: (input: RollCspInput) => { phase: string }
  }

  function validRollCspInput(overrides: Partial<RollCspInput> = {}): RollCspInput {
    return {
      currentPhase: 'CSP_OPEN',
      currentExpiration: NEXT_MONTH,
      newExpiration: isoDate(60),
      costToClosePerContract: '1.20',
      newPremiumPerContract: '2.80',
      ...overrides
    }
  }

  it('returns { phase: CSP_OPEN } for valid input', () => {
    const result = rollCsp(validRollCspInput())
    expect(result.phase).toBe('CSP_OPEN')
  })

  it('throws ValidationError with field=newExpiration, code=must_be_after_current when newExpiration equals currentExpiration', () => {
    const e = catchValidation(() =>
      rollCsp(validRollCspInput({ currentExpiration: NEXT_MONTH, newExpiration: NEXT_MONTH }))
    )
    expect(e.field).toBe('newExpiration')
    expect(e.code).toBe('must_be_after_current')
  })

  it('throws ValidationError with field=newExpiration, code=must_be_after_current when newExpiration is before currentExpiration', () => {
    const e = catchValidation(() =>
      rollCsp(validRollCspInput({ currentExpiration: NEXT_MONTH, newExpiration: YESTERDAY }))
    )
    expect(e.field).toBe('newExpiration')
    expect(e.code).toBe('must_be_after_current')
  })

  it('throws ValidationError with field=costToClosePerContract, code=must_be_positive when value is 0', () => {
    const e = catchValidation(() => rollCsp(validRollCspInput({ costToClosePerContract: '0' })))
    expect(e.field).toBe('costToClosePerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('throws ValidationError with field=newPremiumPerContract, code=must_be_positive when value is 0', () => {
    const e = catchValidation(() => rollCsp(validRollCspInput({ newPremiumPerContract: '0' })))
    expect(e.field).toBe('newPremiumPerContract')
    expect(e.code).toBe('must_be_positive')
  })

  describe('phase rejection', () => {
    it.each([
      'HOLDING_SHARES',
      'CC_OPEN',
      'CSP_EXPIRED',
      'CSP_CLOSED_PROFIT',
      'CSP_CLOSED_LOSS',
      'CC_EXPIRED',
      'CC_CLOSED_PROFIT',
      'CC_CLOSED_LOSS',
      'WHEEL_COMPLETE'
    ])('throws invalid_phase when currentPhase is %s', (phase) => {
      const e = catchValidation(() => rollCsp(validRollCspInput({ currentPhase: phase as never })))
      expect(e.field).toBe('__phase__')
      expect(e.code).toBe('invalid_phase')
      expect(e.message).toBe('Position is not in CSP_OPEN phase')
    })
  })
})

// ---------------------------------------------------------------------------
// rollCc
// ---------------------------------------------------------------------------

describe('rollCc', () => {
  function validRollCcInput(overrides: Partial<RollCcInput> = {}): RollCcInput {
    return {
      currentPhase: 'CC_OPEN',
      currentStrike: '185.00',
      currentExpiration: '2026-04-18',
      newStrike: '190.00',
      newExpiration: '2026-05-16',
      costToClosePerContract: '2.50',
      newPremiumPerContract: '3.00',
      ...overrides
    }
  }

  it('throws must_be_on_or_after_current when newExpiration is before currentExpiration', () => {
    const e = catchValidation(() =>
      rollCc(
        validRollCcInput({
          currentExpiration: '2026-04-18',
          newExpiration: '2026-03-01'
        })
      )
    )
    expect(e.field).toBe('newExpiration')
    expect(e.code).toBe('must_be_on_or_after_current')
  })

  it('accepts same expiration (>= not >)', () => {
    const result = rollCc(
      validRollCcInput({
        currentExpiration: '2026-04-18',
        newExpiration: '2026-04-18',
        currentStrike: '185.00',
        newStrike: '190.00'
      })
    )
    expect(result.phase).toBe('CC_OPEN')
  })

  it('throws no_change when strike and expiration are both unchanged', () => {
    const e = catchValidation(() =>
      rollCc(
        validRollCcInput({
          currentStrike: '185.00',
          newStrike: '185.00',
          currentExpiration: '2026-04-18',
          newExpiration: '2026-04-18'
        })
      )
    )
    expect(e.field).toBe('__roll__')
    expect(e.code).toBe('no_change')
  })

  it('throws must_be_positive when costToClosePerContract is 0', () => {
    const e = catchValidation(() => rollCc(validRollCcInput({ costToClosePerContract: '0' })))
    expect(e.field).toBe('costToClosePerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('throws must_be_positive when newPremiumPerContract is 0', () => {
    const e = catchValidation(() => rollCc(validRollCcInput({ newPremiumPerContract: '0' })))
    expect(e.field).toBe('newPremiumPerContract')
    expect(e.code).toBe('must_be_positive')
  })

  it('returns { phase: CC_OPEN } on valid roll up and out', () => {
    const result = rollCc(
      validRollCcInput({
        currentStrike: '185.00',
        newStrike: '190.00',
        currentExpiration: '2026-04-18',
        newExpiration: '2026-05-16',
        costToClosePerContract: '2.50',
        newPremiumPerContract: '3.00'
      })
    )
    expect(result.phase).toBe('CC_OPEN')
  })

  it('returns { phase: CC_OPEN } on roll up (same expiration, higher strike)', () => {
    const result = rollCc(
      validRollCcInput({
        currentStrike: '185.00',
        newStrike: '190.00',
        currentExpiration: '2026-04-18',
        newExpiration: '2026-04-18'
      })
    )
    expect(result.phase).toBe('CC_OPEN')
  })

  it('returns { phase: CC_OPEN } on roll down (same expiration, lower strike)', () => {
    const result = rollCc(
      validRollCcInput({
        currentStrike: '185.00',
        newStrike: '180.00',
        currentExpiration: '2026-04-18',
        newExpiration: '2026-04-18'
      })
    )
    expect(result.phase).toBe('CC_OPEN')
  })

  it('returns { phase: CC_OPEN } on roll out (same strike, later expiration)', () => {
    const result = rollCc(
      validRollCcInput({
        currentStrike: '185.00',
        newStrike: '185.00',
        currentExpiration: '2026-04-18',
        newExpiration: '2026-05-16'
      })
    )
    expect(result.phase).toBe('CC_OPEN')
  })

  describe('phase rejection', () => {
    it.each([
      'CSP_OPEN',
      'HOLDING_SHARES',
      'CSP_EXPIRED',
      'CSP_CLOSED_PROFIT',
      'CSP_CLOSED_LOSS',
      'CC_EXPIRED',
      'CC_CLOSED_PROFIT',
      'CC_CLOSED_LOSS',
      'WHEEL_COMPLETE'
    ])('throws invalid_phase when currentPhase is %s', (phase) => {
      const e = catchValidation(() => rollCc(validRollCcInput({ currentPhase: phase as never })))
      expect(e.field).toBe('__phase__')
      expect(e.code).toBe('invalid_phase')
    })
  })
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function catchValidation(fn: () => unknown): ValidationError {
  try {
    fn()
    throw new Error('Expected ValidationError but none was thrown')
  } catch (e) {
    if (e instanceof ValidationError) return e
    throw e
  }
}

// ---------------------------------------------------------------------------
// openPmcc
// ---------------------------------------------------------------------------

describe('openPmcc', () => {
  const LONG: OpenPmccLegInput = {
    underlying: 'XYZ',
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: '80',
    expiration: '2027-09-17',
    contracts: 1,
    fillPrice: '25.00',
    fillDate: '2026-09-14',
    fees: '0'
  }
  const SHORT: OpenPmccLegInput = {
    ...LONG,
    strike: '110',
    expiration: '2026-10-16',
    fillPrice: '2.00'
  }

  function validPmccInput(
    overrides: {
      ticker?: string
      referenceDate?: string
      long?: Partial<OpenPmccLegInput>
      short?: Partial<OpenPmccLegInput>
    } = {}
  ): OpenPmccInput {
    return {
      ticker: overrides.ticker ?? 'XYZ',
      referenceDate: overrides.referenceDate ?? '2026-09-14',
      long: { ...LONG, ...overrides.long },
      short: { ...SHORT, ...overrides.short }
    }
  }

  it('opens a PMCC for the valid fixture', () => {
    expect(openPmcc(validPmccInput())).toEqual({ phase: 'PMCC_OPEN' })
  })

  const TICKER_MSG = 'Ticker must be 1–5 uppercase letters'
  const UNDERLYING_MSG = 'Both calls must have the same underlying.'
  const CALL_MSG = 'PMCC entry requires two call options.'
  const DELIVERABLE_MSG = 'This entry supports standard 100-share contracts only.'
  const CONTRACTS_MSG = 'Contracts must be a positive whole number.'
  const QUANTITY_MSG = 'Opening quantities must match for this PMCC entry.'
  const STRIKE_MSG = 'Strike must be positive'
  const FILL_MSG = 'Actual fill price must be greater than zero.'
  const FEES_MSG = 'Fees cannot be negative.'
  const FUTURE_MSG = 'Fill date cannot be in the future.'
  const LONG_AFTER_SHORT_MSG = 'LEAPS must be acquired no later than the short-call fill.'
  const EXP_AFTER_FILL_MSG = 'Expiration must be after the fill date.'
  const EXPIRED_MSG = 'Use an unexpired contract for opening a current position.'
  const SHORT_BEFORE_LONG_MSG = 'Short call must expire before the LEAPS call.'
  const STRIKE_ABOVE_MSG = 'Short-call strike must be above the LEAPS strike.'
  const NET_DEBIT_MSG = 'This PMCC entry requires a net debit before fees.'

  it.each<[string, Parameters<typeof validPmccInput>[0], string, string, string]>([
    ['1: lowercase ticker', { ticker: 'xyz' }, 'ticker', 'invalid_format', TICKER_MSG],
    ['1: six-letter ticker', { ticker: 'ABCDEF' }, 'ticker', 'invalid_format', TICKER_MSG],
    [
      '2: long underlying differs',
      { long: { underlying: 'ABC' } },
      'long.underlying',
      'underlying_mismatch',
      UNDERLYING_MSG
    ],
    [
      '2: short underlying differs',
      { short: { underlying: 'ABC' } },
      'short.underlying',
      'underlying_mismatch',
      UNDERLYING_MSG
    ],
    [
      '3: long is a put',
      { long: { instrumentType: 'PUT' } },
      'long.instrumentType',
      'not_a_call',
      CALL_MSG
    ],
    [
      '3: short is a put',
      { short: { instrumentType: 'PUT' } },
      'short.instrumentType',
      'not_a_call',
      CALL_MSG
    ],
    [
      '4: long deliverable 50',
      { long: { deliverableShares: 50 } },
      'long.deliverableShares',
      'nonstandard_deliverable',
      DELIVERABLE_MSG
    ],
    [
      '4: short deliverable 50',
      { short: { deliverableShares: 50 } },
      'short.deliverableShares',
      'nonstandard_deliverable',
      DELIVERABLE_MSG
    ],
    [
      '5: long contracts 0',
      { long: { contracts: 0 } },
      'long.contracts',
      'must_be_positive_integer',
      CONTRACTS_MSG
    ],
    [
      '5: short contracts 1.5',
      { short: { contracts: 1.5 } },
      'short.contracts',
      'must_be_positive_integer',
      CONTRACTS_MSG
    ],
    [
      '6: long 1 / short 2 contracts',
      { short: { contracts: 2 } },
      'short.contracts',
      'quantity_mismatch',
      QUANTITY_MSG
    ],
    ['7: long strike 0', { long: { strike: '0' } }, 'long.strike', 'must_be_positive', STRIKE_MSG],
    [
      '7: short strike -1',
      { short: { strike: '-1' } },
      'short.strike',
      'must_be_positive',
      STRIKE_MSG
    ],
    [
      '8: long fill price 0',
      { long: { fillPrice: '0' } },
      'long.fillPrice',
      'must_be_positive',
      FILL_MSG
    ],
    [
      '8: short fill price -1',
      { short: { fillPrice: '-1' } },
      'short.fillPrice',
      'must_be_positive',
      FILL_MSG
    ],
    ['9: long fees -1', { long: { fees: '-1' } }, 'long.fees', 'must_be_non_negative', FEES_MSG],
    ['9: short fees -1', { short: { fees: '-1' } }, 'short.fees', 'must_be_non_negative', FEES_MSG],
    [
      '10: long fill after reference date',
      { long: { fillDate: '2026-09-15' } },
      'long.fillDate',
      'cannot_be_future',
      FUTURE_MSG
    ],
    [
      '10: short fill after reference date',
      { short: { fillDate: '2026-09-15' } },
      'short.fillDate',
      'cannot_be_future',
      FUTURE_MSG
    ],
    [
      '11: long fill after short fill',
      { short: { fillDate: '2026-09-13' } },
      'short.fillDate',
      'long_after_short',
      LONG_AFTER_SHORT_MSG
    ],
    [
      '12: long expiration equals its fill date',
      { long: { expiration: '2026-09-14' } },
      'long.expiration',
      'expiration_not_after_fill',
      EXP_AFTER_FILL_MSG
    ],
    [
      '12: short expiration equals its fill date',
      { short: { expiration: '2026-09-14' } },
      'short.expiration',
      'expiration_not_after_fill',
      EXP_AFTER_FILL_MSG
    ],
    [
      '13: long expiration before reference date',
      {
        long: { fillDate: '2026-09-01', expiration: '2026-09-10' },
        short: { fillDate: '2026-09-01' }
      },
      'long.expiration',
      'expired_contract',
      EXPIRED_MSG
    ],
    [
      '13: short expiration before reference date',
      {
        long: { fillDate: '2026-09-01' },
        short: { fillDate: '2026-09-01', expiration: '2026-09-10' }
      },
      'short.expiration',
      'expired_contract',
      EXPIRED_MSG
    ],
    [
      '13 before 12: long expiration before a fill date equal to the reference date',
      { long: { expiration: '2026-09-11' } },
      'long.expiration',
      'expired_contract',
      EXPIRED_MSG
    ],
    [
      '13 before 12: short expiration before a fill date equal to the reference date',
      { short: { expiration: '2026-09-11' } },
      'short.expiration',
      'expired_contract',
      EXPIRED_MSG
    ],
    [
      '14: short expiration equals LEAPS expiration',
      { short: { expiration: '2027-09-17' } },
      'short.expiration',
      'short_not_before_long',
      SHORT_BEFORE_LONG_MSG
    ],
    [
      '14: short expiration after LEAPS expiration',
      { short: { expiration: '2027-10-15' } },
      'short.expiration',
      'short_not_before_long',
      SHORT_BEFORE_LONG_MSG
    ],
    [
      '15: short strike below LEAPS strike',
      { short: { strike: '75' } },
      'short.strike',
      'strike_not_above_long',
      STRIKE_ABOVE_MSG
    ],
    [
      '15: short strike equals LEAPS strike',
      { short: { strike: '80' } },
      'short.strike',
      'strike_not_above_long',
      STRIKE_ABOVE_MSG
    ],
    [
      '16: short fill equals LEAPS fill',
      { short: { fillPrice: '25.00' } },
      '__pair__',
      'not_net_debit',
      NET_DEBIT_MSG
    ],
    [
      '16: short fill above LEAPS fill',
      { short: { fillPrice: '26.00' } },
      '__pair__',
      'not_net_debit',
      NET_DEBIT_MSG
    ]
  ])('rule %s', (_name, overrides, field, code, message) => {
    const e = catchValidation(() => openPmcc(validPmccInput(overrides)))
    expect(e.field).toBe(field)
    expect(e.code).toBe(code)
    expect(e.message).toBe(message)
  })

  it('reports the strike rule before the net-debit rule when both are broken', () => {
    const e = catchValidation(() =>
      openPmcc(validPmccInput({ short: { strike: '75', fillPrice: '26.00' } }))
    )
    expect(e.field).toBe('short.strike')
    expect(e.code).toBe('strike_not_above_long')
  })

  it('orders ISO dates across a year boundary by string comparison', () => {
    const acrossYears = validPmccInput({
      referenceDate: '2027-01-02',
      long: { fillDate: '2026-12-31', expiration: '2028-01-21' },
      short: { fillDate: '2027-01-02', expiration: '2027-01-15' }
    })
    expect(openPmcc(acrossYears)).toEqual({ phase: 'PMCC_OPEN' })

    const e = catchValidation(() =>
      openPmcc({
        ...acrossYears,
        long: { ...acrossYears.long, fillDate: '2027-01-02' },
        short: { ...acrossYears.short, fillDate: '2026-12-31' }
      })
    )
    expect(e.code).toBe('long_after_short')
  })
})

// ---------------------------------------------------------------------------
// [US-104] rollPmccShortCall
// ---------------------------------------------------------------------------

describe('requirePmccOpenPhase', () => {
  it('accepts PMCC_OPEN', () => {
    expect(() => requirePmccOpenPhase('PMCC_OPEN')).not.toThrow()
  })

  it('rejects any other phase with the PMCC_OPEN phase error', () => {
    const e = catchValidation(() => requirePmccOpenPhase('CC_OPEN'))
    expect({ field: e.field, code: e.code, message: e.message }).toEqual({
      field: '__phase__',
      code: 'invalid_phase',
      message: 'Position is not in PMCC_OPEN phase'
    })
  })
})

describe('rollPmccShortCall', () => {
  function validInput(overrides: Partial<RollPmccShortCallInput> = {}): RollPmccShortCallInput {
    return {
      currentPhase: 'PMCC_OPEN',
      openShort: { strike: '108.0000', expiration: '2026-11-20', fillDate: '2026-10-01' },
      leapsExpiration: '2027-09-17',
      fillDate: '2026-11-13',
      newStrike: '112.0000',
      newExpiration: '2026-12-18',
      costToClosePerContract: '3.0000',
      newPremiumPerContract: '2.4000',
      ...overrides
    }
  }

  function expectRejection(
    input: RollPmccShortCallInput,
    expected: { field: string; code: string; message?: string }
  ): void {
    const e = catchValidation(() => rollPmccShortCall(input))
    expect({ field: e.field, code: e.code, message: e.message }).toMatchObject(expected)
  }

  describe('accepts', () => {
    it('a roll up & out paid as a debit, returning the validated short and new strike', () => {
      expect(rollPmccShortCall(validInput())).toEqual({
        phase: 'PMCC_OPEN',
        openShort: { strike: '108.0000', expiration: '2026-11-20', fillDate: '2026-10-01' },
        newStrike: '112.0000'
      })
    })

    it('a roll filled on the day the short call opened', () => {
      expect(rollPmccShortCall(validInput({ fillDate: '2026-10-01' })).phase).toBe('PMCC_OPEN')
    })

    it('a roll filled on the day the short call expires', () => {
      expect(rollPmccShortCall(validInput({ fillDate: '2026-11-20' })).phase).toBe('PMCC_OPEN')
    })

    it("returns the caller's own open short, extra fields included", () => {
      const openShort = {
        strike: '108.0000',
        expiration: '2026-11-20',
        fillDate: '2026-10-01',
        contracts: 2
      }
      expect(rollPmccShortCall(validInput({ openShort })).openShort).toBe(openShort)
    })

    it('a roll out with the new strike omitted keeps the current strike', () => {
      expect(rollPmccShortCall(validInput({ newStrike: undefined })).newStrike).toBe('108.0000')
    })

    it('a roll out at the same strike', () => {
      expect(
        rollPmccShortCall(
          validInput({
            newStrike: '108.0000',
            newExpiration: '2026-12-18',
            costToClosePerContract: '1.1000',
            newPremiumPerContract: '2.3000'
          })
        )
      ).toMatchObject({ phase: 'PMCC_OPEN', newStrike: '108.0000' })
    })

    it('a roll up at the same expiration', () => {
      expect(
        rollPmccShortCall(validInput({ newStrike: '112.0000', newExpiration: '2026-11-20' }))
      ).toMatchObject({ phase: 'PMCC_OPEN', newStrike: '112.0000' })
    })
  })

  describe('rejects', () => {
    it('a position that is not PMCC_OPEN', () => {
      expectRejection(validInput({ currentPhase: 'CC_OPEN' }), {
        field: '__phase__',
        code: 'invalid_phase',
        message: 'Position is not in PMCC_OPEN phase'
      })
    })

    it('a PMCC with no open short call', () => {
      expectRejection(validInput({ openShort: null }), {
        field: '__root__',
        code: 'no_open_short_call',
        message: 'This PMCC has no open short call to roll.'
      })
    })

    it('a roll filled before the open short call was filled', () => {
      expectRejection(validInput({ fillDate: '2026-09-30' }), {
        field: 'fillDate',
        code: 'close_date_before_open',
        message: 'Fill date cannot be before the short call open date'
      })
    })

    it('a roll filled after the open short call expired', () => {
      expectRejection(validInput({ fillDate: '2026-11-21' }), {
        field: 'fillDate',
        code: 'close_date_after_expiration',
        message: 'Fill date cannot be after the short call expiration date'
      })
    })

    it('a zero cost to close', () => {
      expectRejection(validInput({ costToClosePerContract: '0.0000' }), {
        field: 'costToClosePerContract',
        code: 'must_be_positive',
        message: 'Cost to close must be greater than zero'
      })
    })

    it('a zero replacement premium', () => {
      expectRejection(validInput({ newPremiumPerContract: '0.0000' }), {
        field: 'newPremiumPerContract',
        code: 'must_be_positive',
        message: 'Replacement premium must be greater than zero'
      })
    })

    it('a zero replacement strike', () => {
      expectRejection(validInput({ newStrike: '0.0000' }), {
        field: 'newStrike',
        code: 'must_be_positive'
      })
    })

    it.each(['2027-09-17', '2027-10-15'])(
      'a replacement expiring on or after the LEAPS (%s)',
      (newExpiration) => {
        expectRejection(validInput({ newExpiration }), {
          field: 'newExpiration',
          code: 'short_not_before_long',
          message: 'Short call must expire before the LEAPS call.'
        })
      }
    )

    it('a replacement expiring before the current short call', () => {
      expectRejection(validInput({ newExpiration: '2026-11-13' }), {
        field: 'newExpiration',
        code: 'must_be_on_or_after_current',
        message: 'Replacement expiration must be on or after the current expiration (Nov 20, 2026)'
      })
    })

    // With the fill on/before the current expiration and the replacement on/after it, the
    // replacement can only fail this rule by sharing the fill date with the current expiration.
    it('a replacement expiring on the roll fill date', () => {
      expectRejection(validInput({ fillDate: '2026-11-20', newExpiration: '2026-11-20' }), {
        field: 'newExpiration',
        code: 'expiration_not_after_fill',
        message: 'Expiration must be after the fill date.'
      })
    })

    it('a roll that changes neither strike nor expiration', () => {
      expectRejection(validInput({ newStrike: '108.0000', newExpiration: '2026-11-20' }), {
        field: '__roll__',
        code: 'no_change',
        message: 'Roll must change the strike, the expiration, or both'
      })
    })

    it('an omitted new strike at the current expiration', () => {
      expectRejection(validInput({ newStrike: undefined, newExpiration: '2026-11-20' }), {
        field: '__roll__',
        code: 'no_change'
      })
    })

    it('an unchanged strike written at a different scale', () => {
      expectRejection(validInput({ newStrike: '108', newExpiration: '2026-11-20' }), {
        field: '__roll__',
        code: 'no_change'
      })
    })
  })

  describe('rule order', () => {
    it('reports the phase before a missing short call', () => {
      expectRejection(validInput({ currentPhase: 'CC_OPEN', openShort: null }), {
        field: '__phase__',
        code: 'invalid_phase'
      })
    })

    it('reports a missing short call before the fill date', () => {
      expectRejection(validInput({ openShort: null, fillDate: '2000-01-01' }), {
        field: '__root__',
        code: 'no_open_short_call'
      })
    })

    it('reports the fill date before the cost to close', () => {
      expectRejection(validInput({ fillDate: '2026-09-30', costToClosePerContract: '0' }), {
        field: 'fillDate',
        code: 'close_date_before_open'
      })
    })

    it('reports the open-date rule before the fill-after-expiration rule', () => {
      expectRejection(
        validInput({
          openShort: { strike: '108.0000', expiration: '2026-09-25', fillDate: '2026-10-01' },
          fillDate: '2026-09-28'
        }),
        { field: 'fillDate', code: 'close_date_before_open' }
      )
    })

    it('reports the fill-after-expiration rule before the cost to close', () => {
      expectRejection(validInput({ fillDate: '2026-11-21', costToClosePerContract: '0' }), {
        field: 'fillDate',
        code: 'close_date_after_expiration'
      })
    })

    it('reports the fill-after-expiration rule before the expiration-after-fill rule', () => {
      expectRejection(validInput({ fillDate: '2026-12-01', newExpiration: '2026-11-27' }), {
        field: 'fillDate',
        code: 'close_date_after_expiration'
      })
    })

    it('reports the cost to close before the coverage rule', () => {
      expectRejection(validInput({ costToClosePerContract: '0', newExpiration: '2027-09-17' }), {
        field: 'costToClosePerContract',
        code: 'must_be_positive'
      })
    })

    it('reports the coverage rule before the expiration-after-fill rule', () => {
      expectRejection(
        validInput({
          openShort: { strike: '108.0000', expiration: '2027-10-01', fillDate: '2026-10-01' },
          fillDate: '2027-10-01',
          newExpiration: '2027-09-17'
        }),
        { field: 'newExpiration', code: 'short_not_before_long' }
      )
    })

    it('reports the on/after-current rule before the expiration-after-fill rule', () => {
      expectRejection(validInput({ fillDate: '2026-11-18', newExpiration: '2026-11-13' }), {
        field: 'newExpiration',
        code: 'must_be_on_or_after_current'
      })
    })

    it('reports the expiration-after-fill rule before no-change', () => {
      expectRejection(
        validInput({ fillDate: '2026-11-20', newStrike: '108.0000', newExpiration: '2026-11-20' }),
        { field: 'newExpiration', code: 'expiration_not_after_fill' }
      )
    })

    it('reports the coverage rule before no-change', () => {
      expectRejection(
        validInput({
          openShort: { strike: '108.0000', expiration: '2027-09-17', fillDate: '2026-10-01' },
          newStrike: '108.0000',
          newExpiration: '2027-09-17'
        }),
        { field: 'newExpiration', code: 'short_not_before_long' }
      )
    })
  })
})

// [US-105] Roll the LEAPS of a PMCC — research.md § ADR "`rollPmccLeaps`" rule table.
describe('rollPmccLeaps', () => {
  function validInput(overrides: Partial<RollPmccLeapsInput> = {}): RollPmccLeapsInput {
    return {
      currentPhase: 'PMCC_OPEN',
      currentLeaps: { strike: '80.0000', expiration: '2027-09-17' },
      openShort: { strike: '112.0000', expiration: '2027-07-16' },
      lastEventDate: '2027-06-18',
      fillDate: '2027-07-09',
      newStrike: '85.0000',
      newExpiration: '2028-01-21',
      proceedsPerContract: '26.0000',
      replacementDebitPerContract: '23.5000',
      ...overrides
    }
  }

  function expectRejection(
    input: RollPmccLeapsInput,
    expected: { field: string; code: string; message?: string }
  ): void {
    const e = catchValidation(() => rollPmccLeaps(input))
    expect({ field: e.field, code: e.code, message: e.message }).toMatchObject(expected)
  }

  const STRIKE_BELOW_SHORT_MESSAGE = 'LEAPS strike must be below the short-call strike ($112.00).'
  const NO_CHANGE = {
    field: '__roll__',
    code: 'no_change',
    message: 'Roll must change the strike, the expiration, or both'
  }

  describe('accepts', () => {
    it('a roll up & out', () => {
      expect(rollPmccLeaps(validInput())).toEqual({ phase: 'PMCC_OPEN' })
    })

    it('a roll out at the same strike paid as a debit', () => {
      expect(
        rollPmccLeaps(
          validInput({
            newStrike: '80.0000',
            newExpiration: '2028-01-21',
            proceedsPerContract: '26.0000',
            replacementDebitPerContract: '29.2000'
          })
        )
      ).toEqual({ phase: 'PMCC_OPEN' })
    })

    it('a replacement expiring before the current LEAPS but after the short call', () => {
      expect(
        rollPmccLeaps(
          validInput({
            newStrike: '80.0000',
            newExpiration: '2027-08-20',
            proceedsPerContract: '26.0000',
            replacementDebitPerContract: '26.6000'
          })
        )
      ).toEqual({ phase: 'PMCC_OPEN' })
    })

    it('a roll up at the same expiration', () => {
      expect(rollPmccLeaps(validInput({ newExpiration: '2027-09-17' }))).toEqual({
        phase: 'PMCC_OPEN'
      })
    })
  })

  describe('rejects', () => {
    it('a position that is not PMCC_OPEN', () => {
      expectRejection(validInput({ currentPhase: 'CC_OPEN' }), {
        field: '__phase__',
        code: 'invalid_phase',
        message: 'Position is not in PMCC_OPEN phase'
      })
    })

    it('zero proceeds from close', () => {
      expectRejection(validInput({ proceedsPerContract: '0.0000' }), {
        field: 'proceedsPerContract',
        code: 'must_be_positive',
        message: 'Proceeds from close must be greater than zero'
      })
    })

    it('a zero replacement debit', () => {
      expectRejection(validInput({ replacementDebitPerContract: '0.0000' }), {
        field: 'replacementDebitPerContract',
        code: 'must_be_positive',
        message: 'Replacement debit must be greater than zero'
      })
    })

    it('a zero replacement strike', () => {
      expectRejection(validInput({ newStrike: '0.0000' }), {
        field: 'newStrike',
        code: 'must_be_positive',
        message: 'Strike must be positive'
      })
    })

    it.each(['2027-07-16', '2027-07-02'])(
      'a replacement expiring on or before the open short call (%s)',
      (newExpiration) => {
        expectRejection(validInput({ newExpiration }), {
          field: 'newExpiration',
          code: 'long_not_after_short',
          message: 'LEAPS call must expire after the short call.'
        })
      }
    )

    it.each(['112.0000', '115.0000'])(
      'a replacement strike at or above the open short strike (%s)',
      (newStrike) => {
        expectRejection(validInput({ newStrike }), {
          field: 'newStrike',
          code: 'strike_not_below_short',
          message: STRIKE_BELOW_SHORT_MESSAGE
        })
      }
    )

    it('a roll that changes neither strike nor expiration', () => {
      expectRejection(validInput({ newStrike: '80.0000', newExpiration: '2027-09-17' }), NO_CHANGE)
    })

    it('a fill date before the last recorded event', () => {
      expectRejection(validInput({ fillDate: '2027-06-17' }), {
        field: 'fillDate',
        code: 'before_last_event',
        message: 'Fill date cannot be before the last recorded event (Jun 18, 2027)'
      })
    })

    it('a fill date before the LEAPS was filled, as before the last recorded event', () => {
      expectRejection(validInput({ lastEventDate: '2026-09-14', fillDate: '2026-09-13' }), {
        field: 'fillDate',
        code: 'before_last_event',
        message: 'Fill date cannot be before the last recorded event (Sep 14, 2026)'
      })
    })

    it('a fill date after the LEAPS expired', () => {
      expectRejection(validInput({ openShort: null, fillDate: '2027-09-18' }), {
        field: 'fillDate',
        code: 'close_date_after_expiration',
        message: 'Fill date cannot be after the LEAPS expiration date'
      })
    })

    it('with no short open, a replacement expiring on the roll fill date', () => {
      expectRejection(validInput({ openShort: null, newExpiration: '2027-07-09' }), {
        field: 'newExpiration',
        code: 'expiration_not_after_fill',
        message: 'Expiration must be after the fill date.'
      })
    })

    it('an unchanged strike written at a different scale', () => {
      expectRejection(validInput({ newStrike: '80', newExpiration: '2027-09-17' }), NO_CHANGE)
    })
  })

  describe('rule order', () => {
    it('reports the phase before the proceeds', () => {
      expectRejection(validInput({ currentPhase: 'CC_OPEN', proceedsPerContract: '0' }), {
        field: '__phase__',
        code: 'invalid_phase'
      })
    })

    it('reports the proceeds before the coverage rule', () => {
      expectRejection(validInput({ proceedsPerContract: '0', newExpiration: '2027-07-16' }), {
        field: 'proceedsPerContract',
        code: 'must_be_positive'
      })
    })

    it('reports the proceeds before the replacement debit', () => {
      expectRejection(validInput({ proceedsPerContract: '0', replacementDebitPerContract: '0' }), {
        field: 'proceedsPerContract',
        code: 'must_be_positive'
      })
    })

    it('reports the replacement debit before a non-positive strike', () => {
      expectRejection(validInput({ replacementDebitPerContract: '0', newStrike: '0' }), {
        field: 'replacementDebitPerContract',
        code: 'must_be_positive'
      })
    })

    it('reports a non-positive strike before the coverage rule', () => {
      expectRejection(validInput({ newStrike: '0', newExpiration: '2027-07-16' }), {
        field: 'newStrike',
        code: 'must_be_positive'
      })
    })

    it('reports a non-positive strike before the fill-date rule', () => {
      expectRejection(validInput({ newStrike: '0', fillDate: '2026-09-01' }), {
        field: 'newStrike',
        code: 'must_be_positive'
      })
    })

    it('reports the proceeds before the fill-date rule', () => {
      expectRejection(validInput({ proceedsPerContract: '0', fillDate: '2026-09-01' }), {
        field: 'proceedsPerContract',
        code: 'must_be_positive'
      })
    })

    it('reports the fill-date rule before the coverage rule', () => {
      expectRejection(validInput({ fillDate: '2026-09-01', newExpiration: '2027-07-16' }), {
        field: 'fillDate',
        code: 'before_last_event'
      })
    })

    it('reports the strike rule before an expiration on/before the fill', () => {
      expectRejection(
        validInput({ fillDate: '2027-09-17', newStrike: '112.0000', newExpiration: '2027-09-17' }),
        { field: 'newStrike', code: 'strike_not_below_short' }
      )
    })

    it('reports the coverage rule before the strike rule', () => {
      expectRejection(validInput({ newExpiration: '2027-07-16', newStrike: '112.0000' }), {
        field: 'newExpiration',
        code: 'long_not_after_short'
      })
    })

    it('reports the strike rule at the current expiration, not no-change', () => {
      expectRejection(validInput({ newStrike: '112.0000', newExpiration: '2027-09-17' }), {
        field: 'newStrike',
        code: 'strike_not_below_short'
      })
    })

    it('reports the strike rule before no-change for an unchanged LEAPS', () => {
      expectRejection(
        validInput({
          openShort: { strike: '80.0000', expiration: '2027-07-16' },
          newStrike: '80.0000',
          newExpiration: '2027-09-17'
        }),
        { field: 'newStrike', code: 'strike_not_below_short' }
      )
    })

    it('reports the coverage rule before no-change for an unchanged LEAPS', () => {
      expectRejection(
        validInput({
          currentLeaps: { strike: '80.0000', expiration: '2027-07-16' },
          newStrike: '80.0000',
          newExpiration: '2027-07-16'
        }),
        { field: 'newExpiration', code: 'long_not_after_short' }
      )
    })
  })

  describe('with no open short call', () => {
    it('accepts a strike at the former short strike', () => {
      expect(
        rollPmccLeaps(
          validInput({ openShort: null, newStrike: '112.0000', newExpiration: '2028-01-21' })
        )
      ).toEqual({ phase: 'PMCC_OPEN' })
    })

    it('accepts an expiration that an open short would leave uncovered', () => {
      expect(rollPmccLeaps(validInput({ openShort: null, newExpiration: '2027-07-16' }))).toEqual({
        phase: 'PMCC_OPEN'
      })
    })

    it('still rejects a roll that changes neither strike nor expiration', () => {
      expectRejection(
        validInput({ openShort: null, newStrike: '80.0000', newExpiration: '2027-09-17' }),
        NO_CHANGE
      )
    })

    it('still rejects zero proceeds from close', () => {
      expectRejection(validInput({ openShort: null, proceedsPerContract: '0.0000' }), {
        field: 'proceedsPerContract',
        code: 'must_be_positive',
        message: 'Proceeds from close must be greater than zero'
      })
    })
  })
})
