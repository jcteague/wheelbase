import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ValidationError } from '../core/lifecycle'
import type { WatchlistEntryRecord } from '../schemas'
import type { MarketDataProvider } from '../integrations/market-data-provider'

const listWatchlist = vi.fn()
const addWatchlistEntry = vi.fn()
const removeWatchlistEntry = vi.fn()
const buildWatchlistSnapshot = vi.fn()

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() }
}))

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('../services/watchlist', () => ({
  listWatchlist,
  addWatchlistEntry,
  removeWatchlistEntry
}))

vi.mock('../services/watchlist-snapshot', () => ({ buildWatchlistSnapshot }))

function getRegisteredHandler(
  calls: Array<[string, (...args: unknown[]) => unknown]>,
  channel: string
): ((...args: unknown[]) => unknown) | undefined {
  return calls.find(([ch]) => ch === channel)?.[1]
}

const SAMPLE_ENTRY: WatchlistEntryRecord = {
  ticker: 'AAPL',
  notes: null,
  ownBelowPrice: null,
  ivrTrigger: null,
  postEarningsOnly: false,
  coreHolding: false,
  addedAt: '2026-07-19T12:00:00.000Z'
}

// [US-96] The snapshot channel reads the clock the screener channel reads, so the two
// halves of the bench are judged at the same instant.
const CURRENT_DATE = new Date('2026-07-23T15:30:00Z')
const SAMPLE_SNAPSHOT = {
  rows: [{ entry: SAMPLE_ENTRY, quote: null, ivRank: null, earnings: { kind: 'unknown' } }],
  asOf: CURRENT_DATE.toISOString()
}

describe('registerWatchlistIpc', () => {
  let db: Database.Database
  let provider: MarketDataProvider
  let getProvider: () => MarketDataProvider

  beforeEach(() => {
    vi.clearAllMocks()
    listWatchlist.mockReset()
    addWatchlistEntry.mockReset()
    removeWatchlistEntry.mockReset()
    buildWatchlistSnapshot.mockReset()
    db = {} as Database.Database
    provider = {} as MarketDataProvider
    getProvider = vi.fn(() => provider)
  })

  async function register(): Promise<Array<[string, (...args: unknown[]) => unknown]>> {
    const { ipcMain } = await import('electron')
    const { registerWatchlistIpc } = await import('./watchlist')
    registerWatchlistIpc({ db, getProvider, getCurrentDate: () => CURRENT_DATE })
    return vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>
  }

  it('watchlist:add parses the payload and returns { ok: true, entry }', async () => {
    addWatchlistEntry.mockReturnValue(SAMPLE_ENTRY)

    const handler = getRegisteredHandler(await register(), 'watchlist:add')
    const result = await handler?.(null, { ticker: 'aapl' })

    expect(addWatchlistEntry).toHaveBeenCalledWith(db, expect.objectContaining({ ticker: 'AAPL' }))
    expect(result).toMatchObject({ ok: true, entry: SAMPLE_ENTRY })
  })

  it('watchlist:add maps a service ValidationError to { ok: false, errors }', async () => {
    addWatchlistEntry.mockImplementation(() => {
      throw new ValidationError('ticker', 'duplicate', 'AAPL is already on the watchlist')
    })

    const handler = getRegisteredHandler(await register(), 'watchlist:add')
    const result = await handler?.(null, { ticker: 'AAPL' })

    expect(result).toMatchObject({
      ok: false,
      errors: [{ field: 'ticker', code: 'duplicate', message: 'AAPL is already on the watchlist' }]
    })
  })

  it('watchlist:add maps a ZodError (bad payload) to { ok: false, errors }', async () => {
    const handler = getRegisteredHandler(await register(), 'watchlist:add')
    const result = await handler?.(null, { ticker: '12345' })

    expect(addWatchlistEntry).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: 'ticker' })]
    })
  })

  it('watchlist:snapshot returns { ok: true, rows, asOf } from the service', async () => {
    buildWatchlistSnapshot.mockResolvedValue(SAMPLE_SNAPSHOT)

    const handler = getRegisteredHandler(await register(), 'watchlist:snapshot')
    const result = await handler?.(null)

    expect(buildWatchlistSnapshot).toHaveBeenCalledWith(getProvider, db, {
      currentDate: CURRENT_DATE
    })
    expect(result).toMatchObject({ ok: true, ...SAMPLE_SNAPSHOT })
  })

  it('watchlist:snapshot maps an unexpected service failure to an internal_error envelope', async () => {
    buildWatchlistSnapshot.mockRejectedValue(new Error('boom'))

    const handler = getRegisteredHandler(await register(), 'watchlist:snapshot')
    const result = await handler?.(null)

    expect(result).toMatchObject({
      ok: false,
      errors: [expect.objectContaining({ field: '__root__', code: 'internal_error' })]
    })
  })

  // Production registers no clock — only the e2e fake-IVR seam does — so the default is
  // what actually runs, and a snapshot stamped from the wrong instant would age every IV
  // reading against it.
  it('stamps the snapshot from the wall clock when no clock is injected', async () => {
    buildWatchlistSnapshot.mockResolvedValue(SAMPLE_SNAPSHOT)
    const { ipcMain } = await import('electron')
    const { registerWatchlistIpc } = await import('./watchlist')
    registerWatchlistIpc({ db, getProvider })
    const calls = vi.mocked(ipcMain.handle).mock.calls as Array<
      [string, (...args: unknown[]) => unknown]
    >

    const before = Date.now()
    await getRegisteredHandler(calls, 'watchlist:snapshot')?.(null)

    const { currentDate } = buildWatchlistSnapshot.mock.calls[0][2] as { currentDate: Date }
    expect(currentDate.getTime()).toBeGreaterThanOrEqual(before)
    expect(currentDate.getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('watchlist:remove parses { ticker } and returns { ok: true, ticker }', async () => {
    removeWatchlistEntry.mockReturnValue(undefined)

    const handler = getRegisteredHandler(await register(), 'watchlist:remove')
    const result = await handler?.(null, { ticker: 'aapl' })

    expect(removeWatchlistEntry).toHaveBeenCalledWith(db, 'AAPL')
    expect(result).toMatchObject({ ok: true, ticker: 'AAPL' })
  })
})
