import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { addWatchlistEntry, listWatchlist, removeWatchlistEntry } from '../services/watchlist'
import { WatchlistAddPayloadSchema, WatchlistRemovePayloadSchema } from '../schemas'
import { handleIpcCall } from './utils'

export function registerWatchlistIpc({ db }: { db: Database.Database }): void {
  ipcMain.handle('watchlist:list', () =>
    handleIpcCall('watchlist_list_error', () => ({ entries: listWatchlist(db) }))
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
