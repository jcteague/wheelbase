import type { ScreenerIvRank } from '../api/screener'
import { formatIvrValue } from './screener-format'

type IvrState = ScreenerIvRank['state']

export const TIER_TITLE: Record<IvrState, string> = {
  fresh: 'Fresh',
  aging: 'Aging',
  stale: 'Stale',
  expired: 'Expired',
  predates_earnings: 'Predates earnings'
}

/**
 * Whether a reading in this state is fit to decide on. The main process owns the same
 * rule in `core/ivr-freshness.ts`; the renderer cannot import across the process
 * boundary, so this is the renderer's single copy of it.
 */
export function isUsableIvrState(state: IvrState): boolean {
  return state === 'fresh' || state === 'aging'
}

// Built once: constructing an Intl formatter is comparatively expensive and these render on
// every row of every screen. Both date a reading by its Eastern session, so a close that
// falls on the next UTC day is still named by the day it traded on.
const easternSession = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric'
})

const easternDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

/** The session a reading came from, named the way a trader names it: `Fri, Aug 28`. */
export function observedSessionLabel(observedAt: string): string {
  return easternSession.format(new Date(observedAt))
}

/** The same session for the accessible label, where there is no surrounding row to place it
 *  in the year: `Aug 28, 2026`. */
export function observedDayLabel(observedAt: string): string {
  return easternDay.format(new Date(observedAt))
}

/** A reading's age in the only unit that matters to it: `1 trading day`, `6 trading days`. */
export function tradingDaysLabel(age: number): string {
  return `${age} trading ${age === 1 ? 'day' : 'days'}`
}

/**
 * What the reading means for a decision — not just how old it is. Every tier says
 * whether it can satisfy an IV condition, because that is the question the number
 * on the row leaves open.
 */
function tooltipBody(reading: ScreenerIvRank): string {
  const observed = observedSessionLabel(reading.observedAt)
  const age = tradingDaysLabel(reading.ageTradingDays)
  const value = formatIvrValue(reading.value)

  switch (reading.state) {
    case 'predates_earnings':
      return `Observed ${observed} at the close, before the last earnings report. IV re-prices through a print, so this reading is unusable regardless of age — it cannot satisfy an IV condition or the IV-rank floor.`
    case 'expired':
      return `Last reading ${age} ago (${observed}). Treated as no reading: shows exp, never decides a condition, never applies the IV-rank floor. Age this old means collection has been failing.`
    case 'stale':
      return `IV rank ${value}, observed ${observed} — ${age} old. Too old to trust: shown for context but cannot satisfy an IV condition or the IV-rank floor. The ticker still ranks on yield-per-delta.`
    case 'aging':
      return `IV rank ${value}, observed ${observed} — ${age} old. Still decision-usable and still counts toward conditions and the floor; expect it to have drifted a few points.`
    case 'fresh':
      return `IV rank ${value}, observed ${observed} at the close — ${age} old. Current as of the last session close.`
  }
}

export function ivrTooltipCopy(reading: ScreenerIvRank): { title: string; body: string } {
  return { title: TIER_TITLE[reading.state], body: tooltipBody(reading) }
}
