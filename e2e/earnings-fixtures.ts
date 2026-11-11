// [US-70] Earnings fixtures for the fake calendar's WHEELBASE_MOCK_EARNINGS seam, shared by the
// screener specs (anchored to the screener's fake clock) and the position-card specs (anchored
// to the real clock): each caller supplies how a day offset becomes a calendar date.

/** An earnings date as a day offset from today, so a fixture lands the same
 *  number of days out on any run date — the same technique as `dteOffset`. `null` is
 *  a failed request for that ticker.
 *
 *  [US-98] `{ next, last }` states both sides explicitly, for the specs that care which
 *  side of an observation a print fell on. `dayOffset` cannot express that: it is one
 *  date the fake reads as answering whichever side of today it lands on. */
export type EarningsFixture =
  | { dayOffset: number }
  | { next: string | null; last: string | null }
  | null

/** Day offsets → the `EarningsLookup` record the fake calendar reads. */
type EarningsFeedFixture =
  | { status: 'found'; date: string }
  | { status: 'read'; next: string | null; last: string | null }
  | { status: 'unavailable' }

function toFeedFixture(
  fixture: EarningsFixture,
  dateOf: (offsetDays: number) => string
): EarningsFeedFixture {
  if (fixture === null) return { status: 'unavailable' }
  if ('dayOffset' in fixture) return { status: 'found', date: dateOf(fixture.dayOffset) }
  return { status: 'read', next: fixture.next, last: fixture.last }
}

/** The fake calendar's fixture map, keyed by upper-cased ticker. */
export function buildEarningsFixtures(
  byTicker: Record<string, EarningsFixture>,
  dateOf: (offsetDays: number) => string
): Record<string, EarningsFeedFixture> {
  return Object.fromEntries(
    Object.entries(byTicker).map(([ticker, fixture]) => [
      ticker.toUpperCase(),
      toFeedFixture(fixture, dateOf)
    ])
  )
}
