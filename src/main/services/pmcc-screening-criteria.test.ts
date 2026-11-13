// [US-110] PMCC screening-criteria persistence service — its own app_settings row,
// a forward-compatible read path that falls back wholesale, and a validate-first
// write path that names the field each rule binds to.
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PMCC_SCREENING_CRITERIA, type PmccScreeningCriteria } from '../core/pmcc-screener'
import { DEFAULT_SCREENING_CRITERIA } from '../core/screener'
import { makeTestDb } from '../test-utils'
import { appSettings } from './app-settings'
import {
  getPmccScreeningCriteria,
  savePmccScreeningCriteria,
  type SavePmccScreeningCriteriaInput
} from './pmcc-screening-criteria'
import { saveScreeningCriteria } from './screening-criteria'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const PMCC_KEY = 'pmcc_screening_criteria'
const WHEEL_KEY = 'screening_criteria'

/** Every editable field set away from its default, so a value that silently
 *  defaults shows. */
const CUSTOM_INPUT: SavePmccScreeningCriteriaInput = {
  longDeltaMin: '0.75',
  longDeltaMax: '0.90',
  longDteMin: 200,
  longDteMax: 600,
  shortDeltaMin: '0.20',
  shortDeltaMax: '0.30',
  shortDteMin: 25,
  shortDteMax: 50,
  maxDebitToWidthPercent: '85',
  minOpenInterest: 300,
  maxSpreadPercent: '8',
  minIvRank: '30',
  maxIvRank: '55',
  earningsHandling: 'flag'
}

/** The custom document as stored: the service supplies maxSpreadAbsolute itself. */
const CUSTOM: PmccScreeningCriteria = { ...CUSTOM_INPUT, maxSpreadAbsolute: '0.10' }

function saveInput(
  overrides: Partial<SavePmccScreeningCriteriaInput> = {}
): SavePmccScreeningCriteriaInput {
  return {
    longDeltaMin: DEFAULT_PMCC_SCREENING_CRITERIA.longDeltaMin,
    longDeltaMax: DEFAULT_PMCC_SCREENING_CRITERIA.longDeltaMax,
    longDteMin: DEFAULT_PMCC_SCREENING_CRITERIA.longDteMin,
    longDteMax: DEFAULT_PMCC_SCREENING_CRITERIA.longDteMax,
    shortDeltaMin: DEFAULT_PMCC_SCREENING_CRITERIA.shortDeltaMin,
    shortDeltaMax: DEFAULT_PMCC_SCREENING_CRITERIA.shortDeltaMax,
    shortDteMin: DEFAULT_PMCC_SCREENING_CRITERIA.shortDteMin,
    shortDteMax: DEFAULT_PMCC_SCREENING_CRITERIA.shortDteMax,
    maxDebitToWidthPercent: DEFAULT_PMCC_SCREENING_CRITERIA.maxDebitToWidthPercent,
    minOpenInterest: DEFAULT_PMCC_SCREENING_CRITERIA.minOpenInterest,
    maxSpreadPercent: DEFAULT_PMCC_SCREENING_CRITERIA.maxSpreadPercent,
    minIvRank: DEFAULT_PMCC_SCREENING_CRITERIA.minIvRank,
    maxIvRank: DEFAULT_PMCC_SCREENING_CRITERIA.maxIvRank,
    earningsHandling: DEFAULT_PMCC_SCREENING_CRITERIA.earningsHandling,
    ...overrides
  }
}

function storeRaw(db: ReturnType<typeof makeTestDb>, document: unknown): void {
  appSettings.set(db, PMCC_KEY, JSON.stringify(document))
}

function storedDocument(db: ReturnType<typeof makeTestDb>, key = PMCC_KEY): unknown {
  const raw = appSettings.get(db, key)
  return raw === undefined ? undefined : JSON.parse(raw)
}

/** Asserts the call throws a ValidationError carrying exactly this field/code/message
 *  triple — the contract `contracts/screener-pmcc.md` pins. */
