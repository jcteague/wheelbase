// [US-105] The Roll LEAPS form's schema. The cross-field rules come from the engine's own
// `pmccLeapsRollIssues` (`pmcc-rules.ts`), so the form rejects before the IPC round-trip with the
// engine's text and path; the engine's `rollPmccLeaps` stays the authority.
import Decimal from 'decimal.js'
import { z } from 'zod'
import { pmccLeapsRollIssues, type PmccLeapsRollContext } from '../../../main/core/pmcc-rules'
import type { RollPmccLeapsPayload } from '../api/positions'
import { parseInputDecimal } from '../lib/decimal-input'
import { decidedDate, inputToNumber, isoDateSchema, moneySchema } from './common'

/** The open LEAPS, the open short (`null` when none) and the last recorded event date the replacement is judged by. */
export type RollPmccLeapsContext = PmccLeapsRollContext

const rollPmccLeapsObjectSchema = z.object({
  proceeds: moneySchema('Proceeds from close must be greater than zero', (v) => v > 0),
  newStrike: moneySchema('Strike must be positive', (v) => v > 0),
  newDebit: moneySchema('Replacement debit must be greater than zero', (v) => v > 0),
  newExpiration: isoDateSchema,
  fillDate: isoDateSchema,
  // Never a real input: the key the no-change rule reports on, so `errors.__roll__` and
  // `setError('__roll__')` are typed. Left out of the defaults and the payload.
  __roll__: z.string().optional()
})

export type RollPmccLeapsFormValues = z.infer<typeof rollPmccLeapsObjectSchema>

/** The roll schema for one open LEAPS; built once per sheet. */
export type RollPmccLeapsSchema = typeof rollPmccLeapsObjectSchema

function crossFieldRules(
  ctx: RollPmccLeapsContext,
  values: RollPmccLeapsFormValues,
  refinement: z.RefinementCtx
): void {
  const issues = pmccLeapsRollIssues({
    ...ctx,
    fillDate: decidedDate(values.fillDate),
    newStrike: parseInputDecimal(values.newStrike)?.toString(),
    newExpiration: decidedDate(values.newExpiration)
  })
  // One message per field: the first broken rule, as the engine would throw it.
  issues
    .filter((issue, index) => issues.findIndex(({ field }) => field === issue.field) === index)
    .forEach(({ field, message }) =>
      refinement.addIssue({ code: 'custom', path: [field], message })
    )
}

export function rollPmccLeapsSchema(ctx: RollPmccLeapsContext): RollPmccLeapsSchema {
  return rollPmccLeapsObjectSchema.superRefine((values, refinement) =>
    crossFieldRules(ctx, values, refinement)
  )
}

/** `useForm` `defaultValues` — the strike starts at the current LEAPS strike; never `.default()`. */
export function EMPTY_ROLL_PMCC_LEAPS_DEFAULTS(
  today: string,
  currentStrike: string
): RollPmccLeapsFormValues {
  return {
    proceeds: '',
    newStrike: new Decimal(currentStrike).toFixed(2),
    newDebit: '',
    newExpiration: '',
    fillDate: today
  }
}

export function toRollPmccLeapsPayload(
  values: RollPmccLeapsFormValues,
  positionId: string
): RollPmccLeapsPayload {
  return {
    positionId,
    proceedsPerContract: inputToNumber(values.proceeds),
    replacementDebitPerContract: inputToNumber(values.newDebit),
    newStrike: inputToNumber(values.newStrike),
    newExpiration: values.newExpiration,
    ...(values.fillDate ? { fillDate: values.fillDate } : {})
  }
}
