import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ZodError } from 'zod'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import {
  AssignCspPayloadSchema,
  CloseCspPayloadSchema,
  ExpireCspPayloadSchema,
  OpenCcPayloadSchema
} from '../schemas'
import {
  assignCspPosition,
  closeCspPosition,
  createPosition,
  expireCspPosition,
  getPosition,
  listPositions,
  openCoveredCallPosition
} from '../services/positions'
import type { CreatePositionPayload } from '../schemas'

function handleIpcCall(
  logLabel: string,
  fn: () => object
):
  | ({ ok: true } & object)
  | { ok: false; errors: { field: string; code: string; message: string }[] } {
  try {
    return { ok: true, ...fn() }
  } catch (err) {
    if (err instanceof ValidationError) {
      return { ok: false, errors: [{ field: err.field, code: err.code, message: err.message }] }
    }
    if (err instanceof ZodError) {
      return {
        ok: false,
        errors: err.issues.map((issue) => ({
          field: String(issue.path[0] ?? '__root__'),
          code: issue.code,
          message: issue.message
        }))
      }
    }
    logger.error({ err }, logLabel)
    return {
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    }
  }
}

export function registerPositionsHandlers(db: Database.Database): void {
  ipcMain.handle('positions:list', () => listPositions(db))

  ipcMain.handle('positions:create', (_, payload: CreatePositionPayload) =>
    handleIpcCall('positions_create_unhandled_error', () => createPosition(db, payload))
  )

  ipcMain.handle('positions:get', (_, payload: { positionId: string }) => {
    const result = getPosition(db, payload.positionId)
    if (!result) {
      return {
        ok: false,
        errors: [{ field: '__root__', code: 'not_found', message: 'Position not found' }]
      }
    }
    return { ok: true, ...result }
  })

  ipcMain.handle('positions:close-csp', (_, payload: unknown) =>
    handleIpcCall('positions_close_csp_unhandled_error', () => {
      const parsed = CloseCspPayloadSchema.parse(payload)
      return closeCspPosition(db, parsed.positionId, parsed)
    })
  )

  ipcMain.handle('positions:assign-csp', (_, payload: unknown) =>
    handleIpcCall('positions_assign_csp_unhandled_error', () => {
      const parsed = AssignCspPayloadSchema.parse(payload)
      return assignCspPosition(db, parsed.positionId, parsed)
    })
  )

  ipcMain.handle('positions:expire-csp', (_, payload: unknown) =>
    handleIpcCall('positions_expire_csp_unhandled_error', () => {
      const parsed = ExpireCspPayloadSchema.parse(payload)
      return expireCspPosition(db, parsed.positionId, parsed)
    })
  )

  ipcMain.handle('positions:open-cc', (_, payload: unknown) =>
    handleIpcCall('positions_open_cc_unhandled_error', () => {
      const parsed = OpenCcPayloadSchema.parse(payload)
      return openCoveredCallPosition(db, parsed.positionId, parsed)
    })
  )
}
