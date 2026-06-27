import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { listManagementQueue } from '../api/alerts'

export function useManagementQueue(): UseQueryResult<ManagementQueueItem[]> {
  return useQuery({
    queryKey: ['alerts', 'queue'] as const,
    queryFn: listManagementQueue,
    refetchInterval: 30_000
  })
}
