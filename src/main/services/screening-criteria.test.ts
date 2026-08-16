// [US-67] Screening-criteria persistence service — one app_settings row holding the
// whole criteria document, with a forward-compatible read path and a validate-first
// write path.
import { describe, expect, it, vi } from 'vitest'
import { ValidationError } from '../core/lifecycle'
import { DEFAULT_SCREENING_CRITERIA, type ScreeningCriteria } from '../core/screener'
import { makeTestDb } from '../test-utils'
import { appSettings } from './app-settings'
import { getScreeningCriteria, saveScreeningCriteria } from './screening-criteria'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const SCREENING_CRITERIA_KEY = 'screening_criteria'

/** The save payload: the full criteria minus the field the service supplies itself. */
type SaveInput = Omit<ScreeningCriteria, 'maxSpreadAbsolute'>

function saveInput(overrides: Partial<SaveInput> = {}): SaveInput {
  return {
    deltaMin: DEFAULT_SCREENING_CRITERIA.deltaMin,
    deltaMax: DEFAULT_SCREENING_CRITERIA.deltaMax,
    dteMin: DEFAULT_SCREENING_CRITERIA.dteMin,
    dteMax: DEFAULT_SCREENING_CRITERIA.dteMax,
    minOpenInterest: DEFAULT_SCREENING_CRITERIA.minOpenInterest,
    maxSpreadPercent: DEFAULT_SCREENING_CRITERIA.maxSpreadPercent,
    maxUnderlyingPrice: DEFAULT_SCREENING_CRITERIA.maxUnderlyingPrice,
    minIvRank: DEFAULT_SCREENING_CRITERIA.minIvRank,
    earningsHandling: DEFAULT_SCREENING_CRITERIA.earningsHandling,
    ...overrides
  }
}

/** The defaults document with one field dropped and others overridden — the shape a
 *  document written before that field existed reads back as. */
function storedWithout(
  omitted: keyof ScreeningCriteria,
  overrides: Partial<ScreeningCriteria> = {}
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...DEFAULT_SCREENING_CRITERIA, ...overrides }).filter(
      ([field]) => field !== omitted
    )
  )
}

/** Asserts the thrown ValidationError carries the exact field/code/message triple
 *  pinned by `contracts/screener-save-criteria.md`. */
function expectValidationError(
  run: () => unknown,
  expected: { field: string; code: string; message: string }
): void {
  let caught: unknown
  try {
    run()
  } catch (err) {
    caught = err
  }

  expect(caught).toBeInstanceOf(ValidationError)
  const error = caught as ValidationError
  expect({ field: error.field, code: error.code, message: error.message }).toEqual(expected)
}

