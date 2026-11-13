import { useQuery } from '@tanstack/react-query'
import {
  type ApiError,
  type PmccScreenerResults,
  getPmccScreenerResults
} from '../api/pmcc-screener'
import { screenerQueryKeys } from './screenerQueryKeys'

// No refetchInterval, as for the wheel: a screen is a deliberate user action.
// `enabled` lets the page mount both lenses while only the active one fetches.
export function usePmccScreenerResults({ enabled = true }: { enabled?: boolean } = {}): ReturnType<
  typeof useQuery<PmccScreenerResults, ApiError>
> {
  return useQuery<PmccScreenerResults, ApiError>({
    queryKey: screenerQueryKeys.pmccResults,
    queryFn: getPmccScreenerResults,
    enabled
  })
}
