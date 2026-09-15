import type { UseMutationResult } from '@tanstack/react-query'
import { type ApiError, removeWatchlistEntry } from '../api/watchlist'
import { useBenchMutation } from './useBenchMutation'

/** [US-96] Removing a stock changes the bench on both sides: the snapshot has to drop the
 *  row rather than leave a ghost, and the screener has to re-run so the ticker stops
 *  occupying a slot. */
export function useRemoveFromWatchlist(): UseMutationResult<void, ApiError, string> {
  return useBenchMutation(removeWatchlistEntry)
}
