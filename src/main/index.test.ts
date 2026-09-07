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
    ipcMain: { handle: vi.fn() },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((s: string) => Buffer.from(s)),
      decryptString: vi.fn((b: Buffer) => b.toString())
    }
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
const restartStockQuoteStream = vi.fn(async () => {})
vi.mock('./ipc/market-data', () => ({
  registerMarketDataHandlers: vi.fn(() => ({ restartStockQuoteStream }))
}))
vi.mock('./ipc/broker', () => ({ registerBrokerHandlers: vi.fn() }))
vi.mock('./ipc/assignments', () => ({ registerAssignmentsIpc: vi.fn() }))
vi.mock('./ipc/ivr', () => ({ registerIvrIpc: vi.fn() }))
vi.mock('./ipc/settings', () => ({ registerSettingsHandlers: vi.fn() }))

vi.mock('./integrations/market-data-factory', () => ({
  marketDataFactory: {
    create: vi.fn().mockReturnValue({ disconnect: vi.fn() }),
    configure: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('./integrations/broker-factory', () => ({
  brokerFactory: {
    create: vi.fn().mockReturnValue({
      getMarketStatus: vi.fn(),
      getActivities: vi.fn()
    }),
    configure: vi.fn(),
    recreate: vi.fn()
  }
}))

vi.mock('./services/settings', () => ({
  createSettingsService: vi.fn(() => ({
    getCredentialStatus: vi.fn().mockReturnValue({ activeBrokerEnv: 'paper' }),
    loadActiveAlpacaCredentials: vi.fn().mockReturnValue(null)
  }))
}))

vi.mock('./services/settings-connections', () => ({
  testAlpacaConnection: vi.fn()
}))

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('./services/detect-assignments', () => ({
  DETECT_ASSIGNMENTS_JOB_NAME: 'detect-assignments',
  detectAssignments: vi.fn().mockResolvedValue({ detected: 0, skipped: 0 })
}))

vi.mock('./services/ivr-collector', () => ({
  IVR_COLLECT_JOB_NAME: 'ivr-collect',
  collectIVRSnapshots: vi.fn().mockResolvedValue({
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
    skippedReason: null
  })
}))

vi.mock('./services/evaluate-alerts', () => ({
  ALERT_EVAL_JOB_NAME: 'alert-evaluation',
  evaluateAlerts: vi.fn().mockReturnValue({ createdCount: 0, updatedCount: 0, resolvedCount: 0 })
}))

vi.mock('./services/alert-defaults', () => ({
  getAlertDefaults: vi.fn().mockReturnValue({ profitTargetPercent: 50, managementWindowDte: 21 }),
  saveAlertDefaults: vi.fn()
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

  it('registers the ivr-collect scheduler job with afterClose offsetMinutes 60', async () => {
    await triggerBootstrap()

    expect(mockSchedulerRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ivr-collect',
        cadence: { kind: 'afterClose', offsetMinutes: 60 }
      })
    )
  })

  it('ivr-collect job handler delegates to collectIVRSnapshots with db, brokerProvider, and logger', async () => {
    await triggerBootstrap()

    const registration = mockSchedulerRegister.mock.calls
      .map(([job]) => job)
      .find((job) => job.name === 'ivr-collect') as { handler: () => Promise<unknown> } | undefined

    expect(registration).toBeDefined()

    const { collectIVRSnapshots } = await import('./services/ivr-collector')
    const { brokerFactory } = await import('./integrations/broker-factory')
    const brokerProvider = { getMarketStatus: vi.fn(), getActivities: vi.fn() }
    vi.mocked(brokerFactory.create).mockReturnValue(brokerProvider as never)

    await registration!.handler()

    expect(vi.mocked(brokerFactory.create)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(collectIVRSnapshots)).toHaveBeenCalledWith(
      expect.objectContaining({
        db: expect.anything(),
        brokerProvider,
        logger: expect.anything(),
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('ivr-collect handler collects with a null broker when broker creation throws', async () => {
    // The watchlist-only trader has no Alpaca credentials; Barchart needs none, so
    // the handler must degrade to a broker-less run instead of dying before the
    // collector is entered (which would also leave the afterClose job un-rearmed).
    await triggerBootstrap()

    const registration = mockSchedulerRegister.mock.calls
      .map(([job]) => job)
      .find((job) => job.name === 'ivr-collect') as { handler: () => Promise<unknown> } | undefined
    expect(registration).toBeDefined()

    const { collectIVRSnapshots } = await import('./services/ivr-collector')
    const { brokerFactory } = await import('./integrations/broker-factory')
    vi.mocked(brokerFactory.create).mockImplementationOnce(() => {
      throw new Error('Alpaca credentials not configured')
    })

    await expect(registration!.handler()).resolves.toBeDefined()
    expect(vi.mocked(collectIVRSnapshots)).toHaveBeenCalledWith(
      expect.objectContaining({ brokerProvider: null })
    )
  })

  it('before-quit aborts an in-flight IVR collection before draining the scheduler', async () => {
    const { appOnHandlers } = await triggerBootstrap()

    const registration = mockSchedulerRegister.mock.calls
      .map(([job]) => job)
      .find((job) => job.name === 'ivr-collect') as { handler: () => Promise<unknown> } | undefined
    expect(registration).toBeDefined()

    await registration!.handler()
    const { collectIVRSnapshots } = await import('./services/ivr-collector')
    const call = vi.mocked(collectIVRSnapshots).mock.calls.at(-1)?.[0] as { signal?: AbortSignal }
    expect(call.signal).toBeDefined()
    expect(call.signal?.aborted).toBe(false)

    const beforeQuitHandler = appOnHandlers.get('before-quit')
    await beforeQuitHandler!({ preventDefault: vi.fn() })

    expect(call.signal?.aborted).toBe(true)
  })

  it('registers the alert-evaluation scheduler job with an interval cadence', async () => {
    await triggerBootstrap()

    expect(mockSchedulerRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'alert-evaluation',
        cadence: {
          kind: 'interval',
          marketOpenMs: 60_000,
          extendedHoursMs: 300_000,
          marketClosedMs: null
        }
      })
    )
  })

  it('alert-evaluation handler delegates to evaluateAlerts with db and provider', async () => {
    await triggerBootstrap()

    const registration = mockSchedulerRegister.mock.calls
      .map(([job]) => job)
      .find((job) => job.name === 'alert-evaluation') as
      | { handler: () => Promise<unknown> }
      | undefined

    expect(registration).toBeDefined()

    const { evaluateAlerts } = await import('./services/evaluate-alerts')
    const { marketDataFactory } = await import('./integrations/market-data-factory')
    const provider = { disconnect: vi.fn() }
    vi.mocked(marketDataFactory.create).mockReturnValue(provider as never)

    await registration!.handler()

    expect(vi.mocked(marketDataFactory.create)).toHaveBeenCalled()
    expect(vi.mocked(evaluateAlerts)).toHaveBeenCalledWith(
      expect.objectContaining({
        db: expect.anything(),
        provider,
        managementWindowDte: 21,
        profitTargetPercentDefault: 50
      })
    )
  })

  it('alert-evaluation handler reads the current saved global defaults on every tick', async () => {
    await triggerBootstrap()

    const registration = mockSchedulerRegister.mock.calls
      .map(([job]) => job)
      .find((job) => job.name === 'alert-evaluation') as
      | { handler: () => Promise<unknown> }
      | undefined
    expect(registration).toBeDefined()

    const { getAlertDefaults } = await import('./services/alert-defaults')
    vi.mocked(getAlertDefaults).mockReturnValue({
      profitTargetPercent: 40,
      managementWindowDte: 14
    })

    await registration!.handler()

    const { evaluateAlerts } = await import('./services/evaluate-alerts')
    expect(vi.mocked(evaluateAlerts)).toHaveBeenCalledWith(
      expect.objectContaining({ managementWindowDte: 14, profitTargetPercentDefault: 40 })
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

  it('onBrokerProviderChanged refreshes the broker and re-ticks the detect-assignments job', async () => {
    await triggerBootstrap()

    const { registerSettingsHandlers } = await import('./ipc/settings')
    const deps = vi.mocked(registerSettingsHandlers).mock.calls[0]?.[0] as
      | { onBrokerProviderChanged: () => void }
      | undefined
    expect(deps).toBeDefined()

    const { brokerFactory } = await import('./integrations/broker-factory')
    vi.mocked(brokerFactory.recreate).mockClear()
    mockSchedulerRunNow.mockClear()

    // A runtime credential change must both rebuild the broker AND nudge the
    // broker-gated detect-assignments job. Without the runNow, a job parked
    // while the market was closed (marketClosedMs:null) would stay parked until
    // the next app restart, so polling would never resume after saving creds.
    deps!.onBrokerProviderChanged()
    await Promise.resolve()

    expect(vi.mocked(brokerFactory.recreate)).toHaveBeenCalled()
    expect(mockSchedulerRunNow).toHaveBeenCalledWith('detect-assignments')
    // [US-99] Alpaca authenticates the market-data socket once at connect, so new keys
    // only take effect if the stream is rebuilt too.
    expect(restartStockQuoteStream).toHaveBeenCalled()
  })

  // [US-99] Market data previously read its key from the environment (the retired vendor's
  // loader did). Saved credentials still win, but .env has to keep working for dev and CI —
  // it is what .env.example documents.
  it('falls back to environment credentials for market data when none are saved', async () => {
    vi.stubEnv('ALPACA_KEY_ID', 'PKENV')
    vi.stubEnv('ALPACA_SECRET_KEY', 'env-secret')
    vi.stubEnv('ALPACA_PAPER', 'true')

    await triggerBootstrap()

    const { marketDataFactory } = await import('./integrations/market-data-factory')
    const config = vi.mocked(marketDataFactory.configure).mock.calls[0]?.[0]
    expect(config?.loadActiveAlpacaCredentials()).toEqual({
      keyId: 'PKENV',
      secret: 'env-secret',
      environment: 'paper'
    })
    vi.unstubAllEnvs()
  })

  it('prefers saved credentials over the environment for market data', async () => {
    vi.stubEnv('ALPACA_KEY_ID', 'PKENV')
    vi.stubEnv('ALPACA_SECRET_KEY', 'env-secret')
    const saved = { keyId: 'PKSAVED', secret: 'saved-secret', environment: 'live' as const }
    const { createSettingsService } = await import('./services/settings')
    vi.mocked(createSettingsService).mockReturnValueOnce({
      getCredentialStatus: vi.fn().mockReturnValue({ activeBrokerEnv: 'live' }),
      loadActiveAlpacaCredentials: vi.fn().mockReturnValue(saved)
    } as unknown as ReturnType<typeof createSettingsService>)

    await triggerBootstrap()

    const { marketDataFactory } = await import('./integrations/market-data-factory')
    const config = vi.mocked(marketDataFactory.configure).mock.calls[0]?.[0]
    expect(config?.loadActiveAlpacaCredentials()).toEqual(saved)
    vi.unstubAllEnvs()
  })

  // The same keys serve both subsystems, and .env.example says so — market data reading
  // the fallback while the broker ignored it would be an arbitrary split.
  it('falls back to environment credentials for the broker when none are saved', async () => {
    vi.stubEnv('ALPACA_KEY_ID', 'PKENV')
    vi.stubEnv('ALPACA_SECRET_KEY', 'env-secret')
    vi.stubEnv('ALPACA_PAPER', 'true')

    await triggerBootstrap()

    const { brokerFactory } = await import('./integrations/broker-factory')
    const config = vi.mocked(brokerFactory.configure).mock.calls[0]?.[0]
    expect(config?.loadActiveAlpacaCredentials()).toEqual({
      keyId: 'PKENV',
      secret: 'env-secret',
      environment: 'paper'
    })
    vi.unstubAllEnvs()
  })

  it('registers IVR IPC handlers', async () => {
    await triggerBootstrap()

    const { registerIvrIpc } = await import('./ipc/ivr')

    expect(vi.mocked(registerIvrIpc)).toHaveBeenCalledWith({
      scheduler: expect.anything()
    })
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
