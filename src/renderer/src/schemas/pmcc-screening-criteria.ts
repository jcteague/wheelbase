// [US-110] Renderer form schema for the PMCC screening-criteria sheet.
//
// Same posture as the wheel's US-67 schema: every numeric field is a `z.string()`
// so an in-progress `'0.'` stays typeable, and every bound, rule and message comes
// from `src/main/core/screening-criteria.ts` — nothing here is re-typed. The rule
// order and field bindings match `CROSS_FIELD_RULES` in the PMCC criteria service.

import { z } from 'zod'
import {
  DEBIT_TO_WIDTH_MESSAGE,
  DELTA_INVERTED_MESSAGE,
  DELTA_RANGE_MESSAGE,
  DTE_INVERTED_MESSAGE,
  DTE_MAX,
  DTE_MAX_MESSAGE,
  DTE_MIN_MESSAGE,
  DTE_WINDOWS_OVERLAP_MESSAGE,
  IV_RANK_CEILING_MESSAGE,
  IV_RANK_INVERTED_MESSAGE,
  IV_RANK_MESSAGE,
  LONG_DTE_MAX,
  LONG_DTE_MAX_MESSAGE,
  OPEN_INTEREST_MESSAGE,
  SPREAD_PERCENT_MESSAGE,
  isAscending,
  isDebitToWidthInRange,
  isDeltaInRange,
  isDteInRange,
  isIvRankCeilingInRange,
  isIvRankFloorInRange,
  isLongDteInRange,
  isOpenInterestInRange,
  isSpreadPercentInRange
} from '../../../main/core/screening-criteria'
import type {
  PmccScreeningCriteria,
  SavePmccScreeningCriteriaPayload
} from '../api/pmcc-screening-criteria'

const criteriaFields = z.object({
  longDeltaMin: z.string(),
  longDeltaMax: z.string(),
  longDteMin: z.string(),
  longDteMax: z.string(),
  shortDeltaMin: z.string(),
  shortDeltaMax: z.string(),
  shortDteMin: z.string(),
  shortDteMax: z.string(),
  maxDebitToWidthPercent: z.string(),
  minOpenInterest: z.string(),
  maxSpreadPercent: z.string(),
  // The IV-rank ends are only validated while their toggle is on — a disabled
  // input keeps whatever the trader typed without blocking the save.
  ivRankFloorEnabled: z.boolean(),
  minIvRank: z.string(),
  ivRankCeilingEnabled: z.boolean(),
  maxIvRank: z.string(),
  earningsHandling: z.enum(['exclude', 'flag'])
})

type CriteriaFields = z.infer<typeof criteriaFields>

export const PMCC_SCREENING_CRITERIA_FIELDS = [
  'longDeltaMin',
  'longDeltaMax',
  'longDteMin',
  'longDteMax',
  'shortDeltaMin',
  'shortDeltaMax',
  'shortDteMin',
  'shortDteMax',
  'maxDebitToWidthPercent',
  'minOpenInterest',
  'maxSpreadPercent',
  'minIvRank',
  'maxIvRank'
] as const

export type PmccScreeningCriteriaField = (typeof PMCC_SCREENING_CRITERIA_FIELDS)[number]

/** Narrows an IPC error's `field` to a form field the sheet can bind it to. */
export function isPmccScreeningCriteriaField(field: string): field is PmccScreeningCriteriaField {
  return PMCC_SCREENING_CRITERIA_FIELDS.some((name) => name === field)
}

/** A LEAPS DTE outside its window is either too small or past 730 — say which. */
function longDteMessage(value: string): string {
  return Number(value) > LONG_DTE_MAX ? LONG_DTE_MAX_MESSAGE : DTE_MIN_MESSAGE
}

/** A short-call DTE keeps the wheel's one-year cap. */
function shortDteMessage(value: string): string {
  return Number(value) > DTE_MAX ? DTE_MAX_MESSAGE : DTE_MIN_MESSAGE
}

