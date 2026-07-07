import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  saveAlertOverrides: vi.fn()
}))

import { saveAlertOverrides } from '../api/positions'

describe('useSaveAlertOverrides', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQueryClient.mockReset()
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries
    })
    mockUseMutation.mockImplementation((options) => ({
      mutate: vi.fn(),
      ...options,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
      data: undefined
    }))
  })

  it('returns a mutation object with a mutate function', async () => {
    const { useSaveAlertOverrides } = await import('./useSaveAlertOverrides')

    const mutation = useSaveAlertOverrides()

    expect(mockUseMutation).toHaveBeenCalledOnce()
    expect(mutation.mutate).toEqual(expect.any(Function))
  })

  it('uses saveAlertOverrides as the mutation function', async () => {
    const { useSaveAlertOverrides } = await import('./useSaveAlertOverrides')

    useSaveAlertOverrides()

    const [options] = mockUseMutation.mock.calls[0] as [{ mutationFn: typeof saveAlertOverrides }]
    expect(options.mutationFn).toBe(saveAlertOverrides)
  })

  it('invalidates the whole positions tree on success so the list and detail both refresh', async () => {
    const { useSaveAlertOverrides } = await import('./useSaveAlertOverrides')

    useSaveAlertOverrides()

    const [options] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: typeof saveAlertOverrides
        onSuccess?: (data: unknown, variables: Parameters<typeof saveAlertOverrides>[0]) => void
      }
    ]

    options.onSuccess?.(
      { position: { id: 'pos-123', profitTargetPercent: 25, managementWindowDteOverride: 14 } },
      { positionId: 'pos-123', profitTargetPercent: 25, managementWindowDte: 14 }
    )

    // The list key ['positions'] prefix-matches the detail key ['positions', id],
    // so a single .all invalidation refreshes both.
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['positions']
    })
  })
})
