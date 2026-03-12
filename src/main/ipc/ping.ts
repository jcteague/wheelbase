import { ipcMain } from 'electron'

export function registerPingHandler(): void {
  ipcMain.handle('ping', () => 'pong')
}
