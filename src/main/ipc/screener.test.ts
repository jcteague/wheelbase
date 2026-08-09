// [US-65] screener:results IPC — the delivery surface US-66 consumes. The handler is
// thin by contract: no payload, no branching, one service call wrapped in the envelope.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import type { ScoredCandidate } from '../core/screener'
import type { ScreenerExclusion, ScreenerResults } from '../services/screener'

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

/** Registers the module and hands back its only channel's handler. */
async function registerAndGetHandler(): Promise<IpcHandler> {
  const { ipcMain } = await import('electron')
  const { registerScreenerIpc } = await import('./screener')
  registerScreenerIpc({ db, getProvider })

  const calls = vi.mocked(ipcMain.handle).mock.calls as Array<[string, IpcHandler]>
  const entry = calls.find(([channel]) => channel === 'screener:results')
  if (!entry) throw new Error('screener:results handler was not registered')
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
  earningsFlagged: false,
  timestamp: '2026-07-15T19:59:00.000Z'
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

    const handler = await registerAndGetHandler()
    const result = await handler(null)

    expect(result).toEqual({ ok: true, ...SAMPLE_RESULTS })
  })

  it('screener:results takes no payload and passes getProvider + db straight through', async () => {
    screenWatchlistCandidates.mockResolvedValue(SAMPLE_RESULTS)

    const handler = await registerAndGetHandler()
    await handler(null)

    expect(screenWatchlistCandidates).toHaveBeenCalledTimes(1)
    // The thunk itself goes through — the service resolves it, so an unconfigured
    // provider surfaces as the modelled provider_unavailable state.
    expect(screenWatchlistCandidates).toHaveBeenCalledWith(getProvider, db)
  })

  it('screener:results forwards a provider_unavailable screen unchanged', async () => {
    screenWatchlistCandidates.mockResolvedValue(OUTAGE_RESULTS)

    const handler = await registerAndGetHandler()
    const result = await handler(null)

    expect(result).toEqual({ ok: true, ...OUTAGE_RESULTS })
  })

  it('screener:results maps a service throw to { ok: false, errors } without rejecting', async () => {
    screenWatchlistCandidates.mockRejectedValue(new Error('SQLITE_BUSY'))

    const handler = await registerAndGetHandler()
    const result = await handler(null)

    expect(result).toEqual({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })
  })
})
