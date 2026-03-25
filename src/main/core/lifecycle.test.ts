import { describe, expect, it } from 'vitest'
import * as lifecycle from './lifecycle'
import {
  ValidationError,
  openWheel,
  closeCsp,
  expireCsp,
  openCoveredCall,
  closeCoveredCall
} from './lifecycle'
import type {
  CloseCspInput,
  CloseCoveredCallInput,
  ExpireCspInput,
  OpenWheelInput,
  OpenCoveredCallInput
} from './lifecycle'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
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

  it('throws ValidationError when expiration is in the past', () => {
    const e = catchValidation(() =>
      openCoveredCall(validCcInput({ expiration: '2026-03-19', referenceDate: '2026-03-20' }))
    )
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('already_expired')
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
