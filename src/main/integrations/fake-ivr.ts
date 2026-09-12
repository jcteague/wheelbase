// Test-only seam for the IVR collector.
//
// In production the `ivr-collect` job handler calls the live Barchart scraper. To
// keep e2e runs offline and deterministic, the main process injects these fake
// collaborators into `collectIVRSnapshots` whenever WHEELBASE_FAKE_IVR is present.
// Per-ticker outcomes (and the trading-day "now") are programmed at runtime via the
// dev-only `_test:ivr-*` IPC channels. When the env var is absent — i.e. production —
// `createFakeIvrCollaborators()` returns `{}` and the real scraper is used unchanged.
import type { IVRResult } from './barchart-ivr-scraper'

type Clock = {
  now(): Date
}

type FakeIvrCollaborators = {
  fetchIvr?: (ticker: string) => Promise<IVRResult>
  clock?: Clock
}

let outcomes: Record<string, IVRResult> = {}
let fakeNowIso: string | null = null

export function isFakeIvrEnabled(): boolean {
  return process.env.WHEELBASE_FAKE_IVR != null
}

export function setFakeIvrOutcomes(next: Record<string, IVRResult>): void {
  outcomes = next
}

export function setFakeIvrNow(next: string | null): void {
  if (next !== null && Number.isNaN(new Date(next).getTime())) {
    throw new Error('Fake IVR clock must be a valid ISO timestamp')
  }
  fakeNowIso = next
}

const fakeFetchIvr = async (ticker: string): Promise<IVRResult> => {
  const key = ticker.toUpperCase()
  return (
    outcomes[key] ?? {
      status: 'not_available',
      error: { code: 'TICKER_NOT_COVERED', message: `No fake IVR outcome programmed for ${key}` }
    }
  )
}

export function createFakeIvrCollaborators(): FakeIvrCollaborators {
  if (!isFakeIvrEnabled()) return {}

  try {
    outcomes = JSON.parse(process.env.WHEELBASE_FAKE_IVR ?? '{}') as Record<string, IVRResult>
  } catch {
    outcomes = {}
  }
  setFakeIvrNow(process.env.WHEELBASE_FAKE_NOW ?? null)

  return {
    fetchIvr: fakeFetchIvr,
    clock: {
      now: () => (fakeNowIso === null ? new Date() : new Date(fakeNowIso))
    }
  }
}
