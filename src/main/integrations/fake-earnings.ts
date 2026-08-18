// [US-70] Test-only seam for the earnings calendar.
//
// In production the `earnings_date` store reads through the live Finnhub feed. e2e
// runs must stay offline and deterministic, so when WHEELBASE_MOCK_EARNINGS is present
// the store reads this fixture map instead. When the env var is absent — i.e.
// production — `fakeEarningsFetcher()` returns null and the real feed is used
// unchanged, exactly as `createFakeIvrCollaborators` does for the IVR scraper.
import { addDays, format } from 'date-fns'
import type { EarningsLookup } from '../core/screener'

/** What the store calls to reach a calendar. `fetchNextEarnings` satisfies it. */
export type EarningsFeedFetcher = (
  tickers: string[],
  opts: { now: Date; lookaheadDays: number }
) => Promise<Record<string, EarningsLookup>>

// A whole-request failure — an unreachable calendar, not a per-ticker gap. Set
// separately from the fixtures so an outage scenario needs no fixture edits.
const OUTAGE_ENV = 'WHEELBASE_MOCK_EARNINGS_UNREACHABLE'
const FIXTURES_ENV = 'WHEELBASE_MOCK_EARNINGS'

function readFixtures(): Record<string, EarningsLookup> {
  const raw = process.env[FIXTURES_ENV]
  if (raw === undefined || raw === '') return {}
  try {
    return JSON.parse(raw) as Record<string, EarningsLookup>
  } catch {
    return {}
  }
}

/**
 * The fake honours `lookaheadDays` the way the live calendar does: a fixture date past
 * the requested `to` bound reads as `none`, not `found`. That is what makes the
 * lookahead-widening regression test real — under the old hard-coded 30-day window an
 * event 37 days out would come back "no event", which is the silent pass US-70 fixes.
 */
export function fakeEarningsFetcher(): EarningsFeedFetcher | null {
  if (process.env[FIXTURES_ENV] === undefined && process.env[OUTAGE_ENV] === undefined) return null

  return async (tickers, { now, lookaheadDays }) => {
    if (process.env[OUTAGE_ENV] !== undefined) {
      throw new Error('fake earnings calendar unreachable')
    }

    const fixtures = readFixtures()
    const to = format(addDays(now, lookaheadDays), 'yyyy-MM-dd')

    return Object.fromEntries(
      tickers.map((ticker): [string, EarningsLookup] => {
        const fixture = fixtures[ticker.toUpperCase()]
        // No fixture means the calendar was read and holds nothing — a genuinely
        // empty calendar, which is a different state from an unreachable one.
        if (fixture === undefined) return [ticker, { status: 'none' }]
        if (fixture.status !== 'found') return [ticker, fixture]
        return [ticker, fixture.date <= to ? fixture : { status: 'none' }]
      })
    )
  }
}