function expectRejection(
  run: () => unknown,
  expected: { field: string; code: string; message: string }
): void {
  expect(run).toThrow(expect.objectContaining({ name: 'ValidationError', ...expected }))
}

describe('getPmccScreeningCriteria', () => {
  it('returns the shipped PMCC defaults on an empty DB', () => {
    const db = makeTestDb()

    expect(getPmccScreeningCriteria(db)).toEqual({
      longDeltaMin: '0.70',
      longDeltaMax: '0.85',
      longDteMin: 180,
      longDteMax: 540,
      shortDeltaMin: '0.25',
      shortDeltaMax: '0.35',
      shortDteMin: 20,
      shortDteMax: 45,
      maxDebitToWidthPercent: '90',
      minOpenInterest: 200,
      maxSpreadPercent: '10',
      maxSpreadAbsolute: '0.10',
      minIvRank: null,
      maxIvRank: null,
      earningsHandling: 'exclude'
    })
  })

  it('reads a stored document back verbatim', () => {
    const db = makeTestDb()
    storeRaw(db, CUSTOM)

    expect(getPmccScreeningCriteria(db)).toEqual(CUSTOM)
  })

  it('reads a document written before maxIvRank existed back with maxIvRank null', () => {
    const db = makeTestDb()
    const legacy = Object.fromEntries(
      Object.entries(CUSTOM).filter(([field]) => field !== 'maxIvRank')
    )
    storeRaw(db, legacy)

    // The missing field defaults; every field that was written survives.
    expect(getPmccScreeningCriteria(db)).toEqual({ ...CUSTOM, maxIvRank: null })
  })

  it('returns the whole defaults rather than throwing when the stored row is not JSON', () => {
    const db = makeTestDb()
    appSettings.set(db, PMCC_KEY, 'not json')

    expect(getPmccScreeningCriteria(db)).toEqual(DEFAULT_PMCC_SCREENING_CRITERIA)
  })

  it('falls back to the whole defaults when a present field is out of bounds', () => {
    const db = makeTestDb()
    storeRaw(db, { ...CUSTOM, longDteMax: 800 })

    // Not a half-merge: the trader's other custom values are dropped too.
    expect(getPmccScreeningCriteria(db)).toEqual(DEFAULT_PMCC_SCREENING_CRITERIA)
  })

  it('falls back wholesale when a stored IV-rank ceiling is above 100', () => {
    const db = makeTestDb()
    storeRaw(db, { ...CUSTOM, maxIvRank: '120' })

    expect(getPmccScreeningCriteria(db)).toEqual(DEFAULT_PMCC_SCREENING_CRITERIA)
  })

  it('falls back wholesale when a stored max debit / width is corrupt', () => {
    const db = makeTestDb()
    storeRaw(db, { ...CUSTOM, maxDebitToWidthPercent: 'wide' })

    expect(getPmccScreeningCriteria(db)).toEqual(DEFAULT_PMCC_SCREENING_CRITERIA)
  })

  it.each<[string, Partial<PmccScreeningCriteria>]>([
    ['the LEAPS delta band is inverted', { longDeltaMin: '0.85', longDeltaMax: '0.70' }],
    ['the short delta band is inverted', { shortDeltaMin: '0.35', shortDeltaMax: '0.25' }],
    ['the LEAPS DTE window is inverted', { longDteMin: 540, longDteMax: 180 }],
    ['the short DTE window is inverted', { shortDteMin: 45, shortDteMax: 20 }],
    ['the LEAPS window overlaps the short window', { longDteMin: 40, shortDteMax: 45 }],
    ['the LEAPS window starts on the short window maximum', { longDteMin: 45, shortDteMax: 45 }],
    ['the IV-rank band is inverted', { minIvRank: '60', maxIvRank: '40' }],
    ['the IV-rank floor equals the ceiling', { minIvRank: '40', maxIvRank: '40' }]
  ])('falls back to the whole defaults when %s', (_label, inconsistent) => {
    const db = makeTestDb()
    storeRaw(db, { ...CUSTOM, ...inconsistent })

    expect(getPmccScreeningCriteria(db)).toEqual(DEFAULT_PMCC_SCREENING_CRITERIA)
  })

  it('keeps a LEAPS window that starts one day past the short window maximum', () => {
    const db = makeTestDb()
    storeRaw(db, { ...CUSTOM, longDteMin: 51, shortDteMax: 50 })

    expect(getPmccScreeningCriteria(db)).toEqual({ ...CUSTOM, longDteMin: 51, shortDteMax: 50 })
  })

  it('keeps an IV-rank band with only one end enabled', () => {
    const db = makeTestDb()
    storeRaw(db, { ...CUSTOM, minIvRank: '60', maxIvRank: null })

    expect(getPmccScreeningCriteria(db)).toEqual({ ...CUSTOM, minIvRank: '60', maxIvRank: null })
  })

  it('falls back wholesale when a missing field defaults into an overlap with a stored one', () => {
    const db = makeTestDb()
    // longDteMin would default to 180 against a stored shortDteMax of 200 — an overlap
    // savePmccScreeningCriteria would have rejected outright.
    const legacy = Object.fromEntries(
      Object.entries({ ...CUSTOM, shortDteMin: 150, shortDteMax: 200 }).filter(
        ([field]) => field !== 'longDteMin'
      )
    )
    storeRaw(db, legacy)

    expect(getPmccScreeningCriteria(db)).toEqual(DEFAULT_PMCC_SCREENING_CRITERIA)
  })
})

