// [US-110] Edit PMCC screening criteria — renderer API adapter contract.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PMCC_SCREENING_CRITERIA } from '../../../main/core/pmcc-screener'
import {
  getPmccScreeningCriteria,
  savePmccScreeningCriteria,
  type SavePmccScreeningCriteriaPayload
} from './pmcc-screening-criteria'

const mockGetPmccCriteria = vi.fn<Window['api']['screener']['getPmccCriteria']>()
const mockSavePmccCriteria = vi.fn<Window['api']['screener']['savePmccCriteria']>()

beforeEach(() => {
  mockGetPmccCriteria.mockReset()
  mockSavePmccCriteria.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      screener: {
        getPmccCriteria: mockGetPmccCriteria,
        savePmccCriteria: mockSavePmccCriteria
      }
    }
  })
})

// The save payload omits maxSpreadAbsolute — there is no input for it in the sheet.
const PAYLOAD: SavePmccScreeningCriteriaPayload = {
  longDeltaMin: '0.70',
  longDeltaMax: '0.85',
  longDteMin: 180,
  longDteMax: 540,
  shortDeltaMin: '0.25',
  shortDeltaMax: '0.35',
  shortDteMin: 20,
  shortDteMax: 45,
  maxDebitToWidthPercent: '85',
  minOpenInterest: 200,
  maxSpreadPercent: '10',
  minIvRank: '30',
  maxIvRank: '55',
  earningsHandling: 'flag'
}

const ROOT_ERROR = {
  field: '__root__',
  code: 'internal_error',
  message: 'An unexpected error occurred'
}

describe('getPmccScreeningCriteria', () => {
  it('calls window.api.screener.getPmccCriteria and unwraps the criteria document', async () => {
    mockGetPmccCriteria.mockResolvedValue({ ok: true, criteria: DEFAULT_PMCC_SCREENING_CRITERIA })

    await expect(getPmccScreeningCriteria()).resolves.toEqual(DEFAULT_PMCC_SCREENING_CRITERIA)
    expect(mockGetPmccCriteria).toHaveBeenCalledOnce()
  })

  it('throws a mapped ApiError on an ok:false envelope', async () => {
    mockGetPmccCriteria.mockResolvedValue({ ok: false, errors: [ROOT_ERROR] })

    await expect(getPmccScreeningCriteria()).rejects.toEqual({
      status: 400,
      body: { detail: [ROOT_ERROR] }
    })
  })
})

describe('savePmccScreeningCriteria', () => {
  it('passes the payload through verbatim and unwraps the persisted criteria', async () => {
    const persisted = { ...PAYLOAD, maxSpreadAbsolute: '0.10' }
    mockSavePmccCriteria.mockResolvedValue({ ok: true, criteria: persisted })

    await expect(savePmccScreeningCriteria(PAYLOAD)).resolves.toEqual(persisted)
    expect(mockSavePmccCriteria).toHaveBeenCalledWith(PAYLOAD)
  })

  it('throws a mapped ApiError carrying the offending field and its message', async () => {
    const overlap = {
      field: 'longDteMin',
      code: 'overlapping_windows',
      message: 'LEAPS minimum DTE must exceed short-call maximum DTE'
    }
    mockSavePmccCriteria.mockResolvedValue({ ok: false, errors: [overlap] })

    await expect(savePmccScreeningCriteria({ ...PAYLOAD, longDteMin: 40 })).rejects.toEqual({
      status: 400,
      body: { detail: [overlap] }
    })
  })
})
