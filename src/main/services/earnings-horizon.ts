// [US-96] The one place a trader's DTE window becomes an earnings horizon *date*, and
// the one place that read is allowed to fail quietly. Both the screener and the bench
// snapshot need exactly this, and duplicating it meant duplicating the buffer below —
// two copies of a number whose rationale is a paragraph long, only one of which anyone
// tuning it would find.
//
// It lives in its own module rather than inside `earnings-dates.ts` so the call to
// `getEarningsCalendar` still crosses a module boundary: both callers' tests mock that
// export, and a same-module call would slip past the mock.
import type Database from 'better-sqlite3'
import { addDays } from 'date-fns'

import type { ScreeningCriteria } from '../core/screener'
import { logger } from '../logger'
import { getEarningsCalendar, type EarningsCalendarKnowledge } from './earnings-dates'

// [US-70] Days past the furthest expiry the earnings calendar is read through.
//
// Deciding *whether* earnings land in the window only needs coverage through expiry.
// This buffer exists for the other half of the judgement: telling `clear` ("we found
// the next print and it is after expiry") apart from `unknown` ("we did not look far
// enough to say"). Earnings are quarterly, so a buffer that merely clears `dteMax`
// would report `unknown` for most genuinely-clear candidates — whenever the next print
// happens to fall past the horizon — burying the real cautions in noise. Sized to a
// full earnings cycle instead: with the default 45-day `dteMax` this reads ~90 days
// out, so a print anywhere in the current quarter is found rather than missed.
//
// Widening costs nothing per run: it is still one request per ticker; the calendar
// returns the first event on or after today, and a deeper `checked_through` row also
// satisfies US-56's shallower 30-day question.
const LOOKAHEAD_BUFFER_DAYS = 45

/**
 * Next and last earnings per ticker, read to the caller's DTE window plus a full
 * earnings cycle. A read failure degrades to "unavailable for everyone" rather than
 * sinking the run: an earnings gap is a caution the trader reads on each row, never
 * grounds to suppress the other results, and never grounds to exclude — per the
 * failure-isolation ADR.
 *
 * `logLabel` stays the caller's rather than one shared name: which surface degraded is
 * the first thing an operator reading the log needs, and the screener and the bench
 * snapshot fail for different reasons and on different cadences.
 */
export async function readEarningsOrEmpty(
  db: Database.Database,
  tickers: string[],
  criteria: Pick<ScreeningCriteria, 'dteMax'>,
  currentDate: Date,
  logLabel: string
): Promise<Map<string, EarningsCalendarKnowledge>> {
  try {
    return await getEarningsCalendar(db, tickers, {
      horizon: addDays(currentDate, criteria.dteMax + LOOKAHEAD_BUFFER_DAYS),
      now: currentDate
    })
  } catch (err) {
    logger.warn({ err, tickers }, logLabel)
    return new Map()
  }
}
