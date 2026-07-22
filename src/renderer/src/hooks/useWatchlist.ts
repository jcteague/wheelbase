import { useQuery } from '@tanstack/react-query'
import { type ApiError, type WatchlistEntry, listWatchlist } from '../api/watchlist'
import { watchlistQueryKeys } from './watchlistQueryKeys'

export function useWatchlist(): ReturnType<typeof useQuery<WatchlistEntry[], ApiError>> {
  return useQuery<WatchlistEntry[], ApiError>({
    queryKey: watchlistQueryKeys.all,
    queryFn: listWatchlist
  })
}
