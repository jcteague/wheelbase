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

vi.mock('../api/alerts', () => ({
  dismissAlert: vi.fn()
}))

import { dismissAlert } from '../api/alerts'

describe('useDismissAlert', () => {
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

  it('uses dismissAlert as the mutation function', async () => {
    const { useDismissAlert } = await import('./useDismissAlert')

    useDismissAlert()

    const [options] = mockUseMutation.mock.calls[0] as [{ mutationFn: typeof dismissAlert }]
    expect(options.mutationFn).toBe(dismissAlert)
  })

  it('invalidates the ["alerts","queue"] query on success', async () => {
    const { useDismissAlert } = await import('./useDismissAlert')

    useDismissAlert()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: () => void }]
    options.onSuccess?.()

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['alerts', 'queue'] })
  })
})
