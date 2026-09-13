import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type AddWatchlistPayload,
  type ApiError,
  type WatchlistEntry,
  addWatchlistEntry
} from '../api/watchlist'
import { screenerQueryKeys } from './screenerQueryKeys'
import { watchlistQueryKeys } from './watchlistQueryKeys'

export function useAddToWatchlist(): ReturnType<
  typeof useMutation<WatchlistEntry, ApiError, AddWatchlistPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<WatchlistEntry, ApiError, AddWatchlistPayload>({
    mutationFn: addWatchlistEntry,
    // [US-96] Adding a stock changes the bench on both sides: the snapshot has to quote and
    // judge the new ticker, and the screener has to re-run so it can rank. `all` is a prefix
    // of `snapshot`, so that one is already covered — it is named anyway so the bench's
    // dependency is visible at the call site.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.snapshot })
      queryClient.invalidateQueries({ queryKey: screenerQueryKeys.results })
    }
  })
}
