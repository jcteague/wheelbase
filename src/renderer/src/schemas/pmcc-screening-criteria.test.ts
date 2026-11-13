// [US-110] Renderer form schema for the PMCC screening-criteria sheet.
//
// Same posture as the wheel's US-67 schema: every numeric field is a `z.string()`
// so an in-progress `'0.'` stays typeable, and the bounds, cross-field rules and
// messages come from `src/main/core/screening-criteria.ts`. The message literals
// below are pinned verbatim from the story — the sheet must show exactly these.

import { describe, expect, it } from 'vitest'
import type { PmccScreeningCriteria } from '../api/pmcc-screening-criteria'
import {
  isPmccScreeningCriteriaField,
  PMCC_SCREENING_CRITERIA_DEPS,
  pmccScreeningCriteriaSchema,
  toFormValues,
  toPayload,
  type PmccScreeningCriteriaFormInput
} from './pmcc-screening-criteria'

// The shipped PMCC defaults (DEFAULT_PMCC_SCREENING_CRITERIA) written out as
// literals, so a drifted default fails here rather than being echoed back.
const DEFAULTS: PmccScreeningCriteria = {
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
}

// The same defaults as form input — what the sheet shows on a fresh install.
const DEFAULT_FORM_INPUT: PmccScreeningCriteriaFormInput = {
  longDeltaMin: '0.70',
  longDeltaMax: '0.85',
  longDteMin: '180',
  longDteMax: '540',
  shortDeltaMin: '0.25',
  shortDeltaMax: '0.35',
  shortDteMin: '20',
  shortDteMax: '45',
  maxDebitToWidthPercent: '90',
  minOpenInterest: '200',
  maxSpreadPercent: '10',
  ivRankFloorEnabled: false,
  minIvRank: '',
  ivRankCeilingEnabled: false,
  maxIvRank: '',
  earningsHandling: 'exclude'
}

const IV_BAND_ON: PmccScreeningCriteriaFormInput = {
  ...DEFAULT_FORM_INPUT,
  ivRankFloorEnabled: true,
  ivRankCeilingEnabled: true
}

const OVERLAP = 'LEAPS minimum DTE must exceed short-call maximum DTE'
const IV_INVERTED = 'IV-rank floor must be less than IV-rank ceiling'

function issuesOf(
  input: Partial<PmccScreeningCriteriaFormInput>
): Array<{ path: string; message: string }> {
  const result = pmccScreeningCriteriaSchema.safeParse({ ...DEFAULT_FORM_INPUT, ...input })
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message
  }))
}

describe('pmccScreeningCriteriaSchema — bounds', () => {
  it('parses the shipped default values', () => {
    expect(issuesOf({})).toEqual([])
  })

  it('rejects a LEAPS maximum DTE of 800 with the LEAPS ceiling message', () => {
    expect(issuesOf({ longDteMax: '800' })).toEqual([
      { path: 'longDteMax', message: 'LEAPS DTE must be at most 730' }
    ])
  })

  it('accepts a LEAPS maximum DTE of 730 and rejects 731', () => {
    expect(issuesOf({ longDteMax: '730' })).toEqual([])
    expect(issuesOf({ longDteMax: '731' })).toEqual([
      { path: 'longDteMax', message: 'LEAPS DTE must be at most 730' }
    ])
  })

  it('rejects a LEAPS minimum DTE of zero with the DTE floor message', () => {
    expect(issuesOf({ longDteMin: '0' })).toEqual([
      { path: 'longDteMin', message: 'DTE must be at least 1' }
    ])
  })

  // The short window keeps the wheel's one-year cap; only the LEAPS window reaches 730.
  it('rejects a short-call maximum DTE of 366 with the wheel DTE ceiling message', () => {
    expect(issuesOf({ shortDteMax: '366' })).toEqual([
      { path: 'shortDteMax', message: 'DTE must be at most 365' }
    ])
  })

  it('rejects a max debit / width of 0 with the ratio message', () => {
    expect(issuesOf({ maxDebitToWidthPercent: '0' })).toEqual([
      { path: 'maxDebitToWidthPercent', message: 'Max debit / width must be between 1% and 100%' }
    ])
  })

  it('accepts a max debit / width of 100 and rejects 101', () => {
    expect(issuesOf({ maxDebitToWidthPercent: '100' })).toEqual([])
    expect(issuesOf({ maxDebitToWidthPercent: '101' })).toEqual([
      { path: 'maxDebitToWidthPercent', message: 'Max debit / width must be between 1% and 100%' }
    ])
  })

  it('rejects an out-of-range short-call delta with the delta range message', () => {
    expect(issuesOf({ shortDeltaMin: '1.5' })).toEqual([
      { path: 'shortDeltaMin', message: 'Delta must be between 0.01 and 0.99' }
    ])
  })

  it('rejects a negative open-interest floor', () => {
    expect(issuesOf({ minOpenInterest: '-1' })).toEqual([
      { path: 'minOpenInterest', message: 'Open interest floor cannot be negative' }
    ])
  })

  it('rejects a max bid-ask spread of zero percent', () => {
    expect(issuesOf({ maxSpreadPercent: '0' })).toEqual([
      { path: 'maxSpreadPercent', message: 'Max spread must be between 1% and 50%' }
    ])
  })
})