describe('getScreeningCriteria', () => {
  it('returns the shipped defaults on an empty DB', () => {
    const db = makeTestDb()

    expect(getScreeningCriteria(db)).toEqual(DEFAULT_SCREENING_CRITERIA)
  })

  it('returns the defaults rather than throwing when the stored row is not JSON', () => {
    const db = makeTestDb()
    appSettings.set(db, SCREENING_CRITERIA_KEY, 'not json')

    expect(getScreeningCriteria(db)).toEqual(DEFAULT_SCREENING_CRITERIA)
  })

  it('reads a document written before minIvRank existed back with minIvRank null', () => {
    const db = makeTestDb()
    const legacy = {
      deltaMin: '0.15',
      deltaMax: '0.20',
      dteMin: 40,
      dteMax: 45,
      minOpenInterest: 250,
      maxSpreadPercent: '8',
      maxSpreadAbsolute: '0.10',
      maxUnderlyingPrice: '75',
      earningsHandling: 'flag'
    }
    appSettings.set(db, SCREENING_CRITERIA_KEY, JSON.stringify(legacy))

    // The missing field defaults; every field that was written survives — an added
    // field must never be a breaking change.
    expect(getScreeningCriteria(db)).toEqual({ ...legacy, minIvRank: null })
  })

  it('falls back to the whole defaults object when a present field is invalid', () => {
    const db = makeTestDb()
    appSettings.set(
      db,
      SCREENING_CRITERIA_KEY,
      JSON.stringify({ ...DEFAULT_SCREENING_CRITERIA, deltaMin: '0.15', dteMin: 0 })
    )

    // Not a half-merge: a partially defaulted band is not a band the trader chose.
    expect(getScreeningCriteria(db)).toEqual(DEFAULT_SCREENING_CRITERIA)
  })

  it('falls back wholesale when only one end of the delta band is stored', () => {
    const db = makeTestDb()
    appSettings.set(
      db,
      SCREENING_CRITERIA_KEY,
      JSON.stringify(storedWithout('deltaMin', { deltaMax: '0.15' }))
    )

    // deltaMin would default to '0.20' against a stored deltaMax of '0.15' — an
    // inverted band saveScreeningCriteria would have rejected outright.
    expect(getScreeningCriteria(db)).toEqual(DEFAULT_SCREENING_CRITERIA)
  })

  it('falls back wholesale when only one end of the DTE window is stored', () => {
    const db = makeTestDb()
    appSettings.set(
      db,
      SCREENING_CRITERIA_KEY,
      JSON.stringify(storedWithout('dteMin', { dteMax: 20 }))
    )

    expect(getScreeningCriteria(db)).toEqual(DEFAULT_SCREENING_CRITERIA)
  })

  it('falls back wholesale when maxSpreadAbsolute is corrupt', () => {
    const db = makeTestDb()
    appSettings.set(
      db,
      SCREENING_CRITERIA_KEY,
      JSON.stringify({ ...DEFAULT_SCREENING_CRITERIA, maxSpreadAbsolute: 'wide' })
    )

    // It reaches `new Decimal(...)` in the engine unguarded, so it gets the same
    // bound check as every other stored field.
    expect(getScreeningCriteria(db)).toEqual(DEFAULT_SCREENING_CRITERIA)
  })

  it('falls back wholesale when a stored value carries whitespace decimal.js rejects', () => {
    const db = makeTestDb()
    appSettings.set(
      db,
      SCREENING_CRITERIA_KEY,
      JSON.stringify({ ...DEFAULT_SCREENING_CRITERIA, deltaMax: '0.30 ' })
    )

    expect(getScreeningCriteria(db)).toEqual(DEFAULT_SCREENING_CRITERIA)
  })
})

describe('saveScreeningCriteria', () => {
  it('round-trips every field, including both optionals and the earnings policy', () => {
    const db = makeTestDb()
    const input = saveInput({
      deltaMin: '0.15',
      deltaMax: '0.20',
      dteMin: 40,
      dteMax: 45,
      minOpenInterest: 250,
      maxSpreadPercent: '8',
      maxUnderlyingPrice: '75',
      minIvRank: '30',
      earningsHandling: 'flag'
    })

    saveScreeningCriteria(db, input)

    expect(getScreeningCriteria(db)).toEqual({
      deltaMin: '0.15',
      deltaMax: '0.20',
      dteMin: 40,
      dteMax: 45,
      minOpenInterest: 250,
      maxSpreadPercent: '8',
      maxSpreadAbsolute: DEFAULT_SCREENING_CRITERIA.maxSpreadAbsolute,
      maxUnderlyingPrice: '75',
      minIvRank: '30',
      earningsHandling: 'flag'
    })
  })

  it('returns the persisted document read back, not its input argument', () => {
    const db = makeTestDb()
    const input = saveInput({ deltaMin: '0.15', deltaMax: '0.20', minIvRank: '30' })

    const returned = saveScreeningCriteria(db, input)

    expect(returned).not.toBe(input)
    expect(returned).toEqual(getScreeningCriteria(db))
    expect(returned).toMatchObject({ deltaMin: '0.15', deltaMax: '0.20', minIvRank: '30' })
  })

  it('fills maxSpreadAbsolute from the defaults though the payload omits it', () => {
    const db = makeTestDb()
    const input = saveInput({ maxSpreadPercent: '8', deltaMin: '0.15', deltaMax: '0.20' })

    const returned = saveScreeningCriteria(db, input)

    expect(returned).toEqual({
      ...input,
      maxSpreadAbsolute: DEFAULT_SCREENING_CRITERIA.maxSpreadAbsolute
    })
  })

  it('persists a disabled price ceiling and IV-rank floor as null', () => {
    const db = makeTestDb()
    saveScreeningCriteria(db, saveInput({ maxUnderlyingPrice: '75', minIvRank: '30' }))

    saveScreeningCriteria(
      db,
      saveInput({ deltaMin: '0.15', deltaMax: '0.20', maxUnderlyingPrice: null, minIvRank: null })
    )

    expect(getScreeningCriteria(db)).toMatchObject({
      deltaMin: '0.15',
      maxUnderlyingPrice: null,
      minIvRank: null
    })
  })
})

