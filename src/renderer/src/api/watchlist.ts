// Adapter between the renderer and the watchlist IPC preload layer.

import { type ApiError, throwMappedIpcErrors } from './error'
import type { ScreenerIvRank } from './screener'

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

/** What the entry form submits, for both add and update. Every field is required so a
 *  caller cannot accidentally patch: an edit replaces the entry's editable half outright,
 *  and a cleared value has to arrive as an explicit `null` rather than as an omission. */
export type WatchlistEntryPayload = {
  ticker: string
  notes: string | null
  ownBelowPrice: number | null
  ivrTrigger: number | null
  postEarningsOnly: boolean
  coreHolding: boolean
}

export async function addWatchlistEntry(payload: WatchlistEntryPayload): Promise<WatchlistEntry> {
  const result = await window.api.watchlist.add(payload)
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return result.entry
}

export async function updateWatchlistEntry(
  payload: WatchlistEntryPayload
): Promise<WatchlistEntry> {
  const result = await window.api.watchlist.update(payload)
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

// [US-96] One live bench. Field-for-field mirrors of the `IpcWatchlistSnapshot*` types in
// `src/preload/index.d.ts`; `ScreenerIvRank` already mirrors `IpcIvRank`, so the snapshot
// reuses it rather than declaring a second copy of the same reading.

export type SnapshotQuote = {
  price: string // 2dp decimal string from the provider
  prevClose: string | null
  timestamp: string // ISO
}

/** One entry condition's verdict. `unknown` is never a pass: a missing quote or an
 *  untrustworthy reading refuses to decide rather than clearing the stock. */
export type Gate = {
  verdict: 'met' | 'unmet' | 'unknown' | 'none'
  label: string | null // reason text for unmet/unknown; null otherwise
}

export type EntryVerdict = {
  price: Gate
  iv: Gate
  earnings: Gate
}

export type EarningsDisplay =
  | { kind: 'date'; date: string; daysUntil: number; withinWindow: boolean } // 'YYYY-MM-DD'
  | { kind: 'unknown' }

export type WatchlistSnapshotRow = {
  entry: WatchlistEntry
  quote: SnapshotQuote | null // null → the quote fetch failed for this ticker
  ivRank: ScreenerIvRank | null // null → never collected or unreadable
  earnings: EarningsDisplay
  verdict: EntryVerdict
}

export type WatchlistSnapshot = {
  rows: WatchlistSnapshotRow[] // watchlist order (added_at DESC)
  asOf: string // ISO request clock the verdicts were computed at
}

// Every expected failure — a dead provider, one bad ticker, an unreadable calendar — is
// modelled inside the payload, so an ok:false envelope only ever means something
// unexpected and belongs on the error path rather than in a half-built bench.
export async function getWatchlistSnapshot(): Promise<WatchlistSnapshot> {
  const result = await window.api.watchlist.snapshot()
  if (!result.ok) {
    throwMappedIpcErrors(result.errors)
  }
  return { rows: result.rows, asOf: result.asOf }
}
