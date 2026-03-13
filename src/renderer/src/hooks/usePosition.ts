import { useQuery } from '@tanstack/react-query'
import { type ApiError, type PositionDetail, getPosition } from '../api/positions'

export function usePosition(id: string): ReturnType<typeof useQuery<PositionDetail, ApiError>> {
  return useQuery<PositionDetail, ApiError>({
    queryKey: ['positions', id],
    queryFn: () => getPosition(id)
  })
}
