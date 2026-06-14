import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { PollingScheduler } from '../services/polling-scheduler'
import { DETECT_ASSIGNMENTS_JOB_NAME } from '../services/detect-assignments'
import { confirmPending, dismissPending, listPending } from '../services/pending-assignments'
import { ConfirmAssignmentPayloadSchema, DismissAssignmentPayloadSchema } from '../schemas'
import { handleIpcCall } from './utils'

export function registerAssignmentsIpc({
  db,
  scheduler
}: {
  db: Database.Database
  scheduler: PollingScheduler
}): void {
  ipcMain.handle('assignments:list-pending', () =>
    handleIpcCall('assignments_list_pending_error', () => ({ assignments: listPending(db) }))
  )

  ipcMain.handle('assignments:confirm', (_, payload: unknown) =>
    handleIpcCall('assignments_confirm_error', () => {
      const { pendingAssignmentId } = ConfirmAssignmentPayloadSchema.parse(payload)
      return { position: confirmPending(db, pendingAssignmentId) }
    })
  )

  ipcMain.handle('assignments:dismiss', (_, payload: unknown) =>
    handleIpcCall('assignments_dismiss_error', () => {
      const { pendingAssignmentId } = DismissAssignmentPayloadSchema.parse(payload)
      dismissPending(db, pendingAssignmentId)
      return { dismissedAt: new Date().toISOString() }
    })
  )

  ipcMain.handle('assignments:run-detection-now', () =>
    handleIpcCall('assignments_run_detection_now_error', async () => {
      await scheduler.runNow(DETECT_ASSIGNMENTS_JOB_NAME)
      return {}
    })
  )
}
