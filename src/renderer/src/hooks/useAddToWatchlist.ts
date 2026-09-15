import type { UseMutationResult } from '@tanstack/react-query'
import {
  type ApiError,
  type WatchlistEntry,
  type WatchlistEntryPayload,
  addWatchlistEntry
} from '../api/watchlist'
import { useBenchMutation } from './useBenchMutation'

/** [US-96] Adding a stock changes the bench on both sides: the snapshot has to quote and
 *  judge the new ticker, and the screener has to re-run so it can rank. */
export function useAddToWatchlist(): UseMutationResult<
  WatchlistEntry,
  ApiError,
  WatchlistEntryPayload
> {
  return useBenchMutation(addWatchlistEntry)
}
