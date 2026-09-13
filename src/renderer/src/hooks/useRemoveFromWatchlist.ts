import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ApiError, removeWatchlistEntry } from '../api/watchlist'
import { screenerQueryKeys } from './screenerQueryKeys'
import { watchlistQueryKeys } from './watchlistQueryKeys'

export function useRemoveFromWatchlist(): ReturnType<typeof useMutation<void, ApiError, string>> {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: removeWatchlistEntry,
    // [US-96] Removing a stock changes the bench on both sides: the snapshot has to drop the
    // row rather than leave a ghost, and the screener has to re-run so the ticker stops
    // occupying a slot. `all` is a prefix of `snapshot`, so that one is already covered —
    // it is named anyway so the bench's dependency is visible at the call site.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.snapshot })
      queryClient.invalidateQueries({ queryKey: screenerQueryKeys.results })
    }
  })
}
