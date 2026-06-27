import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { listManagementQueue } from '../services/alerts'
import { handleIpcCall } from './utils'

export function registerAlertsHandlers({ db }: { db: Database.Database }): void {
  ipcMain.handle('alerts:list', () =>
    handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) }))
  )
}
