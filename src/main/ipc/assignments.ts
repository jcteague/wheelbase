import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { PollingScheduler } from '../services/polling-scheduler'
import {
  confirmPending,
  dismissPending,
  listPending,
  PendingAssignmentError
} from '../services/pending-assignments'
import { ConfirmAssignmentPayloadSchema, DismissAssignmentPayloadSchema } from '../schemas'
import { handleIpcCall } from './utils'

function pendingAssignmentErrorResponse(err: PendingAssignmentError): {
  ok: false
  code: string
  errors: Array<{ field: string; code: string; message: string }>
} {
  return {
    ok: false,
    code: err.code,
    errors: [{ field: '__root__', code: err.code, message: err.message }]
  }
}

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

  ipcMain.handle('assignments:confirm', (_, payload: unknown) => {
    try {
      const { pendingAssignmentId } = ConfirmAssignmentPayloadSchema.parse(payload)
      const position = confirmPending(db, pendingAssignmentId)
      return { ok: true, position }
    } catch (err) {
      if (err instanceof PendingAssignmentError) {
        return pendingAssignmentErrorResponse(err)
      }
      return handleIpcCall('assignments_confirm_unhandled_error', () => {
        throw err
      })
    }
  })

  ipcMain.handle('assignments:dismiss', (_, payload: unknown) => {
    try {
      const { pendingAssignmentId } = DismissAssignmentPayloadSchema.parse(payload)
      dismissPending(db, pendingAssignmentId)
      return { ok: true, dismissedAt: new Date().toISOString() }
    } catch (err) {
      if (err instanceof PendingAssignmentError) {
        return pendingAssignmentErrorResponse(err)
      }
      return handleIpcCall('assignments_dismiss_unhandled_error', () => {
        throw err
      })
    }
  })

  ipcMain.handle('assignments:run-detection-now', () =>
    handleIpcCall('assignments_run_detection_now_error', async () => {
      await scheduler.runNow('detect-assignments')
      return {}
    })
  )
}
