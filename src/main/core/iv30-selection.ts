// IV30 contract selection — which expirations and strikes to price for one session.
// Pure engine — no database or broker imports allowed here.
//
// Rules: research.md ADR "Contract selection is generic over candidate expirations;
// one-sided brackets do not extrapolate".

import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  getDate,
  isFriday,
  parseISO
} from 'date-fns'
import { buildOccSymbol } from './option-symbol'

export const TARGET_DTE = 30
export const MIN_DTE = 7
export const STRIKE_INCREMENTS = [0.5, 1, 2.5, 5] as const

const WEEKLY_HORIZON_DAYS = 45
const MONTHLY_HORIZON_DAYS = 70

export type ExpirationPair = { near: string; far: string | null } // YYYY-MM-DD
export type ExpirationTier = 'weekly' | 'monthly'

export type SessionProbePlan = {
  session: string
  underlying: string
  strikes: number[] // strikeCandidates(underlyingPrice), nearest-first
  weekly: { pair: ExpirationPair; symbols: string[] } | null
  monthly: { pair: ExpirationPair; symbols: string[] } | null
}

function toIsoDay(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function daysToExpiry(session: string, expiration: string): number {
  return differenceInCalendarDays(parseISO(expiration), parseISO(session))
}

/**
 * Moves a closed expiration back to the prior session. A date after the last known session
 * is left as-is: the calendar has no evidence it is a closure. Never walks back past `session`.
 */
function shiftToSession(
  expiration: string,
  session: string,
  sessionSet: ReadonlySet<string>,
  lastKnown: string
): string {
  if (expiration > lastKnown || sessionSet.has(expiration) || expiration <= session) {
    return expiration
  }
  return shiftToSession(toIsoDay(addDays(parseISO(expiration), -1)), session, sessionSet, lastKnown)
}

/** Fridays whose raw date is in [session+MIN_DTE, session+horizon], shifted, then DTE-filtered. */
function fridayCandidates(
  session: string,
  sessions: readonly string[],
  horizonDays: number,
  include: (friday: Date) => boolean
): string[] {
  const start = parseISO(session)
  const sessionSet = new Set(sessions)
  const lastKnown = sessions.reduce((max, d) => (d > max ? d : max), '')
  const shifted = eachDayOfInterval({
    start: addDays(start, MIN_DTE),
    end: addDays(start, horizonDays)
  })
    .filter((day) => isFriday(day) && include(day))
    .map((friday) => shiftToSession(toIsoDay(friday), session, sessionSet, lastKnown))
    .filter((expiration) => daysToExpiry(session, expiration) >= MIN_DTE)
  return [...new Set(shifted)]
}

/** Fridays in [session+MIN_DTE, session+45], each shifted to the prior session when it is a closure. */
export function weeklyCandidates(session: string, sessions: readonly string[]): string[] {
  return fridayCandidates(session, sessions, WEEKLY_HORIZON_DAYS, () => true)
}

function isThirdFriday(friday: Date): boolean {
  const dayOfMonth = getDate(friday)
  return dayOfMonth >= 15 && dayOfMonth <= 21
}

/** Third Fridays in [session+MIN_DTE, session+70], shifted the same way. */
export function monthlyCandidates(session: string, sessions: readonly string[]): string[] {
  return fridayCandidates(session, sessions, MONTHLY_HORIZON_DAYS, isThirdFriday)
}

/**
 * Largest ≤ TARGET_DTE and smallest > TARGET_DTE among candidates with DTE ≥ MIN_DTE;
 * exactly 30 → alone; one-sided → nearest alone; none → null.
 */
export function selectExpirationPair(
  session: string,
  candidates: readonly string[]
): ExpirationPair | null {
  const usable = candidates
    .map((expiration) => ({ expiration, dte: daysToExpiry(session, expiration) }))
    .filter(({ dte }) => dte >= MIN_DTE)
    .sort((a, b) => a.dte - b.dte)
  const near = usable.filter(({ dte }) => dte <= TARGET_DTE).at(-1)
  const far = usable.find(({ dte }) => dte > TARGET_DTE)

  if (near && near.dte === TARGET_DTE) return { near: near.expiration, far: null }
  if (near && far) return { near: near.expiration, far: far.expiration }
  const lone = near ?? far
  return lone ? { near: lone.expiration, far: null } : null
}

/** floor/ceil of `price` at each increment, deduplicated, nearest to `price` first. */
export function strikeCandidates(price: number): number[] {
  const onGrid = (x: number): number => Number(x.toFixed(4))
  const strikes = STRIKE_INCREMENTS.flatMap((inc) => [
    onGrid(Math.floor(price / inc) * inc),
    onGrid(Math.ceil(price / inc) * inc)
  ])
  return [...new Set(strikes)].sort((a, b) => Math.abs(a - price) - Math.abs(b - price))
}

function probeTier(
  underlying: string,
  session: string,
  strikes: readonly number[],
  candidates: readonly string[]
): { pair: ExpirationPair; symbols: string[] } | null {
  const pair = selectExpirationPair(session, candidates)
  if (!pair) return null
  const expirations = pair.far === null ? [pair.near] : [pair.near, pair.far]
  const symbols = expirations.flatMap((expiration) =>
    strikes.flatMap((strike) =>
      (['CALL', 'PUT'] as const).map((instrumentType) =>
        buildOccSymbol({ ticker: underlying, expiration, strike, instrumentType })
      )
    )
  )
  return { pair, symbols: [...new Set(symbols)] }
}

/** Every OCC symbol (C and P × strike × expiration) to request for one session. */
export function planSessionProbe(input: {
  underlying: string
  session: string
  underlyingPrice: number
  sessions: readonly string[]
}): SessionProbePlan {
  const { underlying, session, underlyingPrice, sessions } = input
  const strikes = strikeCandidates(underlyingPrice)
  return {
    session,
    underlying,
    strikes,
    weekly: probeTier(underlying, session, strikes, weeklyCandidates(session, sessions)),
    monthly: probeTier(underlying, session, strikes, monthlyCandidates(session, sessions))
  }
}
