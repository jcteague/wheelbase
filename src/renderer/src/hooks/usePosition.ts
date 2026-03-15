import { useQuery } from '@tanstack/react-query'
import { type ApiError, type PositionDetail, getPosition } from '../api/positions'
import { positionQueryKeys } from './positionQueryKeys'

export function usePosition(id: string): ReturnType<typeof useQuery<PositionDetail, ApiError>> {
  return useQuery<PositionDetail, ApiError>({
    queryKey: positionQueryKeys.detail(id),
    queryFn: () => getPosition(id)
  })
}
