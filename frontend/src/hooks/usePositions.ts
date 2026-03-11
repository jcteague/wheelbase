import { useQuery } from '@tanstack/react-query';
import { type ApiError, type PositionListItem, listPositions } from '../api/positions';

export function usePositions() {
  return useQuery<PositionListItem[], ApiError>({
    queryKey: ['positions'],
    queryFn: listPositions,
  });
}
