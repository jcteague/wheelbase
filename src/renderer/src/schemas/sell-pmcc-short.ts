// [US-115] The Sell Short Call form's schema. The cross-field rules come from the engine's own
// `pmccSubsequentShortIssues` (`pmcc-rules.ts`), so the form rejects before the IPC round-trip with
// the engine's text, routed to the form's own path; the engine's `sellPmccShort` stays the authority.
import { z } from 'zod'
import {
  pmccSubsequentShortIssues,
  type PmccSubsequentShortContext,
  type PmccSubsequentShortField
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

/** Where each rule's field lives in the form: the contract count at the top, the rest in `short`. */
const FORM_PATH = {
  contracts: ['contracts'],
  fillDate: ['short', 'fillDate'],
  expiration: ['short', 'expiration'],
  strike: ['short', 'strike']
} as const satisfies Record<PmccSubsequentShortField, readonly string[]>

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
      refinement.addIssue({ code: 'custom', path: [...FORM_PATH[field]], message })
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
