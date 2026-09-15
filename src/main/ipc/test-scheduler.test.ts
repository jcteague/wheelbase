// Dev-only scheduler channels. `_test:scheduler-run-scheduled` is the only way an e2e
// spec can prove the *scheduled* trigger still refuses a weekend — driving `runNow`
// would assert the explicit path and pass for the wrong reason.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PollingScheduler } from '../services/polling-scheduler'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

function makeScheduler(): PollingScheduler {
  return {
    register: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    runNow: vi.fn(),
    getRegistry: vi.fn(() => [])
  }
}

async function handlersFor(
  scheduler: PollingScheduler
): Promise<Map<string, (...a: never[]) => unknown>> {
  const { ipcMain } = await import('electron')
  const { registerTestSchedulerIpc } = await import('./test-scheduler')

  registerTestSchedulerIpc(scheduler)

  return new Map(
    vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...a: never[]) => unknown]>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('_test:scheduler-run-scheduled', () => {
  it('drives the job as though the timer had fired and returns its result', async () => {
    const scheduler = makeScheduler()
    const batch = { successCount: 2, errorCount: 0, skippedCount: 0, skippedReason: null }
    vi.mocked(scheduler.runNow).mockResolvedValue(batch)

    const handlers = await handlersFor(scheduler)

    await expect(
      handlers.get('_test:scheduler-run-scheduled')!(null as never, 'ivr-collect' as never)
    ).resolves.toEqual(batch)
    expect(scheduler.runNow).toHaveBeenCalledWith('ivr-collect', { trigger: 'scheduled' })
  })

  it('leaves the existing run-now channel on the explicit trigger', async () => {
    const scheduler = makeScheduler()
    vi.mocked(scheduler.runNow).mockResolvedValue(undefined)

    const handlers = await handlersFor(scheduler)
    await handlers.get('_test:scheduler-run-now')!(null as never, 'ivr-collect' as never)

    expect(scheduler.runNow).toHaveBeenCalledWith('ivr-collect')
  })
})
