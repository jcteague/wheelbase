import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getMarketStatus, type MarketStatus } from '../api/market-data'
import type { ApiError } from '../api/error'
import { marketDataQueryKeys } from './marketDataQueryKeys'

const REFETCH_INTERVAL_MS = 60_000
const STALE_TIME_MS = 30_000

export function useMarketStatus(): UseQueryResult<MarketStatus, ApiError> {
  return useQuery({
    queryKey: marketDataQueryKeys.marketStatus,
    queryFn: getMarketStatus,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true
  })
}
