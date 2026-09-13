import { useQuery } from '@tanstack/react-query'
import { type ApiError, type WatchlistSnapshot, getWatchlistSnapshot } from '../api/watchlist'
import { watchlistQueryKeys } from './watchlistQueryKeys'

// [US-96] No refetchInterval: the bench is not a ticker tape. Coming back to the window
// is when a trader wants the day's prices and verdicts re-read, so that is when it refetches.
export function useWatchlistSnapshot(): ReturnType<typeof useQuery<WatchlistSnapshot, ApiError>> {
  return useQuery<WatchlistSnapshot, ApiError>({
    queryKey: watchlistQueryKeys.snapshot,
    queryFn: getWatchlistSnapshot,
    refetchOnWindowFocus: true
  })
}
