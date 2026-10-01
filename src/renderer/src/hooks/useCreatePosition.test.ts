import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreatePositionResponse, PositionListItem } from '../api/positions'

const { mockUseMutation, mockUseQueryClient, mockSetQueryData, mockInvalidateQueries } = vi.hoisted(
  () => ({
    mockUseMutation: vi.fn(),
    mockUseQueryClient: vi.fn(),
    mockSetQueryData: vi.fn(),
    mockInvalidateQueries: vi.fn()
  })
)

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQueryClient: mockUseQueryClient
}))

vi.mock('../api/positions', () => ({
  createPosition: vi.fn()
}))

const NEW_ITEM = { id: 'new' } as unknown as PositionListItem
vi.mock('../lib/position-list-items', () => ({
  toWheelListItem: vi.fn(() => NEW_ITEM),
  insertPositionListItem: vi.fn((items: PositionListItem[], item: PositionListItem) => [
    ...items,
    item
  ])
}))

import { createPosition } from '../api/positions'
import { toWheelListItem } from '../lib/position-list-items'
import { useCreatePosition } from './useCreatePosition'

type Updater = (prev: PositionListItem[] | undefined) => PositionListItem[] | undefined

describe('useCreatePosition', () => {
  beforeEach(() => {
    mockSetQueryData.mockReset()
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQueryClient.mockReset()
    vi.mocked(toWheelListItem).mockClear()
    mockUseQueryClient.mockReturnValue({
      setQueryData: mockSetQueryData,
      invalidateQueries: mockInvalidateQueries
    })
    mockUseMutation.mockImplementation((options) => options)
  })

  it('inserts the opened wheel into the cached list instead of refetching it', () => {
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

    const response = { position: { id: 'new' } } as CreatePositionResponse
    options.onSuccess?.(response)

    expect(toWheelListItem).toHaveBeenCalledWith(response)
    const [key, updater] = mockSetQueryData.mock.calls[0] as [readonly string[], Updater]
    expect(key).toEqual(['positions'])
    const existing = { id: 'old' } as unknown as PositionListItem
    expect(updater([existing])).toEqual([existing, NEW_ITEM])
    expect(updater(undefined)).toBeUndefined()
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })
})
