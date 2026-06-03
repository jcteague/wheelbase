import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks for all main-process dependencies (hoisted by Vitest)

vi.mock('electron', () => {
  class BrowserWindowMock {
    on = vi.fn()
    show = vi.fn()
    webContents = { setWindowOpenHandler: vi.fn(), send: vi.fn() }
    loadURL = vi.fn()
    loadFile = vi.fn()
    static getAllWindows = vi.fn(() => [])
  }

  return {
    app: {
      whenReady: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      exit: vi.fn(),
      quit: vi.fn(),
      commandLine: { appendSwitch: vi.fn() },
      setAppUserModelId: vi.fn()
    },
    shell: { openExternal: vi.fn() },
    BrowserWindow: BrowserWindowMock,
    ipcMain: { handle: vi.fn() }
  }
})

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() }
}))

vi.mock('./db/index', () => ({
  initDb: vi.fn().mockReturnValue({})
}))

vi.mock('./ipc/ping', () => ({ registerPingHandler: vi.fn() }))
vi.mock('./ipc/positions', () => ({ registerPositionsHandlers: vi.fn() }))
vi.mock('./ipc/market-data', () => ({ registerMarketDataHandlers: vi.fn() }))
vi.mock('./ipc/broker', () => ({ registerBrokerHandlers: vi.fn() }))
vi.mock('./ipc/assignments', () => ({ registerAssignmentsIpc: vi.fn() }))

vi.mock('./integrations/market-data-factory', () => ({
  marketDataFactory: { create: vi.fn().mockReturnValue({ disconnect: vi.fn() }) }
}))

vi.mock('./integrations/broker-factory', () => ({
  brokerFactory: {
    create: vi.fn().mockReturnValue({
      getMarketStatus: vi.fn(),
      getActivities: vi.fn()
    })
  }
}))

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('./services/detect-assignments', () => ({
  DETECT_ASSIGNMENTS_JOB_NAME: 'detect-assignments',
  detectAssignments: vi.fn().mockResolvedValue({ detected: 0, skipped: 0 })
}))

const mockSchedulerRegister = vi.fn()
const mockSchedulerStart = vi.fn()
const mockSchedulerStop = vi.fn().mockResolvedValue(undefined)
const mockSchedulerRunNow = vi.fn().mockResolvedValue(undefined)

vi.mock('./services/scheduler-instance', () => ({
  scheduler: {
    register: mockSchedulerRegister,
    start: mockSchedulerStart,
    stop: mockSchedulerStop,
    runNow: mockSchedulerRunNow
  }
}))

// --- Tests ---

describe('scheduler-instance singleton', () => {
  it('importing scheduler-instance twice returns the same object reference', async () => {
    const modA = await import('./services/scheduler-instance')
    const modB = await import('./services/scheduler-instance')
    expect(modA.scheduler).toBe(modB.scheduler)
  })
})

describe('main process bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSchedulerStop.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetModules()
  })

  async function triggerBootstrap(): Promise<{
    appOnHandlers: Map<string, (...args: unknown[]) => unknown>
  }> {
    const { app } = await import('electron')
    const appOnHandlers = new Map<string, (...args: unknown[]) => unknown>()

    vi.mocked(app.on).mockImplementation((event: string, handler: unknown) => {
      appOnHandlers.set(event, handler as (...args: unknown[]) => unknown)
      return app
    })

    // The whenReady promise resolves; the .then callback is the bootstrap body
    // Use a ref object so TypeScript tracks the assignment inside the callback closure
    const boot: { callback: ((...args: unknown[]) => unknown) | null } = { callback: null }
    vi.mocked(app.whenReady).mockImplementation(() => {
      return {
        then: (cb: (...args: unknown[]) => unknown) => {
          boot.callback = cb
          return Promise.resolve()
        }
      } as unknown as Promise<void>
    })

    await import('./index')

    // Run the bootstrap callback after module loads
    if (boot.callback) await boot.callback()

    return { appOnHandlers }
  }

  it('bootstrap registers detect-assignments job on the scheduler', async () => {
    await triggerBootstrap()

    expect(mockSchedulerRegister).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'detect-assignments' })
    )
  })

  it('bootstrap starts the scheduler after registering jobs', async () => {
    await triggerBootstrap()

    expect(mockSchedulerStart).toHaveBeenCalled()
    // start() must come after register()
    const registerOrder = mockSchedulerRegister.mock.invocationCallOrder[0]
    const startOrder = mockSchedulerStart.mock.invocationCallOrder[0]
    expect(startOrder).toBeGreaterThan(registerOrder)
  })

  it('before-quit handler calls scheduler.stop() and awaits it before app.exit()', async () => {
    const { appOnHandlers } = await triggerBootstrap()

    const beforeQuitHandler = appOnHandlers.get('before-quit')
    expect(beforeQuitHandler).toBeDefined()

    const { app } = await import('electron')
    const mockEvent = { preventDefault: vi.fn() }
    await beforeQuitHandler!(mockEvent)

    expect(mockSchedulerStop).toHaveBeenCalled()
    expect(vi.mocked(app.exit)).toHaveBeenCalled()
    // stop() must resolve before exit() is called
    const stopOrder = mockSchedulerStop.mock.invocationCallOrder[0]
    const exitOrder = vi.mocked(app.exit).mock.invocationCallOrder[0]
    expect(exitOrder).toBeGreaterThan(stopOrder)
  })
})
