import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  type AddWatchlistPayload,
  type ApiError,
  type WatchlistEntry,
  addWatchlistEntry
} from '../api/watchlist'
import { watchlistQueryKeys } from './watchlistQueryKeys'

export function useAddToWatchlist(): ReturnType<
  typeof useMutation<WatchlistEntry, ApiError, AddWatchlistPayload>
> {
  const queryClient = useQueryClient()

  return useMutation<WatchlistEntry, ApiError, AddWatchlistPayload>({
    mutationFn: addWatchlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.all })
    }
  })
}