type CriteriaInput = keyof CriteriaFields

type FieldRule = {
  field: PmccScreeningCriteriaField
  /** Every input the rule reads besides `field` — editing one must re-check `field`. */
  alsoReads: CriteriaInput[]
  fails: (values: CriteriaFields) => boolean
  message: (values: CriteriaFields) => string
}

/** A bound rule: the field's own value must satisfy `inRange`. The message is fixed,
 *  or picked from the value when the field has distinct floor and ceiling copy. */
function bound(
  field: PmccScreeningCriteriaField,
  inRange: (value: string) => boolean,
  message: string | ((value: string) => string)
): FieldRule {
  return {
    field,
    alsoReads: [],
    fails: (v) => !inRange(v[field]),
    message: (v) => (typeof message === 'string' ? message : message(v[field]))
  }
}

/** An ordering rule `low < high`, bound to `high`. Silent until both ends are legal
 *  on their own, so the trader sees the bound message before the ordering one. A band
 *  checks both ends with one predicate; only the window-overlap rule needs two. */
function ascending(
  low: PmccScreeningCriteriaField,
  high: PmccScreeningCriteriaField,
  message: string,
  legalLow: (value: string) => boolean,
  legalHigh: (value: string) => boolean = legalLow
): FieldRule {
  return {
    field: high,
    alsoReads: [low],
    fails: (v) => legalLow(v[low]) && legalHigh(v[high]) && !isAscending(v[low], v[high]),
    message: () => message
  }
}

// Ordered registry of pure rules: every bound first, then the cross-field rules in
// the service's `CROSS_FIELD_RULES` order. The resolver keeps the first issue raised
// for a path, so a field's bound rule must precede any rule targeting it.
const RULES: FieldRule[] = [
  bound('longDeltaMin', isDeltaInRange, DELTA_RANGE_MESSAGE),
  bound('longDeltaMax', isDeltaInRange, DELTA_RANGE_MESSAGE),
  bound('longDteMin', isLongDteInRange, longDteMessage),
  bound('longDteMax', isLongDteInRange, longDteMessage),
  bound('shortDeltaMin', isDeltaInRange, DELTA_RANGE_MESSAGE),
  bound('shortDeltaMax', isDeltaInRange, DELTA_RANGE_MESSAGE),
  bound('shortDteMin', isDteInRange, shortDteMessage),
  bound('shortDteMax', isDteInRange, shortDteMessage),
  bound('maxDebitToWidthPercent', isDebitToWidthInRange, DEBIT_TO_WIDTH_MESSAGE),
  bound('minOpenInterest', isOpenInterestInRange, OPEN_INTEREST_MESSAGE),
  bound('maxSpreadPercent', isSpreadPercentInRange, SPREAD_PERCENT_MESSAGE),
  {
    field: 'minIvRank',
    alsoReads: ['ivRankFloorEnabled'],
    fails: (v) => v.ivRankFloorEnabled && !isIvRankFloorInRange(v.minIvRank),
    message: () => IV_RANK_MESSAGE
  },
  {
    field: 'maxIvRank',
    alsoReads: ['ivRankCeilingEnabled'],
    fails: (v) => v.ivRankCeilingEnabled && !isIvRankCeilingInRange(v.maxIvRank),
    message: () => IV_RANK_CEILING_MESSAGE
  },
  ascending('longDeltaMin', 'longDeltaMax', DELTA_INVERTED_MESSAGE, isDeltaInRange),
  ascending('shortDeltaMin', 'shortDeltaMax', DELTA_INVERTED_MESSAGE, isDeltaInRange),
  ascending('longDteMin', 'longDteMax', DTE_INVERTED_MESSAGE, isLongDteInRange),
  ascending('shortDteMin', 'shortDteMax', DTE_INVERTED_MESSAGE, isDteInRange),
  ascending(
    'shortDteMax',
    'longDteMin',
    DTE_WINDOWS_OVERLAP_MESSAGE,
    isDteInRange,
    isLongDteInRange
  ),
  // The IV band only exists while both of its toggles are on.
  {
    field: 'maxIvRank',
    alsoReads: ['ivRankFloorEnabled', 'ivRankCeilingEnabled', 'minIvRank'],
    fails: (v) =>
      v.ivRankFloorEnabled &&
      v.ivRankCeilingEnabled &&
      isIvRankFloorInRange(v.minIvRank) &&
      isIvRankCeilingInRange(v.maxIvRank) &&
      !isAscending(v.minIvRank, v.maxIvRank),
    message: () => IV_RANK_INVERTED_MESSAGE
  }
]

