// [US-101] The PMCC entry form's schema. Rules 10–16 of the engine's `openPmcc` come from
// the shared pure `pmccCrossLegIssues`, so the form rejects before the IPC round-trip with
// the engine's own messages and paths; the engine stays the authority at the boundary.
import { z } from 'zod'
import { pmccCrossLegIssues, type PmccCrossLegValues } from '../../../main/core/pmcc-rules'
import type { CreatePmccPositionPayload } from '../../../main/schemas'
import { parseInputDecimal } from '../lib/decimal-input'
import { ISO_DATE_REGEX, isoDateSchema, tickerSchema } from './common'

const moneySchema = (message: string, test: (value: number) => boolean): z.ZodString =>
  z.string().refine((v) => {
    const parsed = parseInputDecimal(v)
    return parsed !== null && test(parsed.toNumber())
  }, message)

const positiveFillSchema = moneySchema('Actual fill price must be greater than zero.', (v) => v > 0)

const required = (message: string, schema: z.ZodString): z.ZodPipe<z.ZodString, z.ZodString> =>
  z.string().min(1, message).pipe(schema)

const pmccLegSchema = z.object({
  // OCC symbol when picked from the chain; absent for manual entry.
  contractId: z.string().optional(),
  strike: moneySchema('Strike must be positive', (v) => v > 0),
  expiration: isoDateSchema,
  fillPrice: z.string(),
  fees: required(
    'Enter the fees.',
    moneySchema('Fees cannot be negative.', (v) => v >= 0)
  ),
  fillDate: isoDateSchema
})

const positiveWholeSchema = z.string().refine((v) => {
  const parsed = parseInputDecimal(v)
  return parsed !== null && parsed.isInteger() && parsed.gt(0)
}, 'Contracts must be a positive whole number.')

type LegValues = z.infer<typeof pmccLegSchema>

/** A form leg as the shared rules read it: a value that is not yet a decided date or number
 *  is `undefined`, so its rules are skipped — the field-level schema already reports it. */
function decidedLeg(leg: LegValues): PmccCrossLegValues {
  const date = (v: string): string | undefined => (ISO_DATE_REGEX.test(v) ? v : undefined)
  const decimal = (v: string): string | undefined => parseInputDecimal(v)?.toString()
  return {
    strike: decimal(leg.strike),
    expiration: date(leg.expiration),
    fillPrice: decimal(leg.fillPrice),
    fillDate: date(leg.fillDate)
  }
}

/** Rules 10–16 of data-model §4, each reported at its engine field path. */
function crossLegRules(
  today: string,
  { long, short }: { long: LegValues; short: LegValues },
  ctx: z.RefinementCtx
): void {
  pmccCrossLegIssues({
    long: decidedLeg(long),
    short: decidedLeg(short),
    referenceDate: today
  }).forEach(({ field, message }) =>
    ctx.addIssue({ code: 'custom', path: field.split('.'), message })
  )
}

const pmccEntryObjectSchema = z.object({
  ticker: tickerSchema,
  contracts: positiveWholeSchema,
  long: pmccLegSchema.extend({
    fillPrice: required('Enter the actual LEAPS fill price.', positiveFillSchema)
  }),
  short: pmccLegSchema.extend({
    fillPrice: required('Enter the actual short-call fill price.', positiveFillSchema)
  }),
  thesis: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5_000).optional(),
  // Never a real input: the key rule 16 reports on, so `errors.__pair__` and
  // `trigger('__pair__')` are typed. Left out of the defaults and the payload.
  __pair__: z.string().optional()
})

export type PmccEntryFormValues = z.infer<typeof pmccEntryObjectSchema>

/** `today` is the local calendar date (`yyyy-MM-dd`) the date rules are judged against. */
export function pmccEntrySchema(today: string): typeof pmccEntryObjectSchema {
  return pmccEntryObjectSchema.superRefine((values, ctx) => crossLegRules(today, values, ctx))
}

/** `useForm` `defaultValues` — defaults live here, never as `.default()` on the schema. */
export function EMPTY_PMCC_DEFAULTS(today: string): PmccEntryFormValues {
  const leg = { strike: '', expiration: '', fillPrice: '', fees: '0.00', fillDate: today }
  return { ticker: '', contracts: '', long: leg, short: { ...leg }, thesis: '', notes: '' }
}

const toNumber = (value: string): number => parseInputDecimal(value)?.toNumber() ?? NaN

export function toCreatePmccPayload(values: PmccEntryFormValues): CreatePmccPositionPayload {
  const contracts = toNumber(values.contracts)
  const toLeg = (leg: LegValues): CreatePmccPositionPayload['long'] => ({
    underlying: values.ticker,
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: toNumber(leg.strike),
    expiration: leg.expiration,
    contracts,
    fillPrice: toNumber(leg.fillPrice),
    fillDate: leg.fillDate,
    fees: toNumber(leg.fees)
  })
  return {
    strategy: 'PMCC',
    ticker: values.ticker,
    long: toLeg(values.long),
    short: toLeg(values.short),
    thesis: values.thesis || undefined,
    notes: values.notes || undefined
  }
}
