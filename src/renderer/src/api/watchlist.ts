// Adapter between the renderer and the watchlist IPC preload layer.

import { type ApiError, throwMappedIpcErrors } from './error'

export type { ApiError }

export type WatchlistEntry = {
  ticker: string
  notes: string | null
  ownBelowPrice: string | null
  ivrTrigger: number | null
  postEarningsOnly: boolean
  coreHolding: boolean
  addedAt: string
}

export type AddWatchlistPayload = {
  ticker: string
  notes?: string
  ownBelowPrice?: number | null
  ivrTrigger?: number | null
  postEarningsOnly?: boolean
  coreHolding?: boolean
}

export async function listWatchlist(): Promise<WatchlistEntry[]> {
  const result = await window.api.watchlist.list()
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result.entries
}

export async function addWatchlistEntry(payload: AddWatchlistPayload): Promise<WatchlistEntry> {
  const result = await window.api.watchlist.add(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result.entry
}

export async function removeWatchlistEntry(ticker: string): Promise<void> {
  const result = await window.api.watchlist.remove({ ticker })
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
}
