import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),
  listPositions: () => ipcRenderer.invoke('positions:list'),
  createPosition: (payload: unknown) => ipcRenderer.invoke('positions:create', payload)
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
