import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissAlert, listManagementQueue } from './alerts'

const mockList = vi.fn()
const mockDismiss = vi.fn()

beforeEach(() => {
  mockList.mockReset()
  mockDismiss.mockReset()
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      alerts: {
        list: mockList,
        dismiss: mockDismiss
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

const DISMISSED_ALERT = {
  id: 'a1',
  positionId: 'p1',
  ruleCode: 'MANAGEMENT_WINDOW',
  urgency: 'high' as const,
  summary: 'Expires in 3 days at $180.00 strike',
  quickAction: 'Review position',
  status: 'dismissed' as const,
  triggeredAt: '2026-06-25T12:00:00.000Z',
  lastEvaluatedAt: '2026-06-25T12:00:00.000Z',
  resolvedAt: null,
  dismissedAt: '2026-06-26T09:00:00.000Z',
  createdAt: '2026-06-25T12:00:00.000Z',
  updatedAt: '2026-06-26T09:00:00.000Z'
}

describe('dismissAlert', () => {
  it('resolves with the dismissed alert on success', async () => {
    mockDismiss.mockResolvedValue({ ok: true, alert: DISMISSED_ALERT })

    await expect(dismissAlert('a1')).resolves.toEqual(DISMISSED_ALERT)
    expect(mockDismiss).toHaveBeenCalledWith({ alertId: 'a1' })
  })

  it('throws a mapped ApiError with the NOT_OPEN message on rejection', async () => {
    mockDismiss.mockResolvedValue({
      ok: false,
      errors: [
        { field: '__root__', code: 'NOT_OPEN', message: 'Only open alerts can be dismissed' }
      ]
    })

    await expect(dismissAlert('a1')).rejects.toMatchObject({
      status: 400,
      body: {
        detail: [
          { field: '__root__', code: 'NOT_OPEN', message: 'Only open alerts can be dismissed' }
        ]
      }
    })
  })
})
