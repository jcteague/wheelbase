import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreatePositionResponse } from '../api/positions'

const { mockUseMutation, mockUseQueryClient, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockUseQueryClient: vi.fn(),
  mockInvalidateQueries: vi.fn()
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient
}))

vi.mock('../api/positions', () => ({
  createPosition: vi.fn()
}))

import { createPosition } from '../api/positions'
import { useCreatePosition } from './useCreatePosition'

describe('useCreatePosition', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQueryClient.mockReset()
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries
    })
    mockUseMutation.mockImplementation((options) => options)
  })

  it('invalidates positions query after successful mutation', () => {
    useCreatePosition()

    expect(mockUseMutation).toHaveBeenCalledOnce()

    const [options] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: typeof createPosition
        onSuccess?: (data: CreatePositionResponse) => void
      }
    ]

    expect(options.mutationFn).toBe(createPosition)
    expect(options.onSuccess).toEqual(expect.any(Function))

    options.onSuccess?.({} as CreatePositionResponse)

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['positions']
    })
  })
})
