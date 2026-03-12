import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import { createPosition, listPositions } from '../services/positions'
import type { CreatePositionPayload } from '../schemas'

export function registerPositionsHandlers(db: Database.Database): void {
  ipcMain.handle('positions:list', () => listPositions(db))

  ipcMain.handle('positions:create', (_, payload: CreatePositionPayload) => {
    try {
      const result = createPosition(db, payload)
      return { ok: true, ...result }
    } catch (err) {
      if (err instanceof ValidationError) {
        return {
          ok: false,
          errors: [{ field: err.field, code: err.code, message: err.message }]
        }
      }
      logger.error({ err }, 'positions_create_unhandled_error')
      return {
        ok: false,
        errors: [
          { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
        ]
      }
    }
  })
}
