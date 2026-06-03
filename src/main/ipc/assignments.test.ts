import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { PollingScheduler } from '../services/polling-scheduler'

const listPending = vi.fn()
const confirmPending = vi.fn()
const dismissPending = vi.fn()

class PendingAssignmentError extends Error {
  code: 'NOT_PENDING' | 'NOT_FOUND'
  constructor(code: 'NOT_PENDING' | 'NOT_FOUND', message?: string) {
    super(message ?? code)
    this.name = 'PendingAssignmentError'
    this.code = code
  }
}

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('../services/pending-assignments', () => ({
  listPending,
  confirmPending,
  dismissPending,
  PendingAssignmentError
}))

function getRegisteredHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): ((...args: unknown[]) => unknown) | undefined {
  return calls.find(([ch]) => ch === channel)?.[1]
}

describe('registerAssignmentsIpc', () => {
  let db: Database.Database
  let scheduler: PollingScheduler & { runNow: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    listPending.mockReset()
    confirmPending.mockReset()
    dismissPending.mockReset()
    db = {} as Database.Database
    scheduler = {
      runNow: vi.fn(),
      register: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    } as unknown as typeof scheduler
  })

  it('assignments:list-pending returns { ok: true, assignments } with display fields populated', async () => {
    const { ipcMain } = await import('electron')
    const { registerAssignmentsIpc } = await import('./assignments')

    const mockAssignments = [
      {
        id: 1,
        ticker: 'AAPL',
        strike: '180.00',
        expiration: '2026-01-17',
        contractType: 'put',
        qty: 1,
        transactionTime: '2026-01-17T16:00:00Z',
        positionId: 'pos-1'
      }
    ]
    listPending.mockReturnValue(mockAssignments)

    registerAssignmentsIpc({ db, scheduler })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'assignments:list-pending'
    )

    const result = await handler?.(null)

    expect(result).toMatchObject({ ok: true, assignments: mockAssignments })
  })

  it('assignments:confirm rejects invalid pendingAssignmentId via Zod with { ok: false, errors }', async () => {
    const { ipcMain } = await import('electron')
    const { registerAssignmentsIpc } = await import('./assignments')

    registerAssignmentsIpc({ db, scheduler })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'assignments:confirm'
    )

    const result = await handler?.(null, { pendingAssignmentId: -1 })

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'pendingAssignmentId' })]
    })
  })

  it('assignments:confirm returns { ok: true, position } on success', async () => {
    const { ipcMain } = await import('electron')
    const { registerAssignmentsIpc } = await import('./assignments')

    confirmPending.mockReturnValue({
      id: 1,
      phase: 'HOLDING_SHARES',
      assignedAt: '2026-01-17'
    })

    registerAssignmentsIpc({ db, scheduler })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'assignments:confirm'
    )

    const result = await handler?.(null, { pendingAssignmentId: 1 })

    expect(result).toMatchObject({ ok: true, position: { phase: 'HOLDING_SHARES' } })
  })

  it('assignments:confirm returns { ok: false, code: NOT_PENDING } when row is not pending', async () => {
    const { ipcMain } = await import('electron')
    const { registerAssignmentsIpc } = await import('./assignments')

    confirmPending.mockImplementation(() => {
      throw new PendingAssignmentError('NOT_PENDING')
    })

    registerAssignmentsIpc({ db, scheduler })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'assignments:confirm'
    )

    const result = await handler?.(null, { pendingAssignmentId: 1 })

    expect(result).toMatchObject({ ok: false, code: 'NOT_PENDING' })
  })

  it('assignments:dismiss returns { ok: true, dismissedAt }', async () => {
    const { ipcMain } = await import('electron')
    const { registerAssignmentsIpc } = await import('./assignments')

    dismissPending.mockReturnValue(undefined)

    registerAssignmentsIpc({ db, scheduler })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'assignments:dismiss'
    )

    const result = (await handler?.(null, { pendingAssignmentId: 1 })) as {
      ok: boolean
      dismissedAt?: string
    }

    expect(result.ok).toBe(true)
    expect(result.dismissedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('assignments:run-detection-now invokes scheduler.runNow and returns batch summary', async () => {
    const { ipcMain } = await import('electron')
    const { registerAssignmentsIpc } = await import('./assignments')

    scheduler.runNow.mockResolvedValue(undefined)

    registerAssignmentsIpc({ db, scheduler })

    const handler = getRegisteredHandler(
      vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>,
      'assignments:run-detection-now'
    )

    const result = await handler?.(null)

    expect(scheduler.runNow).toHaveBeenCalledWith('detect-assignments')
    expect(result).toMatchObject({ ok: true })
  })
})
