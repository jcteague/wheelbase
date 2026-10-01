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
  OpenPmccLegInput
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
