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
  assignPosition: vi.fn()
}))

import { assignPosition } from '../api/positions'

describe('useAssignPosition', () => {
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
    const { useAssignPosition } = await import('./useAssignPosition')

    const mutation = useAssignPosition()

    expect(mockUseMutation).toHaveBeenCalledOnce()
    expect(mutation.mutate).toEqual(expect.any(Function))
  })

  it('invalidates positionQueryKeys.all queries on success', async () => {
    const { useAssignPosition } = await import('./useAssignPosition')

    useAssignPosition()

    const [options] = mockUseMutation.mock.calls[0] as [
      {
        mutationFn: typeof assignPosition
        onSuccess?: (data: unknown) => void
      }
    ]

    expect(options.mutationFn).toBe(assignPosition)
    expect(options.onSuccess).toEqual(expect.any(Function))

    options.onSuccess?.({
      position: { id: 'pos-123', ticker: 'AAPL', phase: 'HOLDING_SHARES', status: 'ACTIVE' }
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['positions']
    })
  })

  it('calls the optional onSuccess callback with AssignCspResponse data', async () => {
    const { useAssignPosition } = await import('./useAssignPosition')
    const onSuccess = vi.fn()
    const response = {
      position: { id: 'pos-123', ticker: 'AAPL', phase: 'HOLDING_SHARES', status: 'ACTIVE' },
      premiumWaterfall: [{ label: 'CSP premium', amount: '2.5000' }]
    }

    useAssignPosition({ onSuccess })

    const [options] = mockUseMutation.mock.calls[0] as [
      {
        onSuccess?: (data: typeof response) => void
      }
    ]

    options.onSuccess?.(response)

    expect(onSuccess).toHaveBeenCalledWith(response)
  })

  it('exposes error state and error details from the underlying mutation', async () => {
    const expectedMutation = {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: true,
      error: {
        status: 400,
        body: {
          detail: [
            {
              field: 'assignment_date',
              code: 'date_before_open',
              message: 'Assignment date cannot be before the CSP open date'
            }
          ]
        }
      },
      data: undefined
    }
    mockUseMutation.mockReturnValue(expectedMutation)

    const { useAssignPosition } = await import('./useAssignPosition')

    const mutation = useAssignPosition()

    expect(mutation.isError).toBe(true)
    expect(mutation.error).toEqual(expectedMutation.error)
  })
})
