// [US-67] Renderer form schema for the screening-criteria sheet.
//
// Every numeric field is a `z.string()` so an in-progress `'0.'` stays typeable
// — the bounds live in the predicates, not in the field types. All rules and
// messages come from `src/main/core/screening-criteria.ts` so the sheet, the IPC
// schema, and the service stay in lockstep; nothing here is re-typed.

import { z } from 'zod'
import {
  DELTA_INVERTED_MESSAGE,
  DELTA_RANGE_MESSAGE,
  DTE_INVERTED_MESSAGE,
  DTE_MAX,
  DTE_MAX_MESSAGE,
  DTE_MIN_MESSAGE,
  IV_RANK_MESSAGE,
  OPEN_INTEREST_MESSAGE,
  PRICE_CEILING_MESSAGE,
  SPREAD_PERCENT_MESSAGE,
  isAscending,
  isDeltaInRange,
  isDteInRange,
  isIvRankFloorInRange,
  isOpenInterestInRange,
  isPriceCeilingInRange,
  isSpreadPercentInRange
} from '../../../main/core/screening-criteria'
import type { SaveScreeningCriteriaPayload, ScreeningCriteria } from '../api/screening-criteria'

const criteriaFields = z.object({
  deltaMin: z.string(),
  deltaMax: z.string(),
  dteMin: z.string(),
  dteMax: z.string(),
  minOpenInterest: z.string(),
  maxSpreadPercent: z.string(),
  // The two optionals are only validated while their toggle is on — a disabled
  // input keeps whatever the trader typed without blocking the save.
  priceCeilingEnabled: z.boolean(),
  maxUnderlyingPrice: z.string(),
  ivRankFloorEnabled: z.boolean(),
  minIvRank: z.string(),
  earningsHandling: z.enum(['exclude', 'flag'])
})

type CriteriaFields = z.infer<typeof criteriaFields>

export const SCREENING_CRITERIA_FIELDS = [
  'deltaMin',
  'deltaMax',
  'dteMin',
  'dteMax',
  'minOpenInterest',
  'maxSpreadPercent',
  'maxUnderlyingPrice',
  'minIvRank'
] as const

export type ScreeningCriteriaField = (typeof SCREENING_CRITERIA_FIELDS)[number]

/** Narrows an IPC error's `field` to a form field the sheet can bind it to. */
export function isScreeningCriteriaField(field: string): field is ScreeningCriteriaField {
  return SCREENING_CRITERIA_FIELDS.some((name) => name === field)
}

/** A DTE outside the window is either too small or too large — say which. */
function dteMessage(value: string): string {
  return Number(value) > DTE_MAX ? DTE_MAX_MESSAGE : DTE_MIN_MESSAGE
}

type FieldRule = {
  field: ScreeningCriteriaField
  fails: (values: CriteriaFields) => boolean
  message: (values: CriteriaFields) => string
}

// Ordered registry of pure rules. Each inversion rule re-checks both bounds so
// it stays silent while either end is out of range on its own — the trader sees
// "delta must be between..." before "min must be less than max". Order then
// settles precedence: the resolver keeps the first issue raised for a path, so
// a field's bound rule must precede any inversion rule that targets it.
const RULES: FieldRule[] = [
  {
    field: 'deltaMin',
    fails: (v) => !isDeltaInRange(v.deltaMin),
    message: () => DELTA_RANGE_MESSAGE
  },
  {
    field: 'deltaMax',
    fails: (v) => !isDeltaInRange(v.deltaMax),
    message: () => DELTA_RANGE_MESSAGE
  },
  {
    field: 'deltaMax',
    fails: (v) =>
      isDeltaInRange(v.deltaMin) &&
      isDeltaInRange(v.deltaMax) &&
      !isAscending(v.deltaMin, v.deltaMax),
    message: () => DELTA_INVERTED_MESSAGE
  },
  {
    field: 'dteMin',
    fails: (v) => !isDteInRange(v.dteMin),
    message: (v) => dteMessage(v.dteMin)
  },
  {
    field: 'dteMax',
    fails: (v) => !isDteInRange(v.dteMax),
    message: (v) => dteMessage(v.dteMax)
  },
  {
    field: 'dteMax',
    fails: (v) =>
      isDteInRange(v.dteMin) && isDteInRange(v.dteMax) && !isAscending(v.dteMin, v.dteMax),
    message: () => DTE_INVERTED_MESSAGE
  },
  {
    field: 'minOpenInterest',
    fails: (v) => !isOpenInterestInRange(v.minOpenInterest),
    message: () => OPEN_INTEREST_MESSAGE
  },
  {
    field: 'maxSpreadPercent',
    fails: (v) => !isSpreadPercentInRange(v.maxSpreadPercent),
    message: () => SPREAD_PERCENT_MESSAGE
  },
  {
    field: 'maxUnderlyingPrice',
    fails: (v) => v.priceCeilingEnabled && !isPriceCeilingInRange(v.maxUnderlyingPrice),
    message: () => PRICE_CEILING_MESSAGE
  },
  {
    field: 'minIvRank',
    fails: (v) => v.ivRankFloorEnabled && !isIvRankFloorInRange(v.minIvRank),
    message: () => IV_RANK_MESSAGE
  }
]

export const screeningCriteriaSchema = criteriaFields.superRefine((values, ctx) => {
  RULES.filter((rule) => rule.fails(values)).forEach((rule) =>
    ctx.addIssue({ code: 'custom', path: [rule.field], message: rule.message(values) })
  )
})

export type ScreeningCriteriaFormInput = z.input<typeof screeningCriteriaSchema>
export type ScreeningCriteriaFormValues = z.output<typeof screeningCriteriaSchema>

/** Persisted criteria → pre-filled form input. A `null` optional reads as "off". */
export function toFormValues(criteria: ScreeningCriteria): ScreeningCriteriaFormValues {
  return {
    deltaMin: criteria.deltaMin,
    deltaMax: criteria.deltaMax,
    dteMin: String(criteria.dteMin),
    dteMax: String(criteria.dteMax),
    minOpenInterest: String(criteria.minOpenInterest),
    maxSpreadPercent: criteria.maxSpreadPercent,
    priceCeilingEnabled: criteria.maxUnderlyingPrice !== null,
    maxUnderlyingPrice: criteria.maxUnderlyingPrice ?? '',
    ivRankFloorEnabled: criteria.minIvRank !== null,
    minIvRank: criteria.minIvRank ?? '',
    earningsHandling: criteria.earningsHandling
  }
}

/** Validated form values → the save payload. An off toggle persists as `null`. */
export function toPayload(values: ScreeningCriteriaFormValues): SaveScreeningCriteriaPayload {
  return {
    deltaMin: values.deltaMin,
    deltaMax: values.deltaMax,
    dteMin: Number(values.dteMin),
    dteMax: Number(values.dteMax),
    minOpenInterest: Number(values.minOpenInterest),
    maxSpreadPercent: values.maxSpreadPercent,
    maxUnderlyingPrice: values.priceCeilingEnabled ? values.maxUnderlyingPrice : null,
    minIvRank: values.ivRankFloorEnabled ? values.minIvRank : null,
    earningsHandling: values.earningsHandling
  }
}
