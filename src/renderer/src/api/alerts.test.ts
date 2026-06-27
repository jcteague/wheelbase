import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listManagementQueue } from './alerts'

const mockList = vi.fn()

beforeEach(() => {
  mockList.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      alerts: {
        list: mockList
      }
    }
  })
})

const ITEM: ManagementQueueItem = {
  alertId: 'a1',
  positionId: 'p1',
  ticker: 'AAPL',
  phase: 'CSP_OPEN',
  urgency: 'high',
  summary: 'Expires in 3 days at $180.00 strike',
  quickAction: 'Review position',
  triggeredAt: '2026-06-25T12:00:00.000Z'
}

describe('listManagementQueue', () => {
  it('maps a successful response to the items array', async () => {
    mockList.mockResolvedValue({ ok: true, items: [ITEM] })

    await expect(listManagementQueue()).resolves.toEqual([ITEM])
  })

  it('returns an empty array when the call fails', async () => {
    mockList.mockResolvedValue({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })

    await expect(listManagementQueue()).resolves.toEqual([])
  })
})
