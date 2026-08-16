// [US-67] Renderer form schema for the screening-criteria sheet.
//
// Every numeric field is a `z.string()` so an in-progress `'0.'` stays typeable;
// bounds and cross-field rules mirror the shared module in
// `src/main/core/screening-criteria.ts`. The message literals below are pinned
// verbatim from the story's acceptance criteria on purpose — the schema must
// surface exactly these strings to the trader.

import { describe, expect, it } from 'vitest'
import type { ScreeningCriteria } from '../api/screening-criteria'
import {
  screeningCriteriaSchema,
  toFormValues,
  toPayload,
  type ScreeningCriteriaFormInput
} from './screening-criteria'

// The shipped defaults expressed as form input — the exact values the sheet
// shows on a fresh install and after "Reset to defaults".
const DEFAULT_FORM_INPUT: ScreeningCriteriaFormInput = {
  deltaMin: '0.20',
  deltaMax: '0.30',
  dteMin: '30',
  dteMax: '45',
  minOpenInterest: '500',
  maxSpreadPercent: '10',
  priceCeilingEnabled: false,
  maxUnderlyingPrice: '',
  ivRankFloorEnabled: false,
  minIvRank: '',
  earningsHandling: 'exclude'
}

function issuesOf(input: unknown): Array<{ path: string; message: string }> {
  const result = screeningCriteriaSchema.safeParse(input)
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message
  }))
}

describe('screeningCriteriaSchema', () => {
  it('parses the shipped default values', () => {
    const result = screeningCriteriaSchema.safeParse(DEFAULT_FORM_INPUT)
    expect(result.success).toBe(true)
  })

  it('rejects a max delta above the allowed range', () => {
    expect(issuesOf({ ...DEFAULT_FORM_INPUT, deltaMax: '1.5' })).toContainEqual({
      path: 'deltaMax',
      message: 'Delta must be between 0.01 and 0.99'
    })
  })

  it('rejects a minimum DTE of zero', () => {
    expect(issuesOf({ ...DEFAULT_FORM_INPUT, dteMin: '0' })).toContainEqual({
      path: 'dteMin',
      message: 'DTE must be at least 1'
    })
  })

  it('rejects a negative open-interest floor', () => {
    expect(issuesOf({ ...DEFAULT_FORM_INPUT, minOpenInterest: '-100' })).toContainEqual({
      path: 'minOpenInterest',
      message: 'Open interest floor cannot be negative'
    })
  })

  it('rejects a max spread of zero percent', () => {
    expect(issuesOf({ ...DEFAULT_FORM_INPUT, maxSpreadPercent: '0' })).toContainEqual({
      path: 'maxSpreadPercent',
      message: 'Max spread must be between 1% and 50%'
    })
  })

  it('rejects an inverted delta band, attaching the error to deltaMax', () => {
    expect(issuesOf({ ...DEFAULT_FORM_INPUT, deltaMin: '0.30', deltaMax: '0.20' })).toContainEqual({
      path: 'deltaMax',
      message: 'Minimum delta must be less than maximum delta'
    })
  })

  it('rejects an inverted DTE window, attaching the error to dteMax', () => {
    expect(issuesOf({ ...DEFAULT_FORM_INPUT, dteMin: '45', dteMax: '30' })).toContainEqual({
      path: 'dteMax',
      message: 'Minimum DTE must be less than maximum DTE'
    })
  })

  it('does not validate the price ceiling while the toggle is off', () => {
    const blank = screeningCriteriaSchema.safeParse({
      ...DEFAULT_FORM_INPUT,
      priceCeilingEnabled: false,
      maxUnderlyingPrice: ''
    })
    const garbage = screeningCriteriaSchema.safeParse({
      ...DEFAULT_FORM_INPUT,
      priceCeilingEnabled: false,
      maxUnderlyingPrice: 'abc'
    })
    expect(blank.success).toBe(true)
    expect(garbage.success).toBe(true)
  })

  it('rejects a price ceiling of zero once the toggle is on', () => {
    expect(
      issuesOf({ ...DEFAULT_FORM_INPUT, priceCeilingEnabled: true, maxUnderlyingPrice: '0' })
    ).toContainEqual({
      path: 'maxUnderlyingPrice',
      message: 'Price ceiling must be greater than zero'
    })
  })

  it('does not validate the IV-rank floor while the toggle is off', () => {
    const result = screeningCriteriaSchema.safeParse({
      ...DEFAULT_FORM_INPUT,
      ivRankFloorEnabled: false,
      minIvRank: 'abc'
    })
    expect(result.success).toBe(true)
  })

  it('rejects an IV-rank floor above 100 once the toggle is on', () => {
    expect(
      issuesOf({ ...DEFAULT_FORM_INPUT, ivRankFloorEnabled: true, minIvRank: '101' })
    ).toContainEqual({
      path: 'minIvRank',
      message: 'IV rank floor must be between 0 and 100'
    })
  })
})

