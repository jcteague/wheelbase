import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PollingScheduler } from '../services/polling-scheduler'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() }
}))

const scheduler: PollingScheduler = {
  register: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  runNow: vi.fn(),
  getRegistry: vi.fn()
}

function getHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): (...args: unknown[]) => unknown {
  const entry = calls.find(([name]) => name === channel)
  if (!entry) throw new Error(`Handler not registered for channel: ${channel}`)
  return entry[1]
}

describe('registerIvrIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ivr:collect-now returns the collector batch summary through handleIpcCall', async () => {
    const { ipcMain } = await import('electron')
    const { registerIvrIpc } = await import('./ivr')

    vi.mocked(scheduler.runNow).mockResolvedValue({
      successCount: 2,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    })

    registerIvrIpc({ scheduler })

    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'ivr:collect-now'
    )

    const result = await handler(null)

    expect(vi.mocked(scheduler.runNow)).toHaveBeenCalledWith('ivr-collect')
    expect(result).toEqual({
      ok: true,
      batch: {
        successCount: 2,
        errorCount: 1,
        skippedCount: 0,
        skippedReason: null
      }
    })
  })

  it('ivr:collect-now returns an ipc error envelope when the job swallows an error and resolves undefined', async () => {
    const { ipcMain } = await import('electron')
    const { registerIvrIpc } = await import('./ivr')

    // The scheduler catches handler exceptions and resolves undefined; the IPC
    // layer must reject that rather than report { ok: true, batch: undefined }.
    vi.mocked(scheduler.runNow).mockResolvedValue(undefined)

    registerIvrIpc({ scheduler })

    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'ivr:collect-now'
    )

    const result = await handler(null)

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: '__root__',
          code: 'internal_error',
          message: 'An unexpected error occurred'
        }
      ]
    })
  })

  it('ivr:collect-now returns a standard ipc error envelope when scheduler.runNow rejects', async () => {
    const { ipcMain } = await import('electron')
    const { registerIvrIpc } = await import('./ivr')

    vi.mocked(scheduler.runNow).mockRejectedValue(new Error('boom'))

    registerIvrIpc({ scheduler })

    const handler = getHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'ivr:collect-now'
    )

    const result = await handler(null)

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: '__root__',
          code: 'internal_error',
          message: 'An unexpected error occurred'
        }
      ]
    })
  })
})
