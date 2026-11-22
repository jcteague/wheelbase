// [US-115] The Sell Short Call form's schema. The cross-field rules come from the engine's own
// `pmccSubsequentShortIssues` (`pmcc-rules.ts`), so the form rejects before the IPC round-trip with
// the engine's text, routed to the form's own path; the engine's `sellPmccShort` stays the authority.
import type { FieldPath } from 'react-hook-form'
import { z } from 'zod'
import type { SellPmccShortField } from '../../../main/core/lifecycle'
import {
  pmccSubsequentShortIssues,
  type PmccSubsequentShortContext
} from '../../../main/core/pmcc-rules'
import type { SellPmccShortPayload } from '../../../main/schemas'
import { parseInputDecimal } from '../lib/decimal-input'
import { decidedDate, inputToNumber } from './common'
import { decidedContracts, pmccShortLegSchema, positiveWholeSchema } from './pmcc-entry'

/** The live LEAPS, the day the previous short was retired and today — what the sale is judged by. */
export type SellPmccShortFormContext = PmccSubsequentShortContext

const sellPmccShortObjectSchema = z.object({
  short: pmccShortLegSchema,
  contracts: positiveWholeSchema
})

/** The sell schema for one LEAPS; built once per sheet. */
export type SellPmccShortSchema = typeof sellPmccShortObjectSchema

export type SellPmccShortFormValues = z.input<SellPmccShortSchema>

type SellShortErrorField = Exclude<SellPmccShortField, '__root__' | '__phase__'>

/**
 * Where each engine field's error lands in the form, for the schema's own cross-field rules and
 * for the server's rejections alike; an engine field without a route fails to compile.
 */
export const SELL_SHORT_FORM_FIELDS = {
  contracts: 'contracts',
  strike: 'short.strike',
  expiration: 'short.expiration',
  fillDate: 'short.fillDate',
  fillPrice: 'short.fillPrice',
  fees: 'short.fees'
} as const satisfies Record<SellShortErrorField, FieldPath<SellPmccShortFormValues>>

export const isSellShortErrorField = (field: string): field is SellShortErrorField =>
  Object.hasOwn(SELL_SHORT_FORM_FIELDS, field)

function crossFieldRules(
  ctx: SellPmccShortFormContext,
  { short, contracts }: SellPmccShortFormValues,
  refinement: z.RefinementCtx
): void {
  const issues = pmccSubsequentShortIssues({
    ...ctx,
    short: {
      contracts: decidedContracts(contracts),
      strike: parseInputDecimal(short.strike)?.toString(),
      expiration: decidedDate(short.expiration),
      fillDate: decidedDate(short.fillDate)
    }
  })
  // One message per field: the first broken rule, as the engine would throw it.
  issues
    .filter((issue, index) => issues.findIndex(({ field }) => field === issue.field) === index)
    .forEach(({ field, message }) =>
      refinement.addIssue({
        code: 'custom',
        path: SELL_SHORT_FORM_FIELDS[field].split('.'),
        message
      })
    )
}

export function sellPmccShortSchema(ctx: SellPmccShortFormContext): SellPmccShortSchema {
  return sellPmccShortObjectSchema.superRefine((values, refinement) =>
    crossFieldRules(ctx, values, refinement)
  )
}

/** `useForm` `defaultValues` — every LEAPS contract covered, sold today; never `.default()`. */
export function EMPTY_SELL_PMCC_SHORT_DEFAULTS(
  today: string,
  leapsContracts: number
): SellPmccShortFormValues {
  return {
    contracts: String(leapsContracts),
    short: { strike: '', expiration: '', fillPrice: '', fees: '0.00', fillDate: today }
  }
}

export function toSellPmccShortPayload(
  positionId: string,
  { short, contracts }: SellPmccShortFormValues
): SellPmccShortPayload {
  return {
    positionId,
    strike: inputToNumber(short.strike),
    expiration: short.expiration,
    contracts: inputToNumber(contracts),
    fillPrice: inputToNumber(short.fillPrice),
    fillDate: short.fillDate,
    fees: inputToNumber(short.fees)
  }
}
