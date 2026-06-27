import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'

const listManagementQueue = vi.fn()

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('../services/alerts', () => ({
  listManagementQueue
}))

function getRegisteredHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): ((...args: unknown[]) => unknown) | undefined {
  return calls.find(([ch]) => ch === channel)?.[1]
}

describe('registerAlertsHandlers', () => {
  let db: Database.Database

  beforeEach(() => {
    vi.clearAllMocks()
    listManagementQueue.mockReset()
    db = {} as Database.Database
  })

  it('alerts:list returns { ok: true, items } sorted for the queue', async () => {
    const { ipcMain } = await import('electron')
    const { registerAlertsHandlers } = await import('./alerts')

    const items = [
      {
        alertId: 'a1',
        positionId: 'p1',
        ticker: 'AAPL',
        phase: 'CSP_OPEN',
        urgency: 'high',
        summary: 'Expires in 3 days at $180.00 strike',
        quickAction: 'Review position',
        triggeredAt: '2026-06-25T12:00:00.000Z'
      }
    ]
    listManagementQueue.mockReturnValue(items)

    registerAlertsHandlers({ db })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'alerts:list'
    )

    const result = await handler?.(null)

    expect(listManagementQueue).toHaveBeenCalledWith(db)
    expect(result).toMatchObject({ ok: true, items })
  })

  it('alerts:list returns an internal_error envelope when the query throws', async () => {
    const { ipcMain } = await import('electron')
    const { registerAlertsHandlers } = await import('./alerts')

    listManagementQueue.mockImplementation(() => {
      throw new Error('db unavailable')
    })

    registerAlertsHandlers({ db })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'alerts:list'
    )

    const result = await handler?.(null)

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__root__', code: 'internal_error' })]
    })
  })
})
