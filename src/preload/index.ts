import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const invoke = (channel: string, payload?: unknown): Promise<unknown> =>
  ipcRenderer.invoke(channel, payload)

const api = {
  ping: (): Promise<string> => invoke('ping') as Promise<string>,
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
  rollCc: (payload: unknown) => invoke('positions:roll-cc', payload)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error Window.electron is declared in preload/index.d.ts (renderer tsconfig)
  window.electron = electronAPI
  // @ts-expect-error Window.api is declared in preload/index.d.ts (renderer tsconfig)
  window.api = api
}
