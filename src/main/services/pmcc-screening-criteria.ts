// [US-110] PMCC screening-criteria persistence — one `app_settings` row holding the
// whole PMCC criteria document as JSON, beside (never inside) the wheel's US-67 row.
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { ValidationError } from '../core/lifecycle'
import { DEFAULT_PMCC_SCREENING_CRITERIA, type PmccScreeningCriteria } from '../core/pmcc-screener'
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
  isSpreadAbsoluteInRange,
  isSpreadPercentInRange
} from '../core/screening-criteria'
import { logger } from '../logger'
import { appSettings } from './app-settings'

export const PMCC_SCREENING_CRITERIA_KEY = 'pmcc_screening_criteria'

/** The save payload: the full PMCC criteria minus the field the service supplies itself. */
export type SavePmccScreeningCriteriaInput = Omit<PmccScreeningCriteria, 'maxSpreadAbsolute'>

const DEFAULTS = DEFAULT_PMCC_SCREENING_CRITERIA

/**
 * Read-path shape only. Every field carries a `.default()` from the shipped
 * defaults, so a document written before a field existed reads back with that
 * field's default — adding a field is never a breaking change. Present-but-invalid
 * values still fail, which the caller turns into a wholesale fallback.
 */
const StoredPmccScreeningCriteriaSchema = z.object({
  longDeltaMin: z.string().refine(isDeltaInRange).default(DEFAULTS.longDeltaMin),
  longDeltaMax: z.string().refine(isDeltaInRange).default(DEFAULTS.longDeltaMax),
  longDteMin: z.number().refine(isLongDteInRange).default(DEFAULTS.longDteMin),
  longDteMax: z.number().refine(isLongDteInRange).default(DEFAULTS.longDteMax),
  shortDeltaMin: z.string().refine(isDeltaInRange).default(DEFAULTS.shortDeltaMin),
  shortDeltaMax: z.string().refine(isDeltaInRange).default(DEFAULTS.shortDeltaMax),
  shortDteMin: z.number().refine(isDteInRange).default(DEFAULTS.shortDteMin),
  shortDteMax: z.number().refine(isDteInRange).default(DEFAULTS.shortDteMax),
  maxDebitToWidthPercent: z
    .string()
    .refine(isDebitToWidthInRange)
    .default(DEFAULTS.maxDebitToWidthPercent),
  minOpenInterest: z.number().refine(isOpenInterestInRange).default(DEFAULTS.minOpenInterest),
  maxSpreadPercent: z.string().refine(isSpreadPercentInRange).default(DEFAULTS.maxSpreadPercent),
  maxSpreadAbsolute: z.string().refine(isSpreadAbsoluteInRange).default(DEFAULTS.maxSpreadAbsolute),
  minIvRank: z.string().refine(isIvRankFloorInRange).nullable().default(DEFAULTS.minIvRank),
  maxIvRank: z.string().refine(isIvRankCeilingInRange).nullable().default(DEFAULTS.maxIvRank),
  earningsHandling: z.enum(['exclude', 'flag']).default(DEFAULTS.earningsHandling)
})

type CriteriaField = keyof SavePmccScreeningCriteriaInput

type CrossFieldRule = {
  holds: (criteria: SavePmccScreeningCriteriaInput) => boolean
  field: CriteriaField
  code: 'inverted_band' | 'overlapping_windows'
  message: string
}

/** The six cross-field rules in data-model order, each naming the field the sheet
 *  binds its message to. Shared by the write path (throw on the first broken rule)
 *  and the read path (fall back wholesale on any). */
const CROSS_FIELD_RULES: readonly CrossFieldRule[] = [
  {
    holds: (c) => isAscending(c.longDeltaMin, c.longDeltaMax),
    field: 'longDeltaMax',
    code: 'inverted_band',
    message: DELTA_INVERTED_MESSAGE
  },
  {
    holds: (c) => isAscending(c.shortDeltaMin, c.shortDeltaMax),
    field: 'shortDeltaMax',
    code: 'inverted_band',
    message: DELTA_INVERTED_MESSAGE
  },
  {
    holds: (c) => isAscending(c.longDteMin, c.longDteMax),
    field: 'longDteMax',
    code: 'inverted_band',
    message: DTE_INVERTED_MESSAGE
  },
  {
    holds: (c) => isAscending(c.shortDteMin, c.shortDteMax),
    field: 'shortDteMax',
    code: 'inverted_band',
    message: DTE_INVERTED_MESSAGE
  },
  {
    holds: (c) => isAscending(c.shortDteMax, c.longDteMin),
    field: 'longDteMin',
    code: 'overlapping_windows',
    message: DTE_WINDOWS_OVERLAP_MESSAGE
  },
  {
    holds: (c) =>
      c.minIvRank === null || c.maxIvRank === null || isAscending(c.minIvRank, c.maxIvRank),
    field: 'maxIvRank',
    code: 'inverted_band',
    message: IV_RANK_INVERTED_MESSAGE
  }
]

function brokenRule(criteria: SavePmccScreeningCriteriaInput): CrossFieldRule | undefined {
  return CROSS_FIELD_RULES.find((rule) => !rule.holds(criteria))
}

/** Which end of a DTE window was missed — the two bounds have distinct copy. */
function longDteMessage(value: number): string {
  return value > LONG_DTE_MAX ? LONG_DTE_MAX_MESSAGE : DTE_MIN_MESSAGE
}

