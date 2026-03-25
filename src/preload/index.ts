import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  listPositions: () => ipcRenderer.invoke('positions:list'),
  createPosition: (payload: unknown) => ipcRenderer.invoke('positions:create', payload),
  getPosition: (positionId: string) => ipcRenderer.invoke('positions:get', { positionId }),
  closePosition: (payload: unknown) => ipcRenderer.invoke('positions:close-csp', payload),
  expirePosition: (payload: unknown) => ipcRenderer.invoke('positions:expire-csp', payload),
  assignPosition: (payload: unknown) => ipcRenderer.invoke('positions:assign-csp', payload),
  openCoveredCall: (payload: unknown) => ipcRenderer.invoke('positions:open-cc', payload),
  closeCoveredCallEarly: (payload: unknown) =>
    ipcRenderer.invoke('positions:close-cc-early', payload)
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
