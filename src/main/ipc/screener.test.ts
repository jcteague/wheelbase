// [US-65] screener:results IPC — the delivery surface US-66 consumes. The handler is
// thin by contract: no payload, no branching, one service call wrapped in the envelope.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import {
  DEFAULT_SCREENING_CRITERIA,
  type CandidateEarnings,
  type ScoredCandidate
} from '../core/screener'
import type { ScreenerExclusion, ScreenerResults } from '../services/screener'
import { makeTestDb } from '../test-utils'

const screenWatchlistCandidates = vi.fn()

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('../services/screener', () => ({
  screenWatchlistCandidates
}))

type IpcHandler = (...args: unknown[]) => unknown

const db = {} as Database.Database
const provider = {} as MarketDataProvider

function getProvider(): MarketDataProvider {
  return provider
}

/** Registers the module and hands back one channel's handler. `registerScreenerIpc`
 *  still takes only `{ db, getProvider }` — the criteria channels ride the same seam. */
async function registerAndGetHandler(
  channel: string,
  database: Database.Database = db
): Promise<IpcHandler> {
  const { ipcMain } = await import('electron')
  const { registerScreenerIpc } = await import('./screener')
  registerScreenerIpc({ db: database, getProvider })

  const calls = vi.mocked(ipcMain.handle).mock.calls as Array<[string, IpcHandler]>
  const entry = calls.find(([name]) => name === channel)
  if (!entry) throw new Error(`${channel} handler was not registered`)
  return entry[1]
}

const SAMPLE_CANDIDATE: ScoredCandidate = {
  ticker: 'AAPL',
  contractId: 'AAPL260821P00180000',
  strike: '180.0000',
  expiration: '2026-08-21',
  dte: 37,
  bid: '2.65',
  ask: '2.75',
  mark: '2.70',
  spreadAbsolute: '0.10',
  spreadPercent: '3.70',
  delta: '0.2800',
  openInterest: 1200,
  volume: 340,
  ivRank: { value: '44.0', observedAt: '2026-07-15T20:00:00.000Z' },
  capitalSecured: '18000.00',
  periodYield: '0.0150',
  annualizedYield: '0.1480',
  yieldPerDelta: '0.5285',
  earnings: { status: 'clear' },
  timestamp: '2026-07-15T19:59:00.000Z'
}

// [US-70] Each ranked candidate carries a structured earnings verdict, so the
// transport has to be exercised with more than the `clear` case.
function candidateWith(ticker: string, earnings: CandidateEarnings): ScoredCandidate {
  return { ...SAMPLE_CANDIDATE, ticker, earnings }
}

const SAMPLE_EXCLUSION: ScreenerExclusion = {
  ticker: 'TSLA',
  code: 'spread',
  reason: 'spread 22.23% exceeds 10%'
}

const SAMPLE_RESULTS: ScreenerResults = {
  status: 'ok',
  ranked: [SAMPLE_CANDIDATE],
  excluded: [SAMPLE_EXCLUSION],
  quoteTimestamp: '2026-07-15T19:59:00.000Z'
}

const OUTAGE_RESULTS: ScreenerResults = {
  status: 'provider_unavailable',
  ranked: [],
  excluded: [],
  quoteTimestamp: null
}

describe('registerScreenerIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('screener:results returns { ok: true, status, ranked, excluded, quoteTimestamp }', async () => {
    screenWatchlistCandidates.mockResolvedValue(SAMPLE_RESULTS)

    const handler = await registerAndGetHandler('screener:results')
    const result = await handler(null)

    expect(result).toEqual({ ok: true, ...SAMPLE_RESULTS })
  })

  it('screener:results takes no payload and passes getProvider + db straight through', async () => {
    screenWatchlistCandidates.mockResolvedValue(SAMPLE_RESULTS)

    const handler = await registerAndGetHandler('screener:results')
    await handler(null)

    expect(screenWatchlistCandidates).toHaveBeenCalledTimes(1)
    // The thunk itself goes through — the service resolves it, so an unconfigured
    // provider surfaces as the modelled provider_unavailable state.
    expect(screenWatchlistCandidates).toHaveBeenCalledWith(getProvider, db)
  })

  it('screener:results forwards a provider_unavailable screen unchanged', async () => {
    screenWatchlistCandidates.mockResolvedValue(OUTAGE_RESULTS)

    const handler = await registerAndGetHandler('screener:results')
    const result = await handler(null)

    expect(result).toEqual({ ok: true, ...OUTAGE_RESULTS })
  })

  // [US-70] `earningsFlagged` is gone, not deprecated alongside `earnings` — the
  // renderer reads the verdict object and nothing else.
  it('screener:results carries the structured earnings verdict on every ranked candidate', async () => {
    const ranked = [
      candidateWith('AAPL', { status: 'clear' }),
      candidateWith('MSFT', { status: 'flagged', date: '2026-08-07', daysBeforeExpiry: 14 }),
      candidateWith('KO', { status: 'unknown' }),
      candidateWith('SOFI', { status: 'unavailable' })
    ]
    screenWatchlistCandidates.mockResolvedValue({ ...SAMPLE_RESULTS, ranked })

    const handler = await registerAndGetHandler('screener:results')
    const result = (await handler(null)) as { ranked: ScoredCandidate[] }

    expect(result.ranked.map((candidate) => candidate.earnings)).toEqual([
      { status: 'clear' },
      { status: 'flagged', date: '2026-08-07', daysBeforeExpiry: 14 },
      { status: 'unknown' },
      { status: 'unavailable' }
    ])
    result.ranked.forEach((candidate) => {
      expect(candidate).not.toHaveProperty('earningsFlagged')
    })
  })

  it('screener:results maps a service throw to { ok: false, errors } without rejecting', async () => {
    screenWatchlistCandidates.mockRejectedValue(new Error('SQLITE_BUSY'))

    const handler = await registerAndGetHandler('screener:results')
    const result = await handler(null)

    expect(result).toEqual({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })
  })
})

