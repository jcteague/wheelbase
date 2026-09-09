// [US-70] fake-earnings — the offline e2e seam for the earnings calendar. Its window
// filter is load-bearing: it is what makes the e2e lookahead-widening test a real
// regression test rather than a tautology, so it is unit-tested here rather than only
// exercised through Electron.
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, format } from 'date-fns'
import { fakeEarningsCalendarFetcher } from './fake-earnings'

const NOW = new Date(2026, 7, 1, 12, 0, 0)

function iso(offsetDays: number): string {
  return format(addDays(NOW, offsetDays), 'yyyy-MM-dd')
}

function armFixtures(fixtures: unknown): void {
  process.env.WHEELBASE_MOCK_EARNINGS = JSON.stringify(fixtures)
}

afterEach(() => {
  delete process.env.WHEELBASE_MOCK_EARNINGS
  delete process.env.WHEELBASE_MOCK_EARNINGS_UNREACHABLE
})

describe('fakeEarningsCalendarFetcher — arming', () => {
  it('returns null when neither env var is set, so production uses the live feed', () => {
    expect(fakeEarningsCalendarFetcher()).toBeNull()
  })

  it('returns a fetcher once the fixtures key is present, even when it is empty', () => {
    armFixtures({})
    expect(fakeEarningsCalendarFetcher()).not.toBeNull()
  })

  it('returns a fetcher when only the outage key is present', () => {
    process.env.WHEELBASE_MOCK_EARNINGS_UNREACHABLE = '1'
    expect(fakeEarningsCalendarFetcher()).not.toBeNull()
  })
})

describe('fakeEarningsCalendarFetcher — today belongs to exactly one side', () => {
  // The live feed splits strictly on today: it is the next print, never a past one.
  // While the fake's lookback bound was inclusive, a fixture dated today came back as
  // both at once — so an e2e run could certify `predates_earnings` behaviour that the
  // real calendar can never produce.
  it('reads a fixture dated today as upcoming and not as a past print', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(0) } })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result.NVDA).toEqual({ status: 'read', next: iso(0), last: null })
  })

  it('still reads yesterday as a past print', async () => {
    armFixtures({ NVDA: { status: 'read', next: iso(20), last: iso(-1) } })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result.NVDA).toEqual({ status: 'read', next: iso(20), last: iso(-1) })
  })
})

describe('fakeEarningsCalendarFetcher — lookahead window', () => {
  it('serves a fixture inside the requested window as the next print', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(20) } })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'read', next: iso(20), last: null } })
  })

  it('reads a fixture past the requested window as no event, exactly as the live calendar would', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(37) } })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'read', next: null, last: null } })
  })

  it('finds that same fixture once the lookahead is widened past it', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(37) } })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 50 })

    expect(result).toEqual({ NVDA: { status: 'read', next: iso(37), last: null } })
  })

  it('treats a fixture landing exactly on the window bound as inside it', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(30) } })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'read', next: iso(30), last: null } })
  })
})

describe('fakeEarningsCalendarFetcher — split fields and both bounds', () => {
  it('serves independent next and last fixture dates', async () => {
    armFixtures({
      NVDA: { status: 'read', next: iso(20), last: iso(-3) }
    })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], {
      now: NOW,
      lookaheadDays: 30
    })

    expect(result).toEqual({ NVDA: { status: 'read', next: iso(20), last: iso(-3) } })
  })

  it('does not expose a last date outside the thirty-day lookback', async () => {
    armFixtures({
      NVDA: { status: 'read', next: null, last: iso(-31) }
    })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], {
      now: NOW,
      lookaheadDays: 30
    })

    expect(result).toEqual({ NVDA: { status: 'read', next: null, last: null } })
  })
})

describe('fakeEarningsCalendarFetcher — per-ticker states', () => {
  it('reads a ticker with no fixture as an empty calendar, not an unreadable one', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) } })

    const result = await fakeEarningsCalendarFetcher()!(['NVDA', 'KO'], {
      now: NOW,
      lookaheadDays: 30
    })

    expect(result.KO).toEqual({ status: 'read', next: null, last: null })
  })

  it('passes a per-ticker unavailable fixture through untouched', async () => {
    armFixtures({ ABC: { status: 'unavailable' } })

    const result = await fakeEarningsCalendarFetcher()!(['ABC'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ ABC: { status: 'unavailable' } })
  })

  it('returns an entry for every requested ticker', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) }, ABC: { status: 'unavailable' } })
    const tickers = ['NVDA', 'ABC', 'KO']

    const result = await fakeEarningsCalendarFetcher()!(tickers, { now: NOW, lookaheadDays: 30 })

    expect(Object.keys(result)).toHaveLength(tickers.length)
  })

  it('matches fixtures case-insensitively, as the live feed upper-cases its requests', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) } })

    const result = await fakeEarningsCalendarFetcher()!(['nvda'], { now: NOW, lookaheadDays: 30 })

    expect(result.nvda).toEqual({ status: 'read', next: iso(10), last: null })
  })
})

describe('fakeEarningsCalendarFetcher — outage', () => {
  it('rejects the whole request when the outage key is set', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) } })
    process.env.WHEELBASE_MOCK_EARNINGS_UNREACHABLE = '1'

    await expect(
      fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })
    ).rejects.toThrow(/unreachable/)
  })
})

describe('fakeEarningsCalendarFetcher — malformed fixtures', () => {
  it('degrades unparseable JSON to no fixtures rather than throwing', async () => {
    process.env.WHEELBASE_MOCK_EARNINGS = 'not json'

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'read', next: null, last: null } })
  })

  it('treats an empty fixtures string as an armed but empty calendar', async () => {
    process.env.WHEELBASE_MOCK_EARNINGS = ''

    const result = await fakeEarningsCalendarFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'read', next: null, last: null } })
  })
})