describe('pmccScreeningCriteriaSchema — inverted bands', () => {
  it('binds an inverted LEAPS delta band to longDeltaMax', () => {
    expect(issuesOf({ longDeltaMin: '0.85', longDeltaMax: '0.70' })).toEqual([
      { path: 'longDeltaMax', message: 'Minimum delta must be less than maximum delta' }
    ])
  })

  it('binds an inverted short-call delta band to shortDeltaMax', () => {
    expect(issuesOf({ shortDeltaMin: '0.35', shortDeltaMax: '0.25' })).toEqual([
      { path: 'shortDeltaMax', message: 'Minimum delta must be less than maximum delta' }
    ])
  })

  it('binds an inverted LEAPS DTE window to longDteMax', () => {
    expect(issuesOf({ longDteMin: '540', longDteMax: '180' })).toEqual([
      { path: 'longDteMax', message: 'Minimum DTE must be less than maximum DTE' }
    ])
  })

  it('binds an inverted short-call DTE window to shortDteMax', () => {
    expect(issuesOf({ shortDteMin: '45', shortDteMax: '20' })).toEqual([
      { path: 'shortDteMax', message: 'Minimum DTE must be less than maximum DTE' }
    ])
  })

  // A band is only called inverted once both ends are legal on their own.
  it('reports only the bound, not the inversion, when one end of a band is out of range', () => {
    expect(issuesOf({ longDeltaMax: '1.5' })).toEqual([
      { path: 'longDeltaMax', message: 'Delta must be between 0.01 and 0.99' }
    ])
  })
})

describe('pmccScreeningCriteriaSchema — overlapping windows', () => {
  it('binds a LEAPS minimum DTE of 40 inside the short window to longDteMin', () => {
    expect(issuesOf({ longDteMin: '40' })).toEqual([{ path: 'longDteMin', message: OVERLAP }])
  })

  it('rejects a LEAPS minimum DTE equal to the short-call maximum DTE (45 vs 45)', () => {
    expect(issuesOf({ longDteMin: '45' })).toEqual([{ path: 'longDteMin', message: OVERLAP }])
  })

  it('accepts a LEAPS minimum DTE one day past the short-call maximum DTE (46 vs 45)', () => {
    expect(issuesOf({ longDteMin: '46' })).toEqual([])
  })

  it('stays silent about overlap while the LEAPS minimum DTE is itself out of range', () => {
    expect(issuesOf({ longDteMin: '0' })).toEqual([
      { path: 'longDteMin', message: 'DTE must be at least 1' }
    ])
  })

  it('stays silent about overlap while the short-call maximum DTE is itself out of range', () => {
    expect(issuesOf({ shortDteMax: '400' })).toEqual([
      { path: 'shortDteMax', message: 'DTE must be at most 365' }
    ])
  })
})