/** RHF `deps` for each input: the fields whose rules also read it. The form validates
 *  only the field being edited, so without these an edit to the unbound end of a
 *  cross-field rule leaves that rule's message missing, or stale, on its bound field. */
export const PMCC_SCREENING_CRITERIA_DEPS = RULES.flatMap((rule) =>
  rule.alsoReads.map((input) => ({ input, field: rule.field }))
).reduce<Partial<Record<CriteriaInput, PmccScreeningCriteriaField[]>>>(
  (deps, { input, field }) => ({
    ...deps,
    [input]: [...new Set([...(deps[input] ?? []), field])]
  }),
  {}
)

export const pmccScreeningCriteriaSchema = criteriaFields.superRefine((values, ctx) => {
  RULES.filter((rule) => rule.fails(values)).forEach((rule) =>
    ctx.addIssue({ code: 'custom', path: [rule.field], message: rule.message(values) })
  )
})

export type PmccScreeningCriteriaFormInput = z.input<typeof pmccScreeningCriteriaSchema>
export type PmccScreeningCriteriaFormValues = z.output<typeof pmccScreeningCriteriaSchema>

/** Persisted criteria → pre-filled form input. A `null` IV-rank end reads as "off". */
export function toFormValues(criteria: PmccScreeningCriteria): PmccScreeningCriteriaFormValues {
  return {
    longDeltaMin: criteria.longDeltaMin,
    longDeltaMax: criteria.longDeltaMax,
    longDteMin: String(criteria.longDteMin),
    longDteMax: String(criteria.longDteMax),
    shortDeltaMin: criteria.shortDeltaMin,
    shortDeltaMax: criteria.shortDeltaMax,
    shortDteMin: String(criteria.shortDteMin),
    shortDteMax: String(criteria.shortDteMax),
    maxDebitToWidthPercent: criteria.maxDebitToWidthPercent,
    minOpenInterest: String(criteria.minOpenInterest),
    maxSpreadPercent: criteria.maxSpreadPercent,
    ivRankFloorEnabled: criteria.minIvRank !== null,
    minIvRank: criteria.minIvRank ?? '',
    ivRankCeilingEnabled: criteria.maxIvRank !== null,
    maxIvRank: criteria.maxIvRank ?? '',
    earningsHandling: criteria.earningsHandling
  }
}

/** Validated form values → the save payload. An off toggle persists as `null`. */
export function toPayload(
  values: PmccScreeningCriteriaFormValues
): SavePmccScreeningCriteriaPayload {
  return {
    longDeltaMin: values.longDeltaMin,
    longDeltaMax: values.longDeltaMax,
    longDteMin: Number(values.longDteMin),
    longDteMax: Number(values.longDteMax),
    shortDeltaMin: values.shortDeltaMin,
    shortDeltaMax: values.shortDeltaMax,
    shortDteMin: Number(values.shortDteMin),
    shortDteMax: Number(values.shortDteMax),
    maxDebitToWidthPercent: values.maxDebitToWidthPercent,
    minOpenInterest: Number(values.minOpenInterest),
    maxSpreadPercent: values.maxSpreadPercent,
    minIvRank: values.ivRankFloorEnabled ? values.minIvRank : null,
    maxIvRank: values.ivRankCeilingEnabled ? values.maxIvRank : null,
    earningsHandling: values.earningsHandling
  }
}
