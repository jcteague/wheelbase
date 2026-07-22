import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { ValidationError } from '../core/lifecycle'
import type { WatchlistEntryRecord } from '../schemas'

const listWatchlist = vi.fn()
const addWatchlistEntry = vi.fn()
const removeWatchlistEntry = vi.fn()

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

describe('registerWatchlistIpc', () => {
  let db: Database.Database

  beforeEach(() => {
    vi.clearAllMocks()
    listWatchlist.mockReset()
    addWatchlistEntry.mockReset()
    removeWatchlistEntry.mockReset()
    db = {} as Database.Database
  })

  async function register(): Promise<Array<[string, (...args: unknown[]) => unknown]>> {
    const { ipcMain } = await import('electron')
    const { registerWatchlistIpc } = await import('./watchlist')
    registerWatchlistIpc({ db })
    return vi.mocked(ipcMain.handle).mock.calls as Array<[string, (...args: unknown[]) => unknown]>
  }

  it('watchlist:list returns { ok: true, entries } from listWatchlist', async () => {
    listWatchlist.mockReturnValue([SAMPLE_ENTRY])

    const handler = getRegisteredHandler(await register(), 'watchlist:list')
    const result = await handler?.(null)

    expect(listWatchlist).toHaveBeenCalledWith(db)
    expect(result).toMatchObject({ ok: true, entries: [SAMPLE_ENTRY] })
  })

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

  it('watchlist:remove parses { ticker } and returns { ok: true, ticker }', async () => {
    removeWatchlistEntry.mockReturnValue(undefined)

    const handler = getRegisteredHandler(await register(), 'watchlist:remove')
    const result = await handler?.(null, { ticker: 'aapl' })

    expect(removeWatchlistEntry).toHaveBeenCalledWith(db, 'AAPL')
    expect(result).toMatchObject({ ok: true, ticker: 'AAPL' })
  })
})
