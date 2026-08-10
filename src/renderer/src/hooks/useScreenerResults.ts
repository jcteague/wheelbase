import { useQuery } from '@tanstack/react-query'
import { type ApiError, type ScreenerResults, getScreenerResults } from '../api/screener'
import { screenerQueryKeys } from './screenerQueryKeys'

// No refetchInterval by design: a screener refresh is a deliberate user action
// via refetch(), never a background poll (see US-66 research ADR).
export function useScreenerResults(): ReturnType<typeof useQuery<ScreenerResults, ApiError>> {
  return useQuery<ScreenerResults, ApiError>({
    queryKey: screenerQueryKeys.results,
    queryFn: getScreenerResults
  })
}