describe('toPayload', () => {
  function parse(
    input: ScreeningCriteriaFormInput
  ): ReturnType<typeof screeningCriteriaSchema.parse> {
    return screeningCriteriaSchema.parse(input)
  }

  it('sends null for both optionals when their toggles are off, even with values typed', () => {
    const payload = toPayload(
      parse({
        ...DEFAULT_FORM_INPUT,
        priceCeilingEnabled: false,
        maxUnderlyingPrice: '75',
        ivRankFloorEnabled: false,
        minIvRank: '30'
      })
    )

    expect(payload.maxUnderlyingPrice).toBeNull()
    expect(payload.minIvRank).toBeNull()
  })

  it('sends the typed values for both optionals when their toggles are on', () => {
    const payload = toPayload(
      parse({
        ...DEFAULT_FORM_INPUT,
        priceCeilingEnabled: true,
        maxUnderlyingPrice: '75',
        ivRankFloorEnabled: true,
        minIvRank: '30'
      })
    )

    expect(payload.maxUnderlyingPrice).toBe('75')
    expect(payload.minIvRank).toBe('30')
  })

  it('passes earningsHandling straight through', () => {
    expect(
      toPayload(parse({ ...DEFAULT_FORM_INPUT, earningsHandling: 'flag' })).earningsHandling
    ).toBe('flag')
    expect(
      toPayload(parse({ ...DEFAULT_FORM_INPUT, earningsHandling: 'exclude' })).earningsHandling
    ).toBe('exclude')
  })

  it('maps the shipped defaults to the persisted payload shape, numerics as numbers', () => {
    expect(toPayload(parse(DEFAULT_FORM_INPUT))).toEqual({
      deltaMin: '0.20',
      deltaMax: '0.30',
      dteMin: 30,
      dteMax: 45,
      minOpenInterest: 500,
      maxSpreadPercent: '10',
      maxUnderlyingPrice: null,
      minIvRank: null,
      earningsHandling: 'exclude'
    })
  })
})

describe('toFormValues', () => {
  it('turns persisted criteria into pre-filled form input', () => {
    const criteria: ScreeningCriteria = {
      deltaMin: '0.15',
      deltaMax: '0.25',
      dteMin: 20,
      dteMax: 40,
      minOpenInterest: 800,
      maxSpreadPercent: '8',
      maxSpreadAbsolute: '0.10',
      maxUnderlyingPrice: '75',
      minIvRank: '30',
      earningsHandling: 'flag'
    }

    const values = toFormValues(criteria)

    expect(values.deltaMin).toBe('0.15')
    expect(values.deltaMax).toBe('0.25')
    expect(values.dteMin).toBe('20')
    expect(values.dteMax).toBe('40')
    expect(values.minOpenInterest).toBe('800')
    expect(values.maxSpreadPercent).toBe('8')
    expect(values.priceCeilingEnabled).toBe(true)
    expect(values.maxUnderlyingPrice).toBe('75')
    expect(values.ivRankFloorEnabled).toBe(true)
    expect(values.minIvRank).toBe('30')
    expect(values.earningsHandling).toBe('flag')
  })

  it('turns null optionals into disabled toggles', () => {
    const criteria: ScreeningCriteria = {
      deltaMin: '0.20',
      deltaMax: '0.30',
      dteMin: 30,
      dteMax: 45,
      minOpenInterest: 500,
      maxSpreadPercent: '10',
      maxSpreadAbsolute: '0.10',
      maxUnderlyingPrice: null,
      minIvRank: null,
      earningsHandling: 'exclude'
    }

    const values = toFormValues(criteria)

    expect(values.priceCeilingEnabled).toBe(false)
    expect(values.ivRankFloorEnabled).toBe(false)
  })

  it('round-trips persisted criteria through the form and back to the payload', () => {
    const criteria: ScreeningCriteria = {
      deltaMin: '0.15',
      deltaMax: '0.25',
      dteMin: 20,
      dteMax: 40,
      minOpenInterest: 800,
      maxSpreadPercent: '8',
      maxSpreadAbsolute: '0.10',
      maxUnderlyingPrice: '75',
      minIvRank: '30',
      earningsHandling: 'flag'
    }

    const roundTripped = toPayload(screeningCriteriaSchema.parse(toFormValues(criteria)))

    expect(roundTripped).toEqual({
      deltaMin: '0.15',
      deltaMax: '0.25',
      dteMin: 20,
      dteMax: 40,
      minOpenInterest: 800,
      maxSpreadPercent: '8',
      maxUnderlyingPrice: '75',
      minIvRank: '30',
      earningsHandling: 'flag'
    })
  })

  it('round-trips criteria whose optionals are both off', () => {
    const criteria: ScreeningCriteria = {
      deltaMin: '0.20',
      deltaMax: '0.30',
      dteMin: 30,
      dteMax: 45,
      minOpenInterest: 500,
      maxSpreadPercent: '10',
      maxSpreadAbsolute: '0.10',
      maxUnderlyingPrice: null,
      minIvRank: null,
      earningsHandling: 'exclude'
    }

    const roundTripped = toPayload(screeningCriteriaSchema.parse(toFormValues(criteria)))

    expect(roundTripped).toEqual({
      deltaMin: '0.20',
      deltaMax: '0.30',
      dteMin: 30,
      dteMax: 45,
      minOpenInterest: 500,
      maxSpreadPercent: '10',
      maxUnderlyingPrice: null,
      minIvRank: null,
      earningsHandling: 'exclude'
    })
  })
})