describe('pmccScreeningCriteriaSchema — IV-rank band', () => {
  it('binds a floor of 60 above a ceiling of 40 to maxIvRank when both toggles are on', () => {
    expect(issuesOf({ ...IV_BAND_ON, minIvRank: '60', maxIvRank: '40' })).toEqual([
      { path: 'maxIvRank', message: IV_INVERTED }
    ])
  })

  it('rejects a floor equal to the ceiling (50 / 50)', () => {
    expect(issuesOf({ ...IV_BAND_ON, minIvRank: '50', maxIvRank: '50' })).toEqual([
      { path: 'maxIvRank', message: IV_INVERTED }
    ])
  })

  it('accepts a floor of 30 under a ceiling of 55', () => {
    expect(issuesOf({ ...IV_BAND_ON, minIvRank: '30', maxIvRank: '55' })).toEqual([])
  })

  it('ignores whatever is typed in the ceiling while its toggle is off', () => {
    expect(issuesOf({ ivRankFloorEnabled: true, minIvRank: '60', maxIvRank: '40' })).toEqual([])
    expect(issuesOf({ maxIvRank: 'abc' })).toEqual([])
  })

  it('ignores whatever is typed in the floor while its toggle is off', () => {
    expect(issuesOf({ ivRankCeilingEnabled: true, minIvRank: '60', maxIvRank: '40' })).toEqual([])
  })

  it('rejects a ceiling of 101 once its toggle is on', () => {
    expect(issuesOf({ ivRankCeilingEnabled: true, maxIvRank: '101' })).toEqual([
      { path: 'maxIvRank', message: 'IV rank ceiling must be between 0 and 100' }
    ])
  })

  it('rejects a floor of 101 once its toggle is on', () => {
    expect(issuesOf({ ivRankFloorEnabled: true, minIvRank: '101' })).toEqual([
      { path: 'minIvRank', message: 'IV rank floor must be between 0 and 100' }
    ])
  })

  it('reports only the ceiling bound, not the inversion, when the ceiling is out of range', () => {
    expect(issuesOf({ ...IV_BAND_ON, minIvRank: '60', maxIvRank: '101' })).toEqual([
      { path: 'maxIvRank', message: 'IV rank ceiling must be between 0 and 100' }
    ])
  })
})

// The sheet validates only the field being edited; these deps make an edit to either end
// of a cross-field rule re-check the field the rule's message is bound to. Each entry
// names the rules above that read the input without being bound to it.
describe('PMCC_SCREENING_CRITERIA_DEPS', () => {
  it('maps every input a cross-field rule reads to the field that rule is bound to', () => {
    expect(PMCC_SCREENING_CRITERIA_DEPS).toEqual({
      longDeltaMin: ['longDeltaMax'], // LEAPS delta band
      shortDeltaMin: ['shortDeltaMax'], // short-call delta band
      longDteMin: ['longDteMax'], // LEAPS DTE window
      shortDteMin: ['shortDteMax'], // short-call DTE window
      shortDteMax: ['longDteMin'], // windows must not overlap
      ivRankFloorEnabled: ['minIvRank', 'maxIvRank'], // floor bound; IV band
      ivRankCeilingEnabled: ['maxIvRank'], // ceiling bound; IV band
      minIvRank: ['maxIvRank'] // IV band
    })
  })
})

describe('isPmccScreeningCriteriaField', () => {
  it('accepts every field the sheet renders an input for', () => {
    expect(isPmccScreeningCriteriaField('longDteMin')).toBe(true)
    expect(isPmccScreeningCriteriaField('maxDebitToWidthPercent')).toBe(true)
    expect(isPmccScreeningCriteriaField('maxIvRank')).toBe(true)
  })

  it('rejects fields with no input of their own', () => {
    expect(isPmccScreeningCriteriaField('earningsHandling')).toBe(false)
    expect(isPmccScreeningCriteriaField('maxSpreadAbsolute')).toBe(false)
    expect(isPmccScreeningCriteriaField('__root__')).toBe(false)
  })
})

describe('toFormValues / toPayload', () => {
  it('reads null IV-rank ends as toggles off with blank inputs', () => {
    expect(toFormValues(DEFAULTS)).toEqual(DEFAULT_FORM_INPUT)
  })

  it('reads set IV-rank ends as toggles on with their values', () => {
    expect(toFormValues({ ...DEFAULTS, minIvRank: '30', maxIvRank: '55' })).toMatchObject({
      ivRankFloorEnabled: true,
      minIvRank: '30',
      ivRankCeilingEnabled: true,
      maxIvRank: '55'
    })
  })

  it('maps an off toggle to null even when a value is typed', () => {
    const payload = toPayload({ ...DEFAULT_FORM_INPUT, minIvRank: '30', maxIvRank: '55' })
    expect(payload.minIvRank).toBeNull()
    expect(payload.maxIvRank).toBeNull()
  })

  it('maps an on toggle to its typed value', () => {
    const payload = toPayload({ ...IV_BAND_ON, minIvRank: '30', maxIvRank: '55' })
    expect(payload.minIvRank).toBe('30')
    expect(payload.maxIvRank).toBe('55')
  })

  it('round-trips the defaults to the defaults minus maxSpreadAbsolute', () => {
    expect(toPayload(toFormValues(DEFAULTS))).toEqual({
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
      minIvRank: null,
      maxIvRank: null,
      earningsHandling: 'exclude'
    })
  })
})
