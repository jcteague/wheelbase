import { isValid } from 'date-fns'

import {
  countCompletedSessionsAfter,
  etDateOf,
  getMostRecentCompletedSession,
  isIsoDay,
  type TradingCalendar
} from './trading-calendar'

export const FRESH_MAX_AGE = 1
export const AGING_MAX_AGE = 3
export const STALE_MAX_AGE = 10

/** The states age alone decides. */
export type IvRankAgeTier = 'fresh' | 'aging' | 'stale' | 'expired'

/** `predates_earnings` is the one state age does not decide — a reading of any tier
 *  can be overridden by a print that landed after it. */
export type IvRankState = IvRankAgeTier | 'predates_earnings'

/** What the IV-history series publishes for a ticker, derived from its 252-session IV30 window. */
export type IvRankReading = {
  value: string | null // integer rank as a string; null when the window is flat (high === low)
  percentile: string // integer IV percentile as a string
  low: string // 52-week IV30 low, 4 dp
  high: string // 52-week IV30 high, 4 dp
  observedAt: string // ISO instant of the anchor session's close
}

export type AssessedIvRank = IvRankReading & {
  ageTradingDays: number
  state: IvRankState
}

/** Whether a reading in this state is fit to score a candidate on. Derived rather than
 *  carried alongside `state` so there is one rule, not two that can drift apart. */
export function isUsableState(state: IvRankState): boolean {
  return state === 'fresh' || state === 'aging'
}

/**
 * Whether a reading could be read at all.
 *
 * Ageing out is not a failure to read: an expired reading is assessed like any other,
 * carrying its value and age so the trader sees a marked stale number rather than the
 * same blank a never-collected ticker shows. `unreadable` is the only absence, and it
 * means a corrupt value or a calendar that cannot reach the observation — degradation
 * the operator should hear about rather than a row quietly turning into `null`.
 */
export type IvRankAssessment =
  | { status: 'assessed'; reading: AssessedIvRank }
  | { status: 'unreadable' }

export type AssessContext = {
  now: Date
  lastEarnings: string | null | undefined
  /** Supplied by the caller so this engine stays pure. A calendar that cannot speak
   *  for the moment in question yields `null` — unknown, never a guessed age. */
  calendar: TradingCalendar
}

export function tierForAge(age: number): IvRankAgeTier {
  if (age < 0 || !Number.isInteger(age)) return 'expired'
  if (age <= FRESH_MAX_AGE) return 'fresh'
  if (age <= AGING_MAX_AGE) return 'aging'
  if (age <= STALE_MAX_AGE) return 'stale'
  return 'expired'
}

function isFiniteNumberString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
}

/** A null rank is a flat window, not a corrupt one — the percentile and range still read. */
function validReading(reading: IvRankReading, now: Date): boolean {
  if (reading.value !== null && !isFiniteNumberString(reading.value)) return false
  if (![reading.percentile, reading.low, reading.high].every(isFiniteNumberString)) return false
  const observedAt = new Date(reading.observedAt)
  return isValid(observedAt) && observedAt <= now
}

/** A print we already know about landed after the reading, so the reading cannot
 *  reflect it — no matter how few trading days old it is. */
function predatesKnownEarnings(
  lastEarnings: string | null | undefined,
  observationSessionDate: string,
  now: Date
): boolean {
  if (lastEarnings === null || lastEarnings === undefined || !isIsoDay(lastEarnings)) return false
  const today = etDateOf(now)
  return today !== '' && lastEarnings <= today && lastEarnings > observationSessionDate
}

export function assessIvRank(reading: IvRankReading, ctx: AssessContext): IvRankAssessment {
  if (!isValid(ctx.now) || !validReading(reading, ctx.now)) return { status: 'unreadable' }

  const observation = getMostRecentCompletedSession(ctx.calendar, new Date(reading.observedAt))
  if (observation === null) return { status: 'unreadable' }

  const ageTradingDays = countCompletedSessionsAfter(ctx.calendar, observation, ctx.now)
  if (ageTradingDays === null) return { status: 'unreadable' }

  // Predating a known print outranks age: such a reading is unusable however new it is.
  const state = predatesKnownEarnings(ctx.lastEarnings, observation.date, ctx.now)
    ? 'predates_earnings'
    : tierForAge(ageTradingDays)

  return {
    status: 'assessed',
    reading: {
      value: reading.value,
      percentile: reading.percentile,
      low: reading.low,
      high: reading.high,
      observedAt: reading.observedAt,
      ageTradingDays,
      state
    }
  }
}