describe('savePmccScreeningCriteria', () => {
  it('fills maxSpreadAbsolute from the defaults and returns the full stored document', () => {
    const db = makeTestDb()

    const returned = savePmccScreeningCriteria(db, saveInput())

    expect(returned).toEqual({ ...saveInput(), maxSpreadAbsolute: '0.10' })
    expect(getPmccScreeningCriteria(db)).toEqual(returned)
  })

  it('round-trips every editable field, including both IV-rank ends and the earnings policy', () => {
    const db = makeTestDb()
    savePmccScreeningCriteria(db, CUSTOM_INPUT)

    expect(storedDocument(db)).toEqual(CUSTOM)
  })

  it('accepts a LEAPS window starting one day past the short window maximum', () => {
    const db = makeTestDb()

    const returned = savePmccScreeningCriteria(db, saveInput({ longDteMin: 46, shortDteMax: 45 }))

    expect(returned).toMatchObject({ longDteMin: 46, shortDteMax: 45 })
  })

  it('accepts a LEAPS DTE maximum of exactly 730', () => {
    const db = makeTestDb()

    const returned = savePmccScreeningCriteria(db, saveInput({ longDteMax: 730 }))

    expect(returned).toMatchObject({ longDteMax: 730 })
  })

  it('leaves the wheel criteria row untouched', () => {
    const db = makeTestDb()
    const wheel = saveScreeningCriteria(db, {
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

    savePmccScreeningCriteria(db, saveInput({ shortDteMax: 50 }))

    expect(storedDocument(db, WHEEL_KEY)).toEqual(wheel)
    expect(storedDocument(db)).toMatchObject({ shortDteMax: 50 })
  })

  it('is left untouched by a wheel criteria save', () => {
    const db = makeTestDb()
    const pmcc = savePmccScreeningCriteria(db, saveInput({ shortDteMax: 50 }))

    saveScreeningCriteria(db, {
      ...DEFAULT_SCREENING_CRITERIA,
      deltaMin: '0.15',
      deltaMax: '0.20'
    })

    expect(storedDocument(db)).toEqual(pmcc)
    expect(storedDocument(db, WHEEL_KEY)).toMatchObject({ deltaMin: '0.15' })
  })
})

describe('savePmccScreeningCriteria validation — per-field bounds', () => {
  const OUT_OF_RANGE = 'out_of_range'
  const DELTA_RANGE = 'Delta must be between 0.01 and 0.99'

  it.each<[keyof SavePmccScreeningCriteriaInput, string]>([
    ['longDeltaMin', '0'],
    ['longDeltaMax', '1.5'],
    ['shortDeltaMin', '0'],
    ['shortDeltaMax', '0.35 ']
  ])('rejects %s = %j with the delta range message', (field, value) => {
    const db = makeTestDb()

    expectRejection(() => savePmccScreeningCriteria(db, saveInput({ [field]: value })), {
      field,
      code: OUT_OF_RANGE,
      message: DELTA_RANGE
    })
  })

  it.each<[keyof SavePmccScreeningCriteriaInput, number, string]>([
    ['longDteMin', 0, 'DTE must be at least 1'],
    ['longDteMax', 800, 'LEAPS DTE must be at most 730'],
    ['longDteMax', 731, 'LEAPS DTE must be at most 730'],
    ['shortDteMin', 0, 'DTE must be at least 1'],
    ['shortDteMax', 366, 'DTE must be at most 365']
  ])('rejects %s = %d with %j', (field, value, message) => {
    const db = makeTestDb()

    expectRejection(() => savePmccScreeningCriteria(db, saveInput({ [field]: value })), {
      field,
      code: OUT_OF_RANGE,
      message
    })
  })

  it('rejects a LEAPS DTE minimum above 730 with the LEAPS ceiling message', () => {
    const db = makeTestDb()

    expectRejection(
      () => savePmccScreeningCriteria(db, saveInput({ longDteMin: 731, longDteMax: 540 })),
      { field: 'longDteMin', code: OUT_OF_RANGE, message: 'LEAPS DTE must be at most 730' }
    )
  })

  it('rejects a max debit / width of 0', () => {
    const db = makeTestDb()

    expectRejection(
      () => savePmccScreeningCriteria(db, saveInput({ maxDebitToWidthPercent: '0' })),
      {
        field: 'maxDebitToWidthPercent',
        code: OUT_OF_RANGE,
        message: 'Max debit / width must be between 1% and 100%'
      }
    )
  })

  it('rejects a negative open-interest floor', () => {
    const db = makeTestDb()

    expectRejection(() => savePmccScreeningCriteria(db, saveInput({ minOpenInterest: -1 })), {
      field: 'minOpenInterest',
      code: OUT_OF_RANGE,
      message: 'Open interest floor cannot be negative'
    })
  })

  it('rejects a max spread outside 1–50%', () => {
    const db = makeTestDb()

    expectRejection(() => savePmccScreeningCriteria(db, saveInput({ maxSpreadPercent: '51' })), {
      field: 'maxSpreadPercent',
      code: OUT_OF_RANGE,
      message: 'Max spread must be between 1% and 50%'
    })
  })

  it('rejects an enabled IV-rank floor above 100', () => {
    const db = makeTestDb()

    expectRejection(() => savePmccScreeningCriteria(db, saveInput({ minIvRank: '101' })), {
      field: 'minIvRank',
      code: OUT_OF_RANGE,
      message: 'IV rank floor must be between 0 and 100'
    })
  })

  it('rejects an enabled IV-rank ceiling above 100', () => {
    const db = makeTestDb()

    expectRejection(() => savePmccScreeningCriteria(db, saveInput({ maxIvRank: '120' })), {
      field: 'maxIvRank',
      code: OUT_OF_RANGE,
      message: 'IV rank ceiling must be between 0 and 100'
    })
  })

  it('reports an out-of-range bound before the overlap it also causes', () => {
    const db = makeTestDb()

    // longDteMin 0 is both below 1 and not beyond shortDteMax — the bound wins.
    expectRejection(() => savePmccScreeningCriteria(db, saveInput({ longDteMin: 0 })), {
      field: 'longDteMin',
      code: OUT_OF_RANGE,
      message: 'DTE must be at least 1'
    })
  })
})

describe('savePmccScreeningCriteria validation — cross-field rules', () => {
  it.each<[string, Partial<SavePmccScreeningCriteriaInput>, string, string]>([
    [
      'an inverted LEAPS delta band',
      { longDeltaMin: '0.85', longDeltaMax: '0.70' },
      'longDeltaMax',
      'Minimum delta must be less than maximum delta'
    ],
    [
      'an inverted short delta band',
      { shortDeltaMin: '0.35', shortDeltaMax: '0.25' },
      'shortDeltaMax',
      'Minimum delta must be less than maximum delta'
    ],
    [
      'an inverted LEAPS DTE window',
      { longDteMin: 540, longDteMax: 180 },
      'longDteMax',
      'Minimum DTE must be less than maximum DTE'
    ],
    [
      'an inverted short DTE window',
      { shortDteMin: 45, shortDteMax: 20 },
      'shortDteMax',
      'Minimum DTE must be less than maximum DTE'
    ],
    [
      'an inverted IV-rank band',
      { minIvRank: '60', maxIvRank: '40' },
      'maxIvRank',
      'IV-rank floor must be less than IV-rank ceiling'
    ],
    [
      'an IV-rank floor equal to the ceiling',
      { minIvRank: '40', maxIvRank: '40' },
      'maxIvRank',
      'IV-rank floor must be less than IV-rank ceiling'
    ]
  ])('rejects %s as inverted_band on %s', (_label, overrides, field, message) => {
    const db = makeTestDb()

    expectRejection(() => savePmccScreeningCriteria(db, saveInput(overrides)), {
      field,
      code: 'inverted_band',
      message
    })
  })

  it.each([40, 45])(
    'rejects a LEAPS minimum DTE of %d against a short maximum of 45 as overlapping',
    (longDteMin) => {
      const db = makeTestDb()

      expectRejection(() => savePmccScreeningCriteria(db, saveInput({ longDteMin })), {
        field: 'longDteMin',
        code: 'overlapping_windows',
        message: 'LEAPS minimum DTE must exceed short-call maximum DTE'
      })
    }
  )

  it('accepts an IV-rank band with only one end enabled', () => {
    const db = makeTestDb()

    const returned = savePmccScreeningCriteria(db, saveInput({ minIvRank: '60', maxIvRank: null }))

    expect(returned).toMatchObject({ minIvRank: '60', maxIvRank: null })
  })

  it('checks the delta bands before the DTE windows', () => {
    const db = makeTestDb()

    expectRejection(
      () =>
        savePmccScreeningCriteria(
          db,
          saveInput({
            shortDeltaMin: '0.35',
            shortDeltaMax: '0.25',
            longDteMin: 540,
            longDteMax: 180
          })
        ),
      {
        field: 'shortDeltaMax',
        code: 'inverted_band',
        message: 'Minimum delta must be less than maximum delta'
      }
    )
  })

  it('checks the window overlap before the IV-rank band', () => {
    const db = makeTestDb()

    expectRejection(
      () =>
        savePmccScreeningCriteria(
          db,
          saveInput({ longDteMin: 40, minIvRank: '60', maxIvRank: '40' })
        ),
      {
        field: 'longDteMin',
        code: 'overlapping_windows',
        message: 'LEAPS minimum DTE must exceed short-call maximum DTE'
      }
    )
  })

  it('leaves the previously stored document untouched when a save is rejected', () => {
    const db = makeTestDb()
    savePmccScreeningCriteria(db, CUSTOM_INPUT)

    expect(() => savePmccScreeningCriteria(db, saveInput({ longDteMin: 40 }))).toThrow(
      'LEAPS minimum DTE must exceed short-call maximum DTE'
    )

    expect(storedDocument(db)).toEqual({
      longDeltaMin: '0.75',
      longDeltaMax: '0.90',
      longDteMin: 200,
      longDteMax: 600,
      shortDeltaMin: '0.20',
      shortDeltaMax: '0.30',
      shortDteMin: 25,
      shortDteMax: 50,
      maxDebitToWidthPercent: '85',
      minOpenInterest: 300,
      maxSpreadPercent: '8',
      maxSpreadAbsolute: '0.10',
      minIvRank: '30',
      maxIvRank: '55',
      earningsHandling: 'flag'
    })
  })
})
