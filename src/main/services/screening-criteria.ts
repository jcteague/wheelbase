// [US-67] Screening-criteria persistence — the whole criteria document lives in one
// `app_settings` row as JSON, so adding a criterion needs no migration.
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { ValidationError } from '../core/lifecycle'
import { DEFAULT_SCREENING_CRITERIA, type ScreeningCriteria } from '../core/screener'
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
  isSpreadAbsoluteInRange,
  isSpreadPercentInRange
} from '../core/screening-criteria'
import { logger } from '../logger'
import { appSettings } from './app-settings'

const SCREENING_CRITERIA_KEY = 'screening_criteria'

/** The save payload: the full criteria minus the field the service supplies itself. */
export type SaveScreeningCriteriaInput = Omit<ScreeningCriteria, 'maxSpreadAbsolute'>

/**
 * Read-path shape only. Every field carries a `.default()` from the shipped
 * defaults, so a document written before a field existed reads back with that
 * field's default rather than `undefined` — adding a field is never a breaking
 * change. Present-but-invalid values still fail, which the caller turns into a
 * wholesale fallback.
 */
const StoredScreeningCriteriaSchema = z.object({
  deltaMin: z.string().refine(isDeltaInRange).default(DEFAULT_SCREENING_CRITERIA.deltaMin),
  deltaMax: z.string().refine(isDeltaInRange).default(DEFAULT_SCREENING_CRITERIA.deltaMax),
  dteMin: z.number().refine(isDteInRange).default(DEFAULT_SCREENING_CRITERIA.dteMin),
  dteMax: z.number().refine(isDteInRange).default(DEFAULT_SCREENING_CRITERIA.dteMax),
  minOpenInterest: z
    .number()
    .refine(isOpenInterestInRange)
    .default(DEFAULT_SCREENING_CRITERIA.minOpenInterest),
  maxSpreadPercent: z
    .string()
    .refine(isSpreadPercentInRange)
    .default(DEFAULT_SCREENING_CRITERIA.maxSpreadPercent),
  maxSpreadAbsolute: z
    .string()
    .refine(isSpreadAbsoluteInRange)
    .default(DEFAULT_SCREENING_CRITERIA.maxSpreadAbsolute),
  maxUnderlyingPrice: z
    .string()
    .refine(isPriceCeilingInRange)
    .nullable()
    .default(DEFAULT_SCREENING_CRITERIA.maxUnderlyingPrice),
  minIvRank: z
    .string()
    .refine(isIvRankFloorInRange)
    .nullable()
    .default(DEFAULT_SCREENING_CRITERIA.minIvRank),
  earningsHandling: z.enum(['exclude', 'flag']).default(DEFAULT_SCREENING_CRITERIA.earningsHandling)
})

/** Which end of the DTE window was missed — the two bounds have distinct copy. */
function dteMessage(value: number): string {
  return value > DTE_MAX ? DTE_MAX_MESSAGE : DTE_MIN_MESSAGE
}

/** Throws on the first bound or cross-field rule the payload breaks, naming the field
 *  the form binds the message to. Per-field bounds run first: a band can only be
 *  called inverted once both of its ends are themselves legal. */
function assertValid(input: SaveScreeningCriteriaInput): void {
  if (!isDeltaInRange(input.deltaMin)) {
    throw new ValidationError('deltaMin', 'out_of_range', DELTA_RANGE_MESSAGE)
  }
  if (!isDeltaInRange(input.deltaMax)) {
    throw new ValidationError('deltaMax', 'out_of_range', DELTA_RANGE_MESSAGE)
  }
  if (!isDteInRange(input.dteMin)) {
    throw new ValidationError('dteMin', 'out_of_range', dteMessage(input.dteMin))
  }
  if (!isDteInRange(input.dteMax)) {
    throw new ValidationError('dteMax', 'out_of_range', dteMessage(input.dteMax))
  }
  if (!isOpenInterestInRange(input.minOpenInterest)) {
    throw new ValidationError('minOpenInterest', 'out_of_range', OPEN_INTEREST_MESSAGE)
  }
  if (!isSpreadPercentInRange(input.maxSpreadPercent)) {
    throw new ValidationError('maxSpreadPercent', 'out_of_range', SPREAD_PERCENT_MESSAGE)
  }
  if (input.maxUnderlyingPrice !== null && !isPriceCeilingInRange(input.maxUnderlyingPrice)) {
    throw new ValidationError('maxUnderlyingPrice', 'out_of_range', PRICE_CEILING_MESSAGE)
  }
  if (input.minIvRank !== null && !isIvRankFloorInRange(input.minIvRank)) {
    throw new ValidationError('minIvRank', 'out_of_range', IV_RANK_MESSAGE)
  }
  if (!isAscending(input.deltaMin, input.deltaMax)) {
    throw new ValidationError('deltaMax', 'inverted_band', DELTA_INVERTED_MESSAGE)
  }
  if (!isAscending(input.dteMin, input.dteMax)) {
    throw new ValidationError('dteMax', 'inverted_band', DTE_INVERTED_MESSAGE)
  }
}

/** The trader's saved screening criteria, or the shipped defaults when nothing is
 *  stored or what is stored cannot be trusted. Never throws, never partial. */
export function getScreeningCriteria(db: Database.Database): ScreeningCriteria {
  const stored = appSettings.get(db, SCREENING_CRITERIA_KEY)
  if (stored === undefined) {
    logger.debug('screening_criteria_unset')
    return DEFAULT_SCREENING_CRITERIA
  }

  let document: unknown
  try {
    document = JSON.parse(stored)
  } catch (err) {
    logger.warn({ err, reason: 'invalid_json' }, 'screening_criteria_unreadable')
    return DEFAULT_SCREENING_CRITERIA
  }

  const parsed = StoredScreeningCriteriaSchema.safeParse(document)
  if (!parsed.success) {
    // Wholesale fallback, not field-by-field: a half-defaulted band is not a band
    // the trader ever chose.
    logger.warn(
      { reason: 'schema_mismatch', issues: parsed.error.issues },
      'screening_criteria_unreadable'
    )
    return DEFAULT_SCREENING_CRITERIA
  }

  // Per-field defaults are applied independently, so a document holding one end of
  // a band and missing the other parses cleanly into an inverted band the write
  // path would have rejected. Re-check both bands and fall back wholesale too.
  const criteria = parsed.data
  if (
    !isAscending(criteria.deltaMin, criteria.deltaMax) ||
    !isAscending(criteria.dteMin, criteria.dteMax)
  ) {
    logger.warn({ reason: 'inverted_band', criteria }, 'screening_criteria_unreadable')
    return DEFAULT_SCREENING_CRITERIA
  }

  logger.debug({ criteria }, 'screening_criteria_loaded')
  return criteria
}

/** Validates and replaces the stored criteria wholesale, returning the persisted
 *  document read back so the caller can never display something that was not stored. */
export function saveScreeningCriteria(
  db: Database.Database,
  input: SaveScreeningCriteriaInput
): ScreeningCriteria {
  logger.debug({ input }, 'screening_criteria_save_requested')
  assertValid(input)

  // maxSpreadAbsolute has no input in the sheet — it is persisted, never edited.
  const document: ScreeningCriteria = {
    ...input,
    maxSpreadAbsolute: DEFAULT_SCREENING_CRITERIA.maxSpreadAbsolute
  }

  appSettings.set(db, SCREENING_CRITERIA_KEY, JSON.stringify(document))
  logger.info({ criteria: document }, 'screening_criteria_saved')
  return getScreeningCriteria(db)
}
