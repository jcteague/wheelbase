import { useQuery, type UseQueryResult } from '@tanstack/react-query'

async function listPending(): Promise<PendingAssignmentNotification[]> {
  const result = await window.api.assignments.listPending()
  if (!result.ok) return []
  return result.assignments
}

export function usePendingAssignments(): UseQueryResult<PendingAssignmentNotification[]> {
  return useQuery({
    queryKey: ['assignments', 'pending'] as const,
    queryFn: listPending,
    refetchInterval: 30_000
  })
}