function shortDteMessage(value: number): string {
  return value > DTE_MAX ? DTE_MAX_MESSAGE : DTE_MIN_MESSAGE
}

/** Logs the rejected save and throws the error the IPC envelope carries to the sheet. */
function reject(field: CriteriaField, code: string, message: string): never {
  logger.info({ field, code }, 'PMCC criteria rejected')
  throw new ValidationError(field, code, message)
}

function requireInRange(inRange: boolean, field: CriteriaField, message: string): void {
  if (!inRange) {
    reject(field, 'out_of_range', message)
  }
}

/** Rejects the first bound or cross-field rule the payload breaks. Per-field bounds
 *  run first: a band can only be called inverted once both of its ends are legal. */
function assertValid(input: SavePmccScreeningCriteriaInput): void {
  requireInRange(isDeltaInRange(input.longDeltaMin), 'longDeltaMin', DELTA_RANGE_MESSAGE)
  requireInRange(isDeltaInRange(input.longDeltaMax), 'longDeltaMax', DELTA_RANGE_MESSAGE)
  requireInRange(isLongDteInRange(input.longDteMin), 'longDteMin', longDteMessage(input.longDteMin))
  requireInRange(isLongDteInRange(input.longDteMax), 'longDteMax', longDteMessage(input.longDteMax))
  requireInRange(isDeltaInRange(input.shortDeltaMin), 'shortDeltaMin', DELTA_RANGE_MESSAGE)
  requireInRange(isDeltaInRange(input.shortDeltaMax), 'shortDeltaMax', DELTA_RANGE_MESSAGE)
  requireInRange(isDteInRange(input.shortDteMin), 'shortDteMin', shortDteMessage(input.shortDteMin))
  requireInRange(isDteInRange(input.shortDteMax), 'shortDteMax', shortDteMessage(input.shortDteMax))
  requireInRange(
    isDebitToWidthInRange(input.maxDebitToWidthPercent),
    'maxDebitToWidthPercent',
    DEBIT_TO_WIDTH_MESSAGE
  )
  requireInRange(
    isOpenInterestInRange(input.minOpenInterest),
    'minOpenInterest',
    OPEN_INTEREST_MESSAGE
  )
  requireInRange(
    isSpreadPercentInRange(input.maxSpreadPercent),
    'maxSpreadPercent',
    SPREAD_PERCENT_MESSAGE
  )
  // A null IV-rank end is disabled, so it has no bound to break.
  requireInRange(
    input.minIvRank === null || isIvRankFloorInRange(input.minIvRank),
    'minIvRank',
    IV_RANK_MESSAGE
  )
  requireInRange(
    input.maxIvRank === null || isIvRankCeilingInRange(input.maxIvRank),
    'maxIvRank',
    IV_RANK_CEILING_MESSAGE
  )

  const broken = brokenRule(input)
  if (broken !== undefined) {
    reject(broken.field, broken.code, broken.message)
  }
}

/** Every unreadable stored document is answered the same way: log why, return defaults. */
function fallBackToDefaults(details: Record<string, unknown>): PmccScreeningCriteria {
  logger.warn(details, 'pmcc_screening_criteria_unreadable')
  return DEFAULTS
}

/** The trader's saved PMCC criteria, or the shipped defaults when nothing is stored or
 *  what is stored cannot be trusted. Never throws, never partial. */
export function getPmccScreeningCriteria(db: Database.Database): PmccScreeningCriteria {
  const stored = appSettings.get(db, PMCC_SCREENING_CRITERIA_KEY)
  if (stored === undefined) {
    logger.debug('pmcc_screening_criteria_unset')
    return DEFAULTS
  }

  let document: unknown
  try {
    document = JSON.parse(stored)
  } catch (err) {
    return fallBackToDefaults({ err, reason: 'invalid_json' })
  }

  const parsed = StoredPmccScreeningCriteriaSchema.safeParse(document)
  if (!parsed.success) {
    // Wholesale fallback, not field-by-field: a half-defaulted band is not a band the
    // trader ever chose.
    return fallBackToDefaults({ reason: 'schema_mismatch', issues: parsed.error.issues })
  }

  // Per-field defaults apply independently, so a document missing one end of a band
  // or window can parse into an inconsistency the write path would have rejected.
  const criteria = parsed.data
  const broken = brokenRule(criteria)
  if (broken !== undefined) {
    return fallBackToDefaults({ reason: broken.code, field: broken.field, criteria })
  }

  logger.debug({ criteria }, 'pmcc_screening_criteria_loaded')
  return criteria
}

/** Validates and replaces the stored PMCC criteria wholesale, returning the persisted
 *  document read back so the caller never displays something that was not stored. */
export function savePmccScreeningCriteria(
  db: Database.Database,
  input: SavePmccScreeningCriteriaInput
): PmccScreeningCriteria {
  logger.debug({ input }, 'pmcc_screening_criteria_save_requested')
  assertValid(input)

  // maxSpreadAbsolute has no input in the sheet — it is persisted, never edited.
  const document: PmccScreeningCriteria = {
    ...input,
    maxSpreadAbsolute: DEFAULTS.maxSpreadAbsolute
  }

  appSettings.set(db, PMCC_SCREENING_CRITERIA_KEY, JSON.stringify(document))
  logger.info({ criteria: document }, 'PMCC criteria saved')
  return getPmccScreeningCriteria(db)
}
