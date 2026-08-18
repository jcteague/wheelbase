// [US-70] fake-earnings — the offline e2e seam for the earnings calendar. Its window
// filter is load-bearing: it is what makes the e2e lookahead-widening test a real
// regression test rather than a tautology, so it is unit-tested here rather than only
// exercised through Electron.
import { afterEach, describe, expect, it } from 'vitest'
import { addDays, format } from 'date-fns'
import { fakeEarningsFetcher } from './fake-earnings'

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

describe('fakeEarningsFetcher — arming', () => {
  it('returns null when neither env var is set, so production uses the live feed', () => {
    expect(fakeEarningsFetcher()).toBeNull()
  })

  it('returns a fetcher once the fixtures key is present, even when it is empty', () => {
    armFixtures({})
    expect(fakeEarningsFetcher()).not.toBeNull()
  })

  it('returns a fetcher when only the outage key is present', () => {
    process.env.WHEELBASE_MOCK_EARNINGS_UNREACHABLE = '1'
    expect(fakeEarningsFetcher()).not.toBeNull()
  })
})

describe('fakeEarningsFetcher — lookahead window', () => {
  it('serves a fixture inside the requested window as found', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(20) } })

    const result = await fakeEarningsFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'found', date: iso(20) } })
  })

  it('reads a fixture past the requested window as none, exactly as the live calendar would', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(37) } })

    const result = await fakeEarningsFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'none' } })
  })

  it('finds that same fixture once the lookahead is widened past it', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(37) } })

    const result = await fakeEarningsFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 50 })

    expect(result).toEqual({ NVDA: { status: 'found', date: iso(37) } })
  })

  it('treats a fixture landing exactly on the window bound as inside it', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(30) } })

    const result = await fakeEarningsFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'found', date: iso(30) } })
  })
})

describe('fakeEarningsFetcher — per-ticker states', () => {
  it('reads a ticker with no fixture as an empty calendar, not an unreadable one', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) } })

    const result = await fakeEarningsFetcher()!(['NVDA', 'KO'], { now: NOW, lookaheadDays: 30 })

    expect(result.KO).toEqual({ status: 'none' })
  })

  it('passes a per-ticker unavailable fixture through untouched', async () => {
    armFixtures({ ABC: { status: 'unavailable' } })

    const result = await fakeEarningsFetcher()!(['ABC'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ ABC: { status: 'unavailable' } })
  })

  it('returns an entry for every requested ticker', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) }, ABC: { status: 'unavailable' } })
    const tickers = ['NVDA', 'ABC', 'KO']

    const result = await fakeEarningsFetcher()!(tickers, { now: NOW, lookaheadDays: 30 })

    expect(Object.keys(result)).toHaveLength(tickers.length)
  })

  it('matches fixtures case-insensitively, as the live feed upper-cases its requests', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) } })

    const result = await fakeEarningsFetcher()!(['nvda'], { now: NOW, lookaheadDays: 30 })

    expect(result.nvda).toEqual({ status: 'found', date: iso(10) })
  })
})

describe('fakeEarningsFetcher — outage', () => {
  it('rejects the whole request when the outage key is set', async () => {
    armFixtures({ NVDA: { status: 'found', date: iso(10) } })
    process.env.WHEELBASE_MOCK_EARNINGS_UNREACHABLE = '1'

    await expect(fakeEarningsFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })).rejects.toThrow(
      /unreachable/
    )
  })
})

describe('fakeEarningsFetcher — malformed fixtures', () => {
  it('degrades unparseable JSON to no fixtures rather than throwing', async () => {
    process.env.WHEELBASE_MOCK_EARNINGS = 'not json'

    const result = await fakeEarningsFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'none' } })
  })

  it('treats an empty fixtures string as an armed but empty calendar', async () => {
    process.env.WHEELBASE_MOCK_EARNINGS = ''

    const result = await fakeEarningsFetcher()!(['NVDA'], { now: NOW, lookaheadDays: 30 })

    expect(result).toEqual({ NVDA: { status: 'none' } })
  })
})