describe('saveScreeningCriteria validation', () => {
  const DELTA_RANGE = 'Delta must be between 0.01 and 0.99'
  const OUT_OF_RANGE = 'out_of_range'

  it('rejects a deltaMin below the allowed range', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ deltaMin: '0' })), {
      field: 'deltaMin',
      code: OUT_OF_RANGE,
      message: DELTA_RANGE
    })
  })

  it('rejects a deltaMax above the allowed range', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ deltaMax: '1.5' })), {
      field: 'deltaMax',
      code: OUT_OF_RANGE,
      message: DELTA_RANGE
    })
  })

  it('rejects a whitespace-padded deltaMax rather than persisting it verbatim', () => {
    const db = makeTestDb()

    // `Number('0.30 ')` is 0.3, but `new Decimal('0.30 ')` throws — persisting it
    // would break the criteria strip and the engine on every later read.
    expectValidationError(() => saveScreeningCriteria(db, saveInput({ deltaMax: '0.30 ' })), {
      field: 'deltaMax',
      code: OUT_OF_RANGE,
      message: DELTA_RANGE
    })
  })

  it('rejects a dteMin below 1', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ dteMin: 0 })), {
      field: 'dteMin',
      code: OUT_OF_RANGE,
      message: 'DTE must be at least 1'
    })
  })

  it('rejects a dteMax above 365', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ dteMax: 400 })), {
      field: 'dteMax',
      code: OUT_OF_RANGE,
      message: 'DTE must be at most 365'
    })
  })

  it('rejects a negative minOpenInterest', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ minOpenInterest: -100 })), {
      field: 'minOpenInterest',
      code: OUT_OF_RANGE,
      message: 'Open interest floor cannot be negative'
    })
  })

  it('rejects a maxSpreadPercent outside 1–50', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ maxSpreadPercent: '0' })), {
      field: 'maxSpreadPercent',
      code: OUT_OF_RANGE,
      message: 'Max spread must be between 1% and 50%'
    })
  })

  it('rejects a price ceiling of zero when the ceiling is enabled', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ maxUnderlyingPrice: '0' })), {
      field: 'maxUnderlyingPrice',
      code: OUT_OF_RANGE,
      message: 'Price ceiling must be greater than zero'
    })
  })

  it('rejects an IV-rank floor above 100 when the floor is enabled', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ minIvRank: '101' })), {
      field: 'minIvRank',
      code: OUT_OF_RANGE,
      message: 'IV rank floor must be between 0 and 100'
    })
  })

  it('rejects an inverted delta band, attaching the error to deltaMax', () => {
    const db = makeTestDb()

    expectValidationError(
      () => saveScreeningCriteria(db, saveInput({ deltaMin: '0.30', deltaMax: '0.20' })),
      {
        field: 'deltaMax',
        code: 'inverted_band',
        message: 'Minimum delta must be less than maximum delta'
      }
    )
  })

  it('rejects an inverted DTE window, attaching the error to dteMax', () => {
    const db = makeTestDb()

    expectValidationError(() => saveScreeningCriteria(db, saveInput({ dteMin: 45, dteMax: 30 })), {
      field: 'dteMax',
      code: 'inverted_band',
      message: 'Minimum DTE must be less than maximum DTE'
    })
  })

  it('leaves the previously stored document untouched when a save is rejected', () => {
    const db = makeTestDb()
    const first = saveScreeningCriteria(db, saveInput({ deltaMin: '0.15', deltaMax: '0.20' }))

    expect(() =>
      saveScreeningCriteria(db, saveInput({ deltaMin: '0.30', deltaMax: '0.20' }))
    ).toThrow(ValidationError)

    // Validation runs before the single appSettings.set, so nothing was written.
    expect(getScreeningCriteria(db)).toEqual(first)
  })
})
