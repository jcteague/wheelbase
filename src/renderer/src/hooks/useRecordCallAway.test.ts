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
  recordCallAway: vi.fn()
}))

import { recordCallAway } from '../api/positions'

describe('useRecordCallAway', () => {
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
    const { useRecordCallAway } = await import('./useRecordCallAway')

    const mutation = useRecordCallAway()

    expect(mockUseMutation).toHaveBeenCalledOnce()
    expect(mutation.mutate).toEqual(expect.any(Function))
  })

  it('calls recordCallAway API as mutationFn', async () => {
    const { useRecordCallAway } = await import('./useRecordCallAway')

    useRecordCallAway()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof recordCallAway; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(recordCallAway)
  })

  it('invalidates positionQueryKeys.all on success', async () => {
    const { useRecordCallAway } = await import('./useRecordCallAway')

    useRecordCallAway()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: (data: unknown) => void }]

    options.onSuccess?.({
      position: {
        id: 'pos-1',
        ticker: 'AAPL',
        phase: 'WHEEL_COMPLETE',
        status: 'CLOSED',
        closedDate: '2026-03-21'
      },
      finalPnl: '780.0000'
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['positions']
    })
  })

  it('invokes optional onSuccess callback with response data', async () => {
    const { useRecordCallAway } = await import('./useRecordCallAway')
    const onSuccess = vi.fn()
    const response = {
      position: {
        id: 'pos-1',
        ticker: 'AAPL',
        phase: 'WHEEL_COMPLETE',
        status: 'CLOSED',
        closedDate: '2026-03-21'
      },
      leg: { id: 'leg-1', legRole: 'CALLED_AWAY', action: 'EXERCISE' },
      costBasisSnapshot: {
        id: 'snap-1',
        positionId: 'pos-1',
        basis_per_share: '174.2000',
        total_premium_collected: '5.8000',
        finalPnl: '780.0000',
        snapshotAt: '2026-03-21',
        createdAt: '2026-03-21'
      },
      finalPnl: '780.0000',
      cycleDays: 99,
      annualizedReturn: '16.5084',
      basisPerShare: '174.2000'
    }

    useRecordCallAway({ onSuccess })

    const [options] = mockUseMutation.mock.calls[0] as [
      { onSuccess?: (data: typeof response) => void }
    ]

    options.onSuccess?.(response)

    expect(onSuccess).toHaveBeenCalledWith(response)
  })

  it('propagates error when API throws', async () => {
    const expectedMutation = {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error('No open covered call on this position'),
      data: undefined
    }
    mockUseMutation.mockReturnValue(expectedMutation)

    const { useRecordCallAway } = await import('./useRecordCallAway')

    const mutation = useRecordCallAway()

    expect(mutation.isError).toBe(true)
    expect(mutation.error).toEqual(expectedMutation.error)
  })
})
