// [US-67] Configure screening criteria — renderer API adapter contract.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getScreeningCriteria,
  saveScreeningCriteria,
  type SaveScreeningCriteriaPayload
} from './screening-criteria'

const mockGetCriteria = vi.fn()
const mockSaveCriteria = vi.fn()

beforeEach(() => {
  mockGetCriteria.mockReset()
  mockSaveCriteria.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      screener: {
        getCriteria: mockGetCriteria,
        saveCriteria: mockSaveCriteria
      }
    }
  })
})

// Field-for-field mirror of IpcScreeningCriteria (src/preload/index.d.ts).
const CRITERIA = {
  deltaMin: '0.20',
  deltaMax: '0.30',
  dteMin: 30,
  dteMax: 45,
  minOpenInterest: 500,
  maxSpreadPercent: '10',
  maxSpreadAbsolute: '0.10',
  maxUnderlyingPrice: null,
  minIvRank: null,
  earningsHandling: 'exclude' as const
}

// The save payload omits maxSpreadAbsolute — there is no input for it in the sheet.
const PAYLOAD: SaveScreeningCriteriaPayload = {
  deltaMin: '0.15',
  deltaMax: '0.20',
  dteMin: 40,
  dteMax: 45,
  minOpenInterest: 500,
  maxSpreadPercent: '10',
  maxUnderlyingPrice: '75',
  minIvRank: '30',
  earningsHandling: 'flag'
}

describe('getScreeningCriteria', () => {
  it('calls window.api.screener.getCriteria and unwraps the criteria document', async () => {
    mockGetCriteria.mockResolvedValue({ ok: true, criteria: CRITERIA })

    await expect(getScreeningCriteria()).resolves.toEqual(CRITERIA)
    expect(mockGetCriteria).toHaveBeenCalledOnce()
  })

  it('throws a mapped ApiError on an ok:false envelope', async () => {
    mockGetCriteria.mockResolvedValue({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })

    await expect(getScreeningCriteria()).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    })
  })
})

describe('saveScreeningCriteria', () => {
  it('passes the payload through verbatim and unwraps the persisted criteria', async () => {
    const persisted = { ...CRITERIA, ...PAYLOAD, maxSpreadAbsolute: '0.10' }
    mockSaveCriteria.mockResolvedValue({ ok: true, criteria: persisted })

    await expect(saveScreeningCriteria(PAYLOAD)).resolves.toEqual(persisted)
    expect(mockSaveCriteria).toHaveBeenCalledWith(PAYLOAD)
  })

  it('throws a mapped ApiError carrying the offending field and its message', async () => {
    mockSaveCriteria.mockResolvedValue({
      ok: false,
      errors: [
        {
          field: 'deltaMax',
          code: 'inverted_band',
          message: 'Minimum delta must be less than maximum delta'
        }
      ]
    })

    await expect(
      saveScreeningCriteria({ ...PAYLOAD, deltaMin: '0.30', deltaMax: '0.20' })
    ).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          {
            field: 'deltaMax',
            code: 'inverted_band',
            message: 'Minimum delta must be less than maximum delta'
          }
        ]
      }
    })
  })
})
