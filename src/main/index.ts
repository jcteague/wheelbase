import { app, shell, BrowserWindow, safeStorage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb } from './db/index'
import { registerPingHandler } from './ipc/ping'
import { registerPositionsHandlers } from './ipc/positions'
import { marketDataFactory } from './integrations/market-data-factory'
import { brokerFactory } from './integrations/broker-factory'
import { loadMassiveApiKey } from './integrations/massive-credentials'
import { registerMarketDataHandlers } from './ipc/market-data'
import { registerBrokerHandlers } from './ipc/broker'
import { registerAssignmentsIpc } from './ipc/assignments'
import { registerTestSchedulerIpc, seedTestJobsFromEnv } from './ipc/test-scheduler'
import { DETECT_ASSIGNMENTS_JOB_NAME, detectAssignments } from './services/detect-assignments'
import { scheduler } from './services/scheduler-instance'
import { registerSettingsHandlers } from './ipc/settings'
import type { TestConnectionPayload } from './schemas'
import { createSettingsService } from './services/settings'
import {
  testAlpacaConnection,
  testMassiveConnection,
  type TestConnectionResult
} from './services/settings-connections'
import { logger } from './logger'
import type { BrokerProvider } from './integrations/broker-provider'

let mainWindow: BrowserWindow | null = null

type MockSettingsConnectionConfig = {
  massive?: TestConnectionResult
  alpaca?: Partial<Record<'paper' | 'live', TestConnectionResult>>
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 960,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = win
}

if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

function runSettingsConnectionTest(
  payload: TestConnectionPayload
): ReturnType<typeof testMassiveConnection> {
  const mockConfig = process.env.WHEELBASE_MOCK_SETTINGS_CONNECTIONS
  if (mockConfig) {
    return Promise.resolve(runMockSettingsConnectionTest(payload, mockConfig))
  }

  if (payload.vendor === 'massive') {
    return testMassiveConnection({ loadMassiveApiKey })
  }

  return testAlpacaConnection({
    environment: payload.environment,
    keyId: payload.keyId,
    secret: payload.secret
  })
}

function runMockSettingsConnectionTest(
  payload: TestConnectionPayload,
  rawConfig: string
): TestConnectionResult {
  const parsed = JSON.parse(rawConfig) as MockSettingsConnectionConfig

  if (payload.vendor === 'massive') {
    return parsed.massive ?? { ok: true, vendor: 'massive', status: 'connected' }
  }

  if (payload.environment === 'paper' && payload.keyId.trim().startsWith('AK')) {
    return {
      ok: false,
      errorCode: 'environment_mismatch',
      message: 'Environment mismatch — these are LIVE keys, not paper keys'
    }
  }

  return (
    parsed.alpaca?.[payload.environment] ?? {
      ok: true,
      vendor: 'alpaca',
      environment: payload.environment,
      accountNumberMasked: payload.environment === 'paper' ? 'PA…ABC' : 'AL…XYZ'
    }
  )
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const db = initDb()
  const settings = createSettingsService({
    db,
    safeStorage,
    loadMassiveApiKey,
    testAlpacaConnection
  })

  marketDataFactory.configure({ loadMassiveApiKey })
  brokerFactory.configure({
    loadActiveAlpacaCredentials: () => settings.loadActiveAlpacaCredentials()
  })

  registerPingHandler()
  registerPositionsHandlers(db)

  const marketDataProvider = marketDataFactory.create()
  registerMarketDataHandlers(marketDataProvider, () => mainWindow)

  registerBrokerHandlers(() => brokerFactory.create())
  registerSettingsHandlers({
    settings,
    testConnection: runSettingsConnectionTest,
    onBrokerProviderChanged: () => {
      logger.info('Refreshing broker provider after settings change')
      brokerFactory.recreate()
    }
  })

  registerAssignmentsIpc({ db, scheduler })

  // Detect-assignments job: looks up the current broker provider and active
  // environment lazily on every tick so credential changes flow through without
  // restart. When no broker is configured (activeBrokerEnv === 'none'), the
  // tick is a no-op.
  scheduler.register({
    name: DETECT_ASSIGNMENTS_JOB_NAME,
    cadence: {
      kind: 'interval',
      marketOpenMs: 60_000,
      extendedHoursMs: 300_000,
      marketClosedMs: null
    },
    handler: async () => {
      const env = settings.getCredentialStatus().activeBrokerEnv
      if (env === 'none') return
      let brokerProvider: BrokerProvider
      try {
        brokerProvider = brokerFactory.create()
      } catch (err) {
        logger.warn({ err }, 'detect-assignments: broker provider unavailable')
        return
      }
      await detectAssignments({ db, brokerProvider, env })
    }
  })

  if (process.env.NODE_ENV === 'test') {
    seedTestJobsFromEnv(scheduler)
    registerTestSchedulerIpc(scheduler)
  }

  scheduler.start()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', async (e) => {
    e.preventDefault()
    await Promise.all([scheduler.stop(), marketDataProvider.disconnect()])
    app.exit(0)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
