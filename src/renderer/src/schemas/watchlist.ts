import { z } from 'zod'
import { positiveMoneySchema, TICKER_REGEX } from './common'

// Plain decimal only — no thousands separators. parseFloat('1,000') silently
// yields 1, so reject comma/grouped input here rather than corrupt the trigger.
const MONEY_PATTERN = /^\d+(\.\d+)?$/

const optionalPositiveMoneySchema = z
  .string()
  .optional()
  .refine(
    (v) =>
      v == null ||
      v === '' ||
      (MONEY_PATTERN.test(v.trim()) && positiveMoneySchema.safeParse(v.trim()).success),
    { message: 'Enter a dollar amount greater than 0' }
  )

const optionalIvrTriggerSchema = z
  .string()
  .optional()
  .refine(
    (v) => {
      if (v == null || v === '') return true
      const n = Number(v)
      return Number.isInteger(n) && n >= 0 && n <= 100
    },
    { message: 'IVR must be a whole number between 0 and 100' }
  )

export const watchlistEntrySchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1, 'Enter a ticker symbol')
    .toUpperCase()
    .regex(TICKER_REGEX, 'Enter a valid ticker symbol'),
  thesis: z.string().trim().max(500).optional(),
  ownBelowPrice: optionalPositiveMoneySchema,
  ivrTrigger: optionalIvrTriggerSchema,
  postEarningsOnly: z.boolean().default(false),
  coreHolding: z.boolean().default(false)
})

export type WatchlistEntryFormValues = z.infer<typeof watchlistEntrySchema>
