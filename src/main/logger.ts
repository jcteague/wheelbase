import pino from 'pino'

const level = process.env.VITEST ? 'silent' : (process.env.LOG_LEVEL ?? 'info')

export const logger = pino({ level })
