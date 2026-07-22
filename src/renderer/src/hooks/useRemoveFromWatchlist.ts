import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ApiError, removeWatchlistEntry } from '../api/watchlist'
import { watchlistQueryKeys } from './watchlistQueryKeys'

export function useRemoveFromWatchlist(): ReturnType<typeof useMutation<void, ApiError, string>> {
  const queryClient = useQueryClient()

  return useMutation<void, ApiError, string>({
    mutationFn: removeWatchlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.all })
    }
  })
}
