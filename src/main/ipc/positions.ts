import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ZodError, type ZodType } from 'zod'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import {
  AssignCspPayloadSchema,
  CloseCcPayloadSchema,
  CloseCspPayloadSchema,
  ExpireCcPayloadSchema,
  ExpireCspPayloadSchema,
  OpenCcPayloadSchema,
  RecordCallAwayPayloadSchema,
  RollCcPayloadSchema,
  RollCspPayloadSchema
} from '../schemas'
import {
  assignCspPosition,
  closeCspPosition,
  createPosition,
  expireCcPosition,
  expireCspPosition,
  getPosition,
  listPositions,
  openCoveredCallPosition
} from '../services/positions'
import { closeCoveredCallPosition } from '../services/close-covered-call-position'
import { recordCallAwayPosition } from '../services/record-call-away-position'
import { rollCspPosition } from '../services/roll-csp-position'
import { rollCcPosition } from '../services/roll-cc-position'
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

function registerParsedPositionHandler<Payload extends { positionId: string }>(
  db: Database.Database,
  channel: string,
  logLabel: string,
  schema: ZodType<Payload>,
  handler: (db: Database.Database, positionId: string, payload: Payload) => object
): void {
  ipcMain.handle(channel, (_, payload: unknown) =>
    handleIpcCall(logLabel, () => {
      const parsed = schema.parse(payload)
      return handler(db, parsed.positionId, parsed)
    })
  )
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

  registerParsedPositionHandler(
    db,
    'positions:close-csp',
    'positions_close_csp_unhandled_error',
    CloseCspPayloadSchema,
    closeCspPosition
  )

  registerParsedPositionHandler(
    db,
    'positions:assign-csp',
    'positions_assign_csp_unhandled_error',
    AssignCspPayloadSchema,
    assignCspPosition
  )

  registerParsedPositionHandler(
    db,
    'positions:expire-csp',
    'positions_expire_csp_unhandled_error',
    ExpireCspPayloadSchema,
    expireCspPosition
  )

  registerParsedPositionHandler(
    db,
    'positions:open-cc',
    'positions_open_cc_unhandled_error',
    OpenCcPayloadSchema,
    openCoveredCallPosition
  )

  registerParsedPositionHandler(
    db,
    'positions:close-cc-early',
    'positions_close_cc_early_unhandled_error',
    CloseCcPayloadSchema,
    closeCoveredCallPosition
  )

  registerParsedPositionHandler(
    db,
    'positions:record-call-away',
    'positions_record_call_away_unhandled_error',
    RecordCallAwayPayloadSchema,
    recordCallAwayPosition
  )

  ipcMain.handle('positions:expire-cc', (_, payload: unknown) =>
    handleIpcCall('positions_expire_cc_unhandled_error', () => {
      const parsed = ExpireCcPayloadSchema.parse(payload)
      return expireCcPosition(db, parsed.positionId, parsed)
    })
  )

  registerParsedPositionHandler(
    db,
    'positions:roll-csp',
    'positions_roll_csp_unhandled_error',
    RollCspPayloadSchema,
    rollCspPosition
  )

  registerParsedPositionHandler(
    db,
    'positions:roll-cc',
    'positions_roll_cc_unhandled_error',
    RollCcPayloadSchema,
    rollCcPosition
  )
}
