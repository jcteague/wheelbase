import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { dismissAlert, listManagementQueue } from '../services/alerts'
import { DismissAlertPayloadSchema } from '../schemas'
import { handleIpcCall } from './utils'

export function registerAlertsHandlers({ db }: { db: Database.Database }): void {
  ipcMain.handle('alerts:list', () =>
    handleIpcCall('alerts_list_error', () => ({ items: listManagementQueue(db) }))
  )

  ipcMain.handle('alerts:dismiss', (_, payload: unknown) =>
    handleIpcCall('alerts_dismiss_error', () => {
      const { alertId } = DismissAlertPayloadSchema.parse(payload)
      return { alert: dismissAlert(db, alertId, new Date().toISOString()) }
    })
  )
}
