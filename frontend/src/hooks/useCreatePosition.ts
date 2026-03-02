import { useMutation } from '@tanstack/react-query';
import {
  type ApiError,
  type CreatePositionPayload,
  type CreatePositionResponse,
  createPosition,
} from '../api/positions';

export function useCreatePosition() {
  return useMutation<CreatePositionResponse, ApiError, CreatePositionPayload>({
    mutationFn: createPosition,
  });
}
