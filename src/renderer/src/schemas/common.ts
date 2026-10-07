import { z } from 'zod'
import { parseInputDecimal } from '../lib/decimal-input'

export const TICKER_REGEX = /^[A-Z]{1,5}$/

export const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(TICKER_REGEX, 'Ticker must be 1-5 uppercase letters')

export const positiveMoneySchema = z
  .string()
  .refine(
    (v) => v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) > 0,
    'Value must be greater than 0'
  )

export const positiveIntegerSchema = z
  .string()
  .refine(
    (v) => v !== '' && Number.isInteger(parseFloat(v)) && parseFloat(v) > 0,
    'Value must be a positive integer'
  )

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const isoDateSchema = z.string().regex(ISO_DATE_REGEX, 'Date must be YYYY-MM-DD')

/** A money input as free text, valid only once it parses as a complete decimal passing `test`. */
export const moneySchema = (message: string, test: (value: number) => boolean): z.ZodString =>
  z.string().refine((v) => {
    const parsed = parseInputDecimal(v)
    return parsed !== null && test(parsed.toNumber())
  }, message)

/** A validated form input as the number an IPC payload carries (`NaN` only if unvalidated). */
export const inputToNumber = (value: string): number => parseInputDecimal(value)?.toNumber() ?? NaN
