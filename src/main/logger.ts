import pino from 'pino'

// MAIN_VITE_LOG_LEVEL is resolved from .env at build/dev time by electron-vite;
// LOG_LEVEL (process.env) is a runtime fallback for tests and packaged runs.
const configuredLevel =
  (import.meta.env.MAIN_VITE_LOG_LEVEL as string) || process.env.LOG_LEVEL || 'info'
const level = process.env.VITEST ? 'silent' : configuredLevel

export const logger = pino({ level })
