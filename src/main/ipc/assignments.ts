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
import { logger } from '../logger'

function zodErrors(
  error: import('zod').ZodError
): Array<{ field: string; code: string; message: string }> {
  return error.issues.map((issue) => ({
    field: String(issue.path[0] ?? '__root__'),
    code: issue.code,
    message: issue.message
  }))
}

export function registerAssignmentsIpc({
  db,
  scheduler
}: {
  db: Database.Database
  scheduler: PollingScheduler
}): void {
  ipcMain.handle('assignments:list-pending', () => {
    try {
      return { ok: true, assignments: listPending(db) }
    } catch (err) {
      logger.error({ err }, 'assignments_list_pending_error')
      return {
        ok: false,
        errors: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    }
  })

  ipcMain.handle('assignments:confirm', (_, payload: unknown) => {
    const parsed = ConfirmAssignmentPayloadSchema.safeParse(payload)
    if (!parsed.success) {
      return { ok: false, errors: zodErrors(parsed.error) }
    }

    try {
      const position = confirmPending(db, parsed.data.pendingAssignmentId)
      return { ok: true, position }
    } catch (err) {
      if (err instanceof PendingAssignmentError) {
        return {
          ok: false,
          code: err.code,
          errors: [{ field: '__root__', code: err.code, message: err.message }]
        }
      }
      logger.error({ err }, 'assignments_confirm_unhandled_error')
      return {
        ok: false,
        errors: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    }
  })

  ipcMain.handle('assignments:dismiss', (_, payload: unknown) => {
    const parsed = DismissAssignmentPayloadSchema.safeParse(payload)
    if (!parsed.success) {
      return { ok: false, errors: zodErrors(parsed.error) }
    }

    try {
      dismissPending(db, parsed.data.pendingAssignmentId)
      return { ok: true, dismissedAt: new Date().toISOString() }
    } catch (err) {
      if (err instanceof PendingAssignmentError) {
        return {
          ok: false,
          code: err.code,
          errors: [{ field: '__root__', code: err.code, message: err.message }]
        }
      }
      logger.error({ err }, 'assignments_dismiss_unhandled_error')
      return {
        ok: false,
        errors: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    }
  })

  ipcMain.handle('assignments:run-detection-now', async () => {
    try {
      await scheduler.runNow('detect-assignments')
      return { ok: true }
    } catch (err) {
      logger.error({ err }, 'assignments_run_detection_now_error')
      return {
        ok: false,
        errors: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    }
  })
}
