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
  closeCoveredCallEarly: vi.fn()
}))

import { closeCoveredCallEarly } from '../api/positions'

describe('useCloseCoveredCallEarly', () => {
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
    const { useCloseCoveredCallEarly } = await import('./useCloseCoveredCallEarly')

    const mutation = useCloseCoveredCallEarly()

    expect(mockUseMutation).toHaveBeenCalledOnce()
    expect(mutation.mutate).toEqual(expect.any(Function))
  })

  it('calls closeCoveredCallEarly API as mutationFn', async () => {
    const { useCloseCoveredCallEarly } = await import('./useCloseCoveredCallEarly')

    useCloseCoveredCallEarly()

    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof closeCoveredCallEarly; onSuccess?: (data: unknown) => void }
    ]

    expect(options.mutationFn).toBe(closeCoveredCallEarly)
  })

  it('invalidates positions query key on success', async () => {
    const { useCloseCoveredCallEarly } = await import('./useCloseCoveredCallEarly')

    useCloseCoveredCallEarly()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: (data: unknown) => void }]

    options.onSuccess?.({
      position: { id: 'pos-1', ticker: 'AAPL', phase: 'HOLDING_SHARES', status: 'ACTIVE' },
      ccLegPnl: '120.0000'
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['positions']
    })
  })

  it('invokes optional onSuccess callback with response data', async () => {
    const { useCloseCoveredCallEarly } = await import('./useCloseCoveredCallEarly')
    const onSuccess = vi.fn()
    const response = {
      position: {
        id: 'pos-1',
        ticker: 'AAPL',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        closedDate: null
      },
      leg: { id: 'leg-1', legRole: 'CC_CLOSE' },
      ccLegPnl: '120.0000'
    }

    useCloseCoveredCallEarly({ onSuccess })

    const [options] = mockUseMutation.mock.calls[0] as [
      { onSuccess?: (data: typeof response) => void }
    ]

    options.onSuccess?.(response)

    expect(onSuccess).toHaveBeenCalledWith(response)
  })

  it('propagates error when API returns { ok: false }', async () => {
    const expectedMutation = {
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error('No open covered call on this position'),
      data: undefined
    }
    mockUseMutation.mockReturnValue(expectedMutation)

    const { useCloseCoveredCallEarly } = await import('./useCloseCoveredCallEarly')

    const mutation = useCloseCoveredCallEarly()

    expect(mutation.isError).toBe(true)
    expect(mutation.error).toEqual(expectedMutation.error)
  })
})
