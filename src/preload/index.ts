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
  saveAlertOverrides: (payload: unknown) => invoke('positions:save-alert-overrides', payload),
  setStockQuoteTickers: (payload: unknown) =>
    invoke('market-data:set-stock-quote-tickers', payload),
  getOptionSnapshots: (payload: unknown) => invoke('market-data:option-snapshots', payload),
  onStockQuote: onIpcEvent('market-data:stock-quote'),
  onStreamError: onIpcEvent('market-data:stream-error'),
  broker: {
    account: () => invoke('broker:account'),
    activities: (payload: unknown) => invoke('broker:activities', payload),
    marketStatus: () => invoke('broker:market-status')
  },
  settings: {
    status: () => invoke('settings:get-credential-status'),
    saveAlpaca: (payload: unknown) => invoke('settings:save-alpaca-credentials', payload),
    removeAlpaca: (payload: unknown) => invoke('settings:remove-alpaca-credentials', payload),
    setActiveBrokerEnvironment: (payload: unknown) =>
      invoke('settings:set-active-broker-environment', payload),
    testConnection: (payload: unknown) => invoke('settings:test-connection', payload),
    testStoredAlpacaConnection: (payload: unknown) =>
      invoke('settings:test-stored-alpaca-connection', payload),
    getAlertDefaults: () => invoke('settings:get-alert-defaults'),
    saveAlertDefaults: (payload: unknown) => invoke('settings:save-alert-defaults', payload)
  },
  marketData: {
    stockQuotes: (payload: unknown) => invoke('market-data:stock-quotes', payload),
    optionSnapshot: (payload: unknown) => invoke('market-data:option-snapshot', payload),
    optionChain: (payload: unknown) => invoke('market-data:option-chain', payload)
  },
  // Test-only helpers — backed by IPC channels that are only meaningful when
  // FAKE_MARKET_DATA=true; safe to expose unconditionally (no-op in prod)
  triggerTestTick: (payload: unknown) => invoke('test:trigger-stock-tick', payload),
  triggerStreamError: (payload: unknown) => invoke('test:trigger-stream-error', payload),
  setPositionProfitTarget: (payload: unknown) => invoke('test:set-position-profit-target', payload),
  assignments: {
    listPending: () => invoke('assignments:list-pending'),
    confirm: (pendingAssignmentId: number) =>
      invoke('assignments:confirm', { pendingAssignmentId }),
    dismiss: (pendingAssignmentId: number) =>
      invoke('assignments:dismiss', { pendingAssignmentId }),
    runDetectionNow: () => invoke('assignments:run-detection-now')
  },
  alerts: {
    list: () => invoke('alerts:list'),
    dismiss: (payload: { alertId: string }) => invoke('alerts:dismiss', payload)
  },
  watchlist: {
    list: () => invoke('watchlist:list'),
    add: (payload: unknown) => invoke('watchlist:add', payload),
    remove: (payload: { ticker: string }) => invoke('watchlist:remove', payload)
  },
  screener: {
    results: () => invoke('screener:results')
  },
  ivr: {
    collectNow: () => invoke('ivr:collect-now')
  },
  // Dev-only scheduler inspection — backed by IPC handlers registered only when
  // NODE_ENV === 'test'. Safe to expose unconditionally (channels are absent in prod).
  testSchedulerRegistry: () => invoke('_test:scheduler-registry'),
  testSchedulerRunNow: (jobName: string) => invoke('_test:scheduler-run-now', jobName),
  testSchedulerRegister: (job: unknown) => invoke('_test:scheduler-register', job),
  testSchedulerSimulateWake: (payload: unknown) => invoke('_test:scheduler-simulate-wake', payload),
  testIvrSetOutcomes: (outcomes: unknown) => invoke('_test:ivr-set-outcomes', outcomes),
  testIvrSnapshots: () => invoke('_test:ivr-snapshots')
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
