import { isValid } from 'date-fns'

import type { IvRank } from './screener'
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

export type IvRankState = 'fresh' | 'aging' | 'stale' | 'predates_earnings'

export type AssessedIvRank = {
  value: string
  observedAt: string
  ageTradingDays: number
  state: IvRankState
}

/** Whether a reading in this state is fit to score a candidate on. Derived rather than
 *  carried alongside `state` so there is one rule, not two that can drift apart. */
export function isUsableState(state: IvRankState): boolean {
  return state === 'fresh' || state === 'aging'
}

/**
 * Why a reading did or did not produce a verdict.
 *
 * `expired` and `unreadable` both render as "no IV rank", but they are not the same
 * event: one is an ordinary consequence of a reading ageing out, the other means a
 * corrupt value or a calendar that cannot reach the observation. Collapsing them to
 * `null` is what let a corrupt row degrade the screen in silence.
 */
export type IvRankAssessment =
  | { status: 'assessed'; reading: AssessedIvRank }
  | { status: 'expired' }
  | { status: 'unreadable' }

export type AssessContext = {
  now: Date
  lastEarnings: string | null | undefined
  /** Supplied by the caller so this engine stays pure. A calendar that cannot speak
   *  for the moment in question yields `null` — unknown, never a guessed age. */
  calendar: TradingCalendar
}

export function tierForAge(age: number): 'fresh' | 'aging' | 'stale' | 'expired' {
  if (age < 0 || !Number.isInteger(age)) return 'expired'
  if (age <= FRESH_MAX_AGE) return 'fresh'
  if (age <= AGING_MAX_AGE) return 'aging'
  if (age <= STALE_MAX_AGE) return 'stale'
  return 'expired'
}

function validReading(reading: IvRank, now: Date): boolean {
  if (typeof reading.value !== 'string' || reading.value.trim() === '') return false
  if (!Number.isFinite(Number(reading.value))) return false
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

export function assessIvRank(reading: IvRank, ctx: AssessContext): IvRankAssessment {
  if (!isValid(ctx.now) || !validReading(reading, ctx.now)) return { status: 'unreadable' }

  const observation = getMostRecentCompletedSession(ctx.calendar, new Date(reading.observedAt))
  if (observation === null) return { status: 'unreadable' }

  const ageTradingDays = countCompletedSessionsAfter(ctx.calendar, observation, ctx.now)
  if (ageTradingDays === null) return { status: 'unreadable' }

  // Predating a known print outranks age: such a reading is unusable however new it is.
  const state = predatesKnownEarnings(ctx.lastEarnings, observation.date, ctx.now)
    ? 'predates_earnings'
    : tierForAge(ageTradingDays)
  if (state === 'expired') return { status: 'expired' }

  return {
    status: 'assessed',
    reading: { value: reading.value, observedAt: reading.observedAt, ageTradingDays, state }
  }
}
