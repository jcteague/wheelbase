import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'

const listManagementQueue = vi.fn()
const dismissAlert = vi.fn()

class MockAlertError extends Error {
  code: 'NOT_FOUND' | 'NOT_OPEN'
  constructor(code: 'NOT_FOUND' | 'NOT_OPEN', message?: string) {
    super(message ?? code)
    this.name = 'AlertError'
    this.code = code
  }
}

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('../services/alerts', () => ({
  listManagementQueue,
  dismissAlert,
  AlertError: MockAlertError
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
    dismissAlert.mockReset()
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

  it('alerts:dismiss returns the dismissed alert on success', async () => {
    const { ipcMain } = await import('electron')
    const { registerAlertsHandlers } = await import('./alerts')

    const alert = {
      id: 'a1',
      positionId: 'p1',
      ruleCode: 'MANAGEMENT_WINDOW',
      urgency: 'high',
      summary: 'Expires in 3 days at $180.00 strike',
      quickAction: 'Review position',
      status: 'dismissed',
      triggeredAt: '2026-06-25T12:00:00.000Z',
      lastEvaluatedAt: '2026-06-25T12:00:00.000Z',
      resolvedAt: null,
      dismissedAt: '2026-06-25T13:00:00.000Z',
      createdAt: '2026-06-25T12:00:00.000Z',
      updatedAt: '2026-06-25T13:00:00.000Z'
    }
    dismissAlert.mockReturnValue(alert)

    registerAlertsHandlers({ db })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'alerts:dismiss'
    )

    const result = await handler?.(null, { alertId: 'a1' })

    expect(dismissAlert).toHaveBeenCalledWith(db, 'a1', expect.any(String))
    expect(result).toMatchObject({ ok: true, alert })
  })

  it('alerts:dismiss returns a NOT_FOUND error envelope for an unknown alertId', async () => {
    const { ipcMain } = await import('electron')
    const { registerAlertsHandlers } = await import('./alerts')

    dismissAlert.mockImplementation(() => {
      throw new MockAlertError('NOT_FOUND', 'Alert missing-id not found')
    })

    registerAlertsHandlers({ db })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'alerts:dismiss'
    )

    const result = await handler?.(null, { alertId: 'missing-id' })

    expect(result).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      errors: [
        expect.objectContaining({
          field: '__root__',
          code: 'NOT_FOUND',
          message: 'Alert missing-id not found'
        })
      ]
    })
  })

  it('alerts:dismiss returns a NOT_OPEN error envelope with "Only open alerts can be dismissed" for a resolved alert', async () => {
    const { ipcMain } = await import('electron')
    const { registerAlertsHandlers } = await import('./alerts')

    dismissAlert.mockImplementation(() => {
      throw new MockAlertError('NOT_OPEN', 'Only open alerts can be dismissed')
    })

    registerAlertsHandlers({ db })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'alerts:dismiss'
    )

    const result = await handler?.(null, { alertId: 'a1' })

    expect(result).toMatchObject({
      ok: false,
      code: 'NOT_OPEN',
      errors: [
        expect.objectContaining({
          field: '__root__',
          code: 'NOT_OPEN',
          message: 'Only open alerts can be dismissed'
        })
      ]
    })
  })

  it('alerts:dismiss rejects a payload missing alertId via ZodError mapping', async () => {
    const { ipcMain } = await import('electron')
    const { registerAlertsHandlers } = await import('./alerts')

    registerAlertsHandlers({ db })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'alerts:dismiss'
    )

    const result = await handler?.(null, {})

    expect(dismissAlert).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'alertId' })]
    })
  })
})