// [US-67] screener:get-criteria / screener:save-criteria — the transport for the
// criteria sheet. Both handlers are thin (Zod parse + one service call inside
// handleIpcCall), so these tests run the real persistence service against a real
// in-memory DB and assert only the envelope the renderer sees.
// Contracts: plans/us-67/contracts/screener-get-criteria.md, screener-save-criteria.md
describe('registerScreenerIpc — screening criteria', () => {
  let criteriaDb: Database.Database

  beforeEach(() => {
    vi.clearAllMocks()
    criteriaDb = makeTestDb()
  })

  afterEach(() => {
    if (criteriaDb.open) criteriaDb.close()
  })

  /** The save payload from `contracts/screener-save-criteria.md` — the full criteria
   *  minus `maxSpreadAbsolute`, which the service supplies from the defaults. */
  function savePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      deltaMin: '0.15',
      deltaMax: '0.20',
      dteMin: 40,
      dteMax: 45,
      minOpenInterest: 750,
      maxSpreadPercent: '8',
      maxUnderlyingPrice: '75',
      minIvRank: '30',
      earningsHandling: 'flag',
      ...overrides
    }
  }

  async function readCriteria(): Promise<unknown> {
    const handler = await registerAndGetHandler('screener:get-criteria', criteriaDb)
    return handler(null, undefined)
  }

  it('screener:get-criteria returns { ok: true, criteria } with the shipped defaults on a fresh DB', async () => {
    const handler = await registerAndGetHandler('screener:get-criteria', criteriaDb)

    const result = await handler(null, undefined)

    expect(result).toEqual({ ok: true, criteria: DEFAULT_SCREENING_CRITERIA })
  })

  it('screener:save-criteria returns { ok: true, criteria } reflecting the saved values', async () => {
    const handler = await registerAndGetHandler('screener:save-criteria', criteriaDb)

    const result = await handler(null, savePayload())

    expect(result).toEqual({
      ok: true,
      criteria: {
        deltaMin: '0.15',
        deltaMax: '0.20',
        dteMin: 40,
        dteMax: 45,
        minOpenInterest: 750,
        maxSpreadPercent: '8',
        // Not in the payload — the service fills it from the shipped defaults.
        maxSpreadAbsolute: DEFAULT_SCREENING_CRITERIA.maxSpreadAbsolute,
        maxUnderlyingPrice: '75',
        minIvRank: '30',
        earningsHandling: 'flag'
      }
    })
  })

  it('screener:save-criteria persists the saved criteria for the next read', async () => {
    const save = await registerAndGetHandler('screener:save-criteria', criteriaDb)
    await save(null, savePayload())

    expect(await readCriteria()).toMatchObject({
      ok: true,
      criteria: { deltaMin: '0.15', deltaMax: '0.20', dteMin: 40, dteMax: 45 }
    })
  })

  it('screener:save-criteria rejects an inverted delta band with code inverted_band on deltaMax', async () => {
    const handler = await registerAndGetHandler('screener:save-criteria', criteriaDb)

    const result = await handler(null, savePayload({ deltaMin: '0.30', deltaMax: '0.20' }))

    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'deltaMax',
          code: 'inverted_band',
          message: 'Minimum delta must be less than maximum delta'
        }
      ]
    })
  })

  it('screener:save-criteria rejects an out-of-range deltaMax at the boundary, before the service runs', async () => {
    const handler = await registerAndGetHandler('screener:save-criteria', criteriaDb)

    const result = await handler(null, savePayload({ deltaMax: '1.5' }))

    expect(result).toMatchObject({
      ok: false,
      errors: [
        expect.objectContaining({
          field: 'deltaMax',
          message: 'Delta must be between 0.01 and 0.99'
        })
      ]
    })
    // Nothing reached the service, so nothing was written.
    expect(await readCriteria()).toEqual({ ok: true, criteria: DEFAULT_SCREENING_CRITERIA })
  })

  it('screener:save-criteria returns ok:false for a payload missing earningsHandling instead of throwing', async () => {
    const handler = await registerAndGetHandler('screener:save-criteria', criteriaDb)
    const withoutEarnings = savePayload()
    delete withoutEarnings.earningsHandling

    const result = await handler(null, withoutEarnings)

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'earningsHandling' })]
    })
    expect(await readCriteria()).toEqual({ ok: true, criteria: DEFAULT_SCREENING_CRITERIA })
  })

  it('screener:get-criteria maps an internal failure to __root__ / internal_error without rejecting', async () => {
    const handler = await registerAndGetHandler('screener:get-criteria', criteriaDb)
    criteriaDb.close()

    await expect(handler(null, undefined)).resolves.toEqual({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })
  })

  it('screener:save-criteria maps an internal failure to __root__ / internal_error without rejecting', async () => {
    const handler = await registerAndGetHandler('screener:save-criteria', criteriaDb)
    criteriaDb.close()

    await expect(handler(null, savePayload())).resolves.toEqual({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })
  })
})
