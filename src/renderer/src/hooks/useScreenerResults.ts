import { useQuery } from '@tanstack/react-query'
import { type ApiError, type ScreenerResults, getScreenerResults } from '../api/screener'
import { screenerQueryKeys } from './screenerQueryKeys'

// No refetchInterval by design: a screener refresh is a deliberate user action
// via refetch(), never a background poll (see US-66 research ADR).
// [US-110] `enabled` lets the page mount both lenses while only the active one fetches.
export function useScreenerResults({ enabled = true }: { enabled?: boolean } = {}): ReturnType<
  typeof useQuery<ScreenerResults, ApiError>
> {
  return useQuery<ScreenerResults, ApiError>({
    queryKey: screenerQueryKeys.results,
    queryFn: getScreenerResults,
    enabled
  })
}
