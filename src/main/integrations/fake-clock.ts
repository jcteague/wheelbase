// Test-only clock shared by every consumer that must agree on "now" in an e2e run: the
// IV-history collector, the on-demand path, the watchlist snapshot and the screener.
//
// Enabled by WHEELBASE_FAKE_NOW and moved at runtime through the dev-only `_test:ivr-set-now`
// channel. When the env var is absent — i.e. production — `createFakeClock()` returns
// `undefined` and every consumer falls back to the wall clock.

import type { Clock } from '../dates'

let fakeNowIso: string | null = null

export function setFakeNow(next: string | null): void {
  if (next !== null && Number.isNaN(new Date(next).getTime())) {
    throw new Error('Fake clock must be a valid ISO timestamp')
  }
  fakeNowIso = next
}

export function createFakeClock(): Clock | undefined {
  const raw = process.env.WHEELBASE_FAKE_NOW
  if (raw === undefined) return undefined

  setFakeNow(raw)
  return {
    now: () => (fakeNowIso === null ? new Date() : new Date(fakeNowIso))
  }
}
