import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb } from './db/index'
import { registerPingHandler } from './ipc/ping'
import { registerPositionsHandlers } from './ipc/positions'
import { createMarketDataProvider, type MarketDataConfig } from './integrations/market-data-factory'
import { registerMarketDataHandlers } from './ipc/market-data'

let mainWindow: BrowserWindow | null = null

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

function marketDataConfigFromEnv(): MarketDataConfig {
  return {
    provider: 'alpaca',
    keyId: process.env.ALPACA_KEY_ID ?? '',
    secretKey: process.env.ALPACA_SECRET_KEY ?? '',
    paper: process.env.ALPACA_PAPER !== 'false',
    dataFeed: process.env.ALPACA_DATA_FEED,
    optionFeed: process.env.ALPACA_OPTION_FEED
  }
}

if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const db = initDb()
  registerPingHandler()
  registerPositionsHandlers(db)

  const marketDataProvider = createMarketDataProvider(marketDataConfigFromEnv())
  registerMarketDataHandlers(marketDataProvider, () => mainWindow)
  app.on('before-quit', () => {
    void marketDataProvider.disconnect()
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
