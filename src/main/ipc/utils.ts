import { ZodError } from 'zod'
import { ValidationError } from '../core/lifecycle'
import { BrokerError } from '../integrations/broker-provider'
import { MarketDataError } from '../integrations/market-data-provider'
import { PendingAssignmentError } from '../services/pending-assignments'
import { logger } from '../logger'

export type IpcFieldError = { field: string; code: string; message: string }

export async function handleIpcCall<T extends object>(
  logLabel: string,
  fn: () => T | Promise<T>
): Promise<({ ok: true } & T) | { ok: false; code?: string; errors: IpcFieldError[] }> {
  try {
    return { ok: true, ...(await fn()) }
  } catch (err) {
    if (err instanceof ValidationError) {
      return { ok: false, errors: [{ field: err.field, code: err.code, message: err.message }] }
    }
    if (err instanceof PendingAssignmentError) {
      return {
        ok: false,
        code: err.code,
        errors: [{ field: '__root__', code: err.code, message: err.message }]
      }
    }
    if (err instanceof MarketDataError || err instanceof BrokerError) {
      logger.error({ code: err.code, message: err.message }, logLabel)
      return { ok: false, errors: [{ field: '__root__', code: err.code, message: err.message }] }
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
