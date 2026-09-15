import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ApiError } from '../api/watchlist'
import { screenerQueryKeys } from './screenerQueryKeys'
import { watchlistQueryKeys } from './watchlistQueryKeys'

/**
 * A write that changes the bench, and so has to invalidate both halves of it.
 *
 * The watchlist and the screener answer halves of one question (US-96), and every entry
 * write — add, remove, edit — can change both answers: the snapshot has to re-quote and
 * re-judge, and the screener has to re-run so the ticker gains, keeps or loses its rank.
 * `all` is a prefix of `snapshot`, so that key is already covered; it is named anyway so
 * the dependency is visible rather than inferred from key ordering.
 */
export function useBenchMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  /** Runs before the invalidations, for a write whose own result can already answer part
   *  of what the refetch will confirm. The invalidations are not awaited, so without this
   *  the panel is re-rendered from the pre-write cache for as long as the round trip takes. */
  seedCache?: (data: TData) => void
): UseMutationResult<TData, ApiError, TVariables> {
  const queryClient = useQueryClient()

  return useMutation<TData, ApiError, TVariables>({
    mutationFn,
    onSuccess: (data) => {
      seedCache?.(data)
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.all })
      queryClient.invalidateQueries({ queryKey: watchlistQueryKeys.snapshot })
      queryClient.invalidateQueries({ queryKey: screenerQueryKeys.results })
    }
  })
}
