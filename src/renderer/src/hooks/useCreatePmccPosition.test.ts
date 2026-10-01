import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreatePmccPositionResponse, PositionListItem } from '../api/positions'

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
  createPmccPosition: vi.fn()
}))

const NEW_ITEM = { id: 'new' } as unknown as PositionListItem
vi.mock('../lib/position-list-items', () => ({
  toPmccListItem: vi.fn(() => NEW_ITEM),
  insertPositionListItem: vi.fn((items: PositionListItem[], item: PositionListItem) => [
    ...items,
    item
  ])
}))

import { createPmccPosition } from '../api/positions'
import { toPmccListItem } from '../lib/position-list-items'
import { useCreatePmccPosition } from './useCreatePmccPosition'

type Updater = (prev: PositionListItem[] | undefined) => PositionListItem[] | undefined

function useSuccessHandler(): (data: CreatePmccPositionResponse) => void {
  useCreatePmccPosition()
  expect(mockUseMutation).toHaveBeenCalledOnce()
  const [options] = mockUseMutation.mock.calls[0] as [
    {
      mutationFn: typeof createPmccPosition
      onSuccess?: (data: CreatePmccPositionResponse) => void
    }
  ]
  expect(options.mutationFn).toBe(createPmccPosition)
  expect(options.onSuccess).toEqual(expect.any(Function))
  return options.onSuccess!
}

describe('useCreatePmccPosition', () => {
  beforeEach(() => {
    mockSetQueryData.mockReset()
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQueryClient.mockReset()
    vi.mocked(toPmccListItem).mockClear()
    mockUseQueryClient.mockReturnValue({
      setQueryData: mockSetQueryData,
      invalidateQueries: mockInvalidateQueries
    })
    mockUseMutation.mockImplementation((options) => options)
  })

  it('inserts the recorded position into the cached list instead of refetching it', () => {
    const response = { position: { id: 'new' } } as CreatePmccPositionResponse
    useSuccessHandler()(response)

    expect(toPmccListItem).toHaveBeenCalledWith(response)
    expect(mockSetQueryData).toHaveBeenCalledOnce()
    const [key, updater] = mockSetQueryData.mock.calls[0] as [readonly string[], Updater]
    expect(key).toEqual(['positions'])

    const existing = { id: 'old' } as unknown as PositionListItem
    expect(updater([existing])).toEqual([existing, NEW_ITEM])
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })

  it('leaves the cache alone when the list has never been loaded', () => {
    useSuccessHandler()({ position: { id: 'new' } } as CreatePmccPositionResponse)

    const [, updater] = mockSetQueryData.mock.calls[0] as [readonly string[], Updater]
    expect(updater(undefined)).toBeUndefined()
  })

  it('leaves the cache alone when the row cannot be built', () => {
    vi.mocked(toPmccListItem).mockReturnValueOnce(null)
    useSuccessHandler()({ position: { id: 'new' } } as CreatePmccPositionResponse)

    const [, updater] = mockSetQueryData.mock.calls[0] as [readonly string[], Updater]
    const existing = [{ id: 'old' } as unknown as PositionListItem]
    expect(updater(existing)).toBe(existing)
  })
})
