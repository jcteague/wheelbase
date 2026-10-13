// [US-104] The Roll Short Call form's schema. The cross-field rules come from the engine's own
// `pmccShortRollIssues` (`pmcc-rules.ts`), so the form rejects before the IPC round-trip with the
// engine's text and path; the engine's `rollPmccShortCall` stays the authority.
import { z } from 'zod'
import { pmccShortRollIssues, type PmccShortRollContext } from '../../../main/core/pmcc-rules'
import type { RollPmccShortCallPayload } from '../api/positions'
import { parseInputDecimal } from '../lib/decimal-input'
import { decidedDate, inputToNumber, isoDateSchema, moneySchema } from './common'

/** The open short and its LEAPS — the facts the cross-field rules judge the replacement by. */
export type RollPmccShortCallContext = PmccShortRollContext

// Named with the IPC payload's keys, so a server field error lands on the input of the same name.
const rollPmccShortCallObjectSchema = z.object({
  costToClosePerContract: moneySchema('Cost to close must be greater than zero', (v) => v > 0),
  newStrike: moneySchema('Strike must be positive', (v) => v > 0),
  newPremiumPerContract: moneySchema('Replacement premium must be greater than zero', (v) => v > 0),
  newExpiration: isoDateSchema,
  fillDate: isoDateSchema,
  // Never a real input: the key the no-change rule reports on, so `errors.__roll__` and
  // `setError('__roll__')` are typed. Left out of the defaults and the payload.
  __roll__: z.string().optional()
})

export type RollPmccShortCallFormValues = z.infer<typeof rollPmccShortCallObjectSchema>

/** The roll schema for one open short; built once per sheet by `useRollPmccShortCallForm`. */
export type RollPmccShortCallSchema = typeof rollPmccShortCallObjectSchema

function crossFieldRules(
  ctx: RollPmccShortCallContext,
  values: RollPmccShortCallFormValues,
  refinement: z.RefinementCtx
): void {
  const issues = pmccShortRollIssues({
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

export function rollPmccShortCallSchema(ctx: RollPmccShortCallContext): RollPmccShortCallSchema {
  return rollPmccShortCallObjectSchema.superRefine((values, refinement) =>
    crossFieldRules(ctx, values, refinement)
  )
}

/** `useForm` `defaultValues` — defaults live here, never as `.default()` on the schema. */
export function EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(today: string): RollPmccShortCallFormValues {
  return {
    costToClosePerContract: '',
    newStrike: '',
    newPremiumPerContract: '',
    newExpiration: '',
    fillDate: today
  }
}

export function toRollPmccShortCallPayload(
  values: RollPmccShortCallFormValues,
  positionId: string
): RollPmccShortCallPayload {
  return {
    positionId,
    costToClosePerContract: inputToNumber(values.costToClosePerContract),
    newPremiumPerContract: inputToNumber(values.newPremiumPerContract),
    newStrike: inputToNumber(values.newStrike),
    newExpiration: values.newExpiration,
    ...(values.fillDate ? { fillDate: values.fillDate } : {})
  }
}
