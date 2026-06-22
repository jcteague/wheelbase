import { beforeEach, describe, expect, it, vi } from 'vitest'
import { collectIvrNow } from './ivr'

const mockCollectNow = vi.fn()

beforeEach(() => {
  mockCollectNow.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      ivr: {
        collectNow: mockCollectNow
      }
    }
  })
})

describe('collectIvrNow', () => {
  it('returns the unwrapped batch on ok:true', async () => {
    mockCollectNow.mockResolvedValue({
      ok: true,
      batch: {
        successCount: 3,
        errorCount: 1,
        skippedCount: 0,
        skippedReason: null
      }
    })

    await expect(collectIvrNow()).resolves.toEqual({
      successCount: 3,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    })
  })

  it('collectIvrNow throws ApiError on ok:false', async () => {
    const errors = [
      { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
    ]
    mockCollectNow.mockResolvedValue({ ok: false, errors })

    await expect(collectIvrNow()).rejects.toMatchObject({
      status: 502,
      body: { detail: errors }
    })
  })
})
