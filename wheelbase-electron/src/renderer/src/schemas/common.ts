import { z } from 'zod'

export const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,5}$/, 'Ticker must be 1-5 uppercase letters')

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

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
