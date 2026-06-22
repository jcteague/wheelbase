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
): Promise<
  ({ ok: true } & T) | { ok: false; code?: string; deeplink?: string; errors: IpcFieldError[] }
> {
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
    if (err instanceof BrokerError) {
      // auth_failed is expected when credentials aren't configured — WARN, not ERROR
      const log = err.code === 'auth_failed' ? logger.warn : logger.error
      log.call(logger, { code: err.code, message: err.message }, logLabel)
      return {
        ok: false,
        ...(err.deeplink ? { deeplink: err.deeplink } : {}),
        errors: [{ field: '__root__', code: err.code, message: err.message }]
      }
    }
    if (err instanceof MarketDataError) {
      // Handled API errors (auth, not_found, rate_limit) are WARN; unknown failures are ERROR
      const log =
        err.code === 'auth_failed' || err.code === 'not_found' || err.code === 'rate_limited'
          ? logger.warn
          : logger.error
      log.call(logger, { code: err.code, message: err.message }, logLabel)
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
