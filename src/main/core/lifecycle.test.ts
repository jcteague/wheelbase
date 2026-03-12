import { describe, expect, it } from 'vitest'
import { ValidationError, openWheel } from './lifecycle'
import type { OpenWheelInput } from './lifecycle'

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

  it('rejects expiration same as fill date', () => {
    const e = catchValidation(() =>
      openWheel(validInput({ fillDate: YESTERDAY, expiration: YESTERDAY }))
    )
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('must_be_after_fill_date')
  })

  it('rejects expiration before fill date', () => {
    const e = catchValidation(() =>
      openWheel(validInput({ fillDate: TODAY, expiration: YESTERDAY }))
    )
    expect(e.field).toBe('expiration')
    expect(e.code).toBe('must_be_after_fill_date')
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
