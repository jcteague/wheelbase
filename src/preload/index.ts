import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

function invoke(channel: string, payload?: unknown): Promise<unknown> {
  return ipcRenderer.invoke(channel, payload)
}

function onIpcEvent<T>(channel: string) {
  return (cb: (event: T) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, event: T): void => cb(event)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  ping: () => invoke('ping'),
  listPositions: () => invoke('positions:list'),
  createPosition: (payload: unknown) => invoke('positions:create', payload),
  getPosition: (positionId: string) => invoke('positions:get', { positionId }),
  closePosition: (payload: unknown) => invoke('positions:close-csp', payload),
  expirePosition: (payload: unknown) => invoke('positions:expire-csp', payload),
  assignPosition: (payload: unknown) => invoke('positions:assign-csp', payload),
  openCoveredCall: (payload: unknown) => invoke('positions:open-cc', payload),
  closeCoveredCallEarly: (payload: unknown) => invoke('positions:close-cc-early', payload),
  recordCallAway: (payload: unknown) => invoke('positions:record-call-away', payload),
  expireCc: (payload: unknown) => invoke('positions:expire-cc', payload),
  rollCsp: (payload: unknown) => invoke('positions:roll-csp', payload),
  rollCc: (payload: unknown) => invoke('positions:roll-cc', payload),
  getStockQuotes: (payload: unknown) => invoke('market-data:stock-quotes', payload),
  setStockQuoteTickers: (payload: unknown) =>
    invoke('market-data:set-stock-quote-tickers', payload),
  getMarketStatus: () => invoke('market-data:market-status'),
  onStockQuote: onIpcEvent('market-data:stock-quote'),
  onStreamError: onIpcEvent('market-data:stream-error'),
  // Test-only helpers — backed by IPC channels that are only meaningful when
  // WHEELBASE_MARKET_MOCK=true; safe to expose unconditionally (no-op in prod)
  triggerTestTick: (payload: unknown) => invoke('test:trigger-stock-tick', payload),
  triggerStreamError: (payload: unknown) => invoke('test:trigger-stream-error', payload)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // Window.electron / Window.api are declared in preload/index.d.ts (renderer tsconfig)
  const w = window as unknown as { electron: typeof electronAPI; api: typeof api }
  w.electron = electronAPI
  w.api = api
}
