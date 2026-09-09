// [US-70] Test-only seam for the earnings calendar.
//
// In production the `earnings_date` store reads through the live Finnhub feed. e2e
// runs must stay offline and deterministic, so when WHEELBASE_MOCK_EARNINGS is present
// the store reads this fixture map instead. When the env var is absent — i.e.
// production — `fakeEarningsCalendarFetcher()` returns null and the real feed is used
// unchanged, exactly as `createFakeIvrCollaborators` does for the IVR scraper.
import { addDays, format, parseISO } from 'date-fns'
import { etDateOf } from '../core/trading-calendar'
import type { EarningsLookup } from '../core/screener'
import type { EarningsCalendarRead } from './finnhub-earnings'

export type EarningsCalendarFeedFetcher = (
  tickers: string[],
  opts: { now: Date; lookaheadDays: number }
) => Promise<Record<string, EarningsCalendarRead>>

// A whole-request failure — an unreachable calendar, not a per-ticker gap. Set
// separately from the fixtures so an outage scenario needs no fixture edits.
const OUTAGE_ENV = 'WHEELBASE_MOCK_EARNINGS_UNREACHABLE'
const FIXTURES_ENV = 'WHEELBASE_MOCK_EARNINGS'
// Mirrors EARNINGS_LOOKBACK_DAYS in the live feed, so a fixture too far in the past
// falls out of the window here exactly as it would there.
const FIXTURE_LOOKBACK_DAYS = 30

/** Fixtures may be written in either the calendar shape or the older next-only
 *  shape, which reads as a single date that can answer both sides of today. */
type EarningsFixture = EarningsLookup | { status: 'read'; next: string | null; last: string | null }

function readFixtures(): Record<string, EarningsFixture> {
  const raw = process.env[FIXTURES_ENV]
  if (raw === undefined || raw === '') return {}
  try {
    return JSON.parse(raw) as Record<string, EarningsFixture>
  } catch {
    return {}
  }
}

function inWindow(date: string | null, from: string, to: string): string | null {
  return date !== null && date >= from && date <= to ? date : null
}

/**
 * The fake honours `lookaheadDays` the way the live calendar does: a fixture date past
 * the requested `to` bound reads as no upcoming event, not as one. That is what makes the
 * lookahead-widening regression test real — under the old hard-coded 30-day window an
 * event 37 days out would come back "no event", which is the silent pass US-70 fixes.
 */
export function fakeEarningsCalendarFetcher(): EarningsCalendarFeedFetcher | null {
  if (process.env[FIXTURES_ENV] === undefined && process.env[OUTAGE_ENV] === undefined) return null

  return async (tickers, { now, lookaheadDays }) => {
    if (process.env[OUTAGE_ENV] !== undefined) {
      throw new Error('fake earnings calendar unreachable')
    }

    const fixtures = readFixtures()
    const todayText = etDateOf(now)
    const today = parseISO(todayText)
    const from = format(addDays(today, -FIXTURE_LOOKBACK_DAYS), 'yyyy-MM-dd')
    const to = format(addDays(today, lookaheadDays), 'yyyy-MM-dd')
    // The live feed splits on today: it counts as upcoming, never as already printed.
    // An inclusive bound here would let one fixture be both at once — a state the real
    // calendar cannot produce, quietly certifying behaviour production never sees.
    const lastBound = format(addDays(today, -1), 'yyyy-MM-dd')

    return Object.fromEntries(
      tickers.map((ticker): [string, EarningsCalendarRead] => {
        const fixture = fixtures[ticker.toUpperCase()]
        // No fixture means the calendar was read and holds nothing — a genuinely
        // empty calendar, which is a different state from an unreachable one.
        if (fixture === undefined || fixture.status === 'none') {
          return [ticker, { status: 'read', next: null, last: null }]
        }
        if (fixture.status === 'unavailable') return [ticker, fixture]

        const dates =
          fixture.status === 'read' ? fixture : { next: fixture.date, last: fixture.date }
        return [
          ticker,
          {
            status: 'read',
            next: inWindow(dates.next, todayText, to),
            last: inWindow(dates.last, from, lastBound)
          }
        ]
      })
    )
  }
}
