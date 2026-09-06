import pino, { type Logger } from 'pino'

/** Injectable logger surface — what callers accept instead of the full pino Logger. */
export type LoggerLike = Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>

// MAIN_VITE_LOG_LEVEL is resolved from .env at build/dev time by electron-vite;
// LOG_LEVEL (process.env) is a runtime fallback for tests and packaged runs.
const configuredLevel =
  (import.meta.env.MAIN_VITE_LOG_LEVEL as string) || process.env.LOG_LEVEL || 'info'
const level = process.env.VITEST ? 'silent' : configuredLevel

// pino applies its Error serializer only to configured keys (plus the default
// `err`). Several call sites log caught exceptions under `error`; without this,
// a thrown Error under that key stringifies to `{}` because `message` and
// `stack` are non-enumerable. Non-Error values pass through unchanged.
export const logger = pino({ level, serializers: { error: pino.stdSerializers.err } })
