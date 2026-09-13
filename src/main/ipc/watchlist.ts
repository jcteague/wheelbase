import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { addWatchlistEntry, removeWatchlistEntry } from '../services/watchlist'
import { buildWatchlistSnapshot } from '../services/watchlist-snapshot'
import { WatchlistAddPayloadSchema, WatchlistRemovePayloadSchema } from '../schemas'
import { handleIpcCall } from './utils'

export function registerWatchlistIpc({
  db,
  getProvider,
  getCurrentDate = () => new Date()
}: {
  db: Database.Database
  getProvider: () => MarketDataProvider
  getCurrentDate?: () => Date
}): void {
  // [US-96] No payload — every expected failure (provider unconfigured, a single quote,
  // the earnings or IVR read) is modelled inside the success payload, so the envelope's
  // error row only ever carries something genuinely unexpected.
  // See plans/us-96/contracts/watchlist-snapshot.md.
  ipcMain.handle('watchlist:snapshot', () =>
    handleIpcCall('watchlist_snapshot_error', () =>
      buildWatchlistSnapshot(getProvider, db, { currentDate: getCurrentDate() })
    )
  )

  ipcMain.handle('watchlist:add', (_, payload: unknown) =>
    handleIpcCall('watchlist_add_error', () => ({
      entry: addWatchlistEntry(db, WatchlistAddPayloadSchema.parse(payload))
    }))
  )

  ipcMain.handle('watchlist:remove', (_, payload: unknown) =>
    handleIpcCall('watchlist_remove_error', () => {
      const { ticker } = WatchlistRemovePayloadSchema.parse(payload)
      removeWatchlistEntry(db, ticker)
      return { ticker }
    })
  )
}
