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
/** Every ticker the fake scraper was asked for, in order. An e2e spec cannot observe a
 *  fetch that *did not* happen any other way — `ivr_snapshot` stays empty whether the
 *  collector skipped the ticker or fetched it and got nothing back. */
let fetchLog: string[] = []

export function setFakeIvrOutcomes(next: Record<string, IVRResult>): void {
  outcomes = next
  // Programming outcomes is how a scenario starts, so it is also the reset point: a
  // spec asserting an empty log must not see the previous scenario's calls.
  fetchLog = []
}

export function readFakeIvrFetchLog(): string[] {
  return [...fetchLog]
}

export function setFakeIvrNow(next: string | null): void {
  if (next !== null && Number.isNaN(new Date(next).getTime())) {
    throw new Error('Fake IVR clock must be a valid ISO timestamp')
  }
  fakeNowIso = next
}

const fakeFetchIvr = async (ticker: string): Promise<IVRResult> => {
  const key = ticker.toUpperCase()
  fetchLog.push(key)
  return (
    outcomes[key] ?? {
      status: 'not_available',
      error: { code: 'TICKER_NOT_COVERED', message: `No fake IVR outcome programmed for ${key}` }
    }
  )
}

export function createFakeIvrCollaborators(): FakeIvrCollaborators {
  // Read once and narrow here: a separate boolean predicate could not tell the compiler
  // the value is a string, so the `?? '{}'` it would then need is a branch nothing can
  // reach once the guard has passed.
  const raw = process.env.WHEELBASE_FAKE_IVR
  if (raw === undefined) return {}

  // Through `setFakeIvrOutcomes` so a boot resets the fetch log too: both entry points
  // that (re)program outcomes start a fresh recording.
  try {
    setFakeIvrOutcomes(JSON.parse(raw) as Record<string, IVRResult>)
  } catch {
    setFakeIvrOutcomes({})
  }
  setFakeIvrNow(process.env.WHEELBASE_FAKE_NOW ?? null)

  return {
    fetchIvr: fakeFetchIvr,
    clock: {
      now: () => (fakeNowIso === null ? new Date() : new Date(fakeNowIso))
    }
  }
}
