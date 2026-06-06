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
import { registerSettingsHandlers } from './ipc/settings'
import type { TestConnectionPayload } from './schemas'
import { createSettingsService } from './services/settings'
import {
  testAlpacaConnection,
  testMassiveConnection,
  type TestConnectionResult
} from './services/settings-connections'
import { logger } from './logger'

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
  app.on('before-quit', () => {
    void marketDataProvider.disconnect()
  })

  registerBrokerHandlers(() => brokerFactory.create())
  registerSettingsHandlers({
    settings,
    testConnection: runSettingsConnectionTest,
    onBrokerProviderChanged: () => {
      logger.info('Refreshing broker provider after settings change')
      brokerFactory.recreate()
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
