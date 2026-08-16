// [US-67] Configure screening criteria — query hooks.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getScreeningCriteria, saveScreeningCriteria } from '../api/screening-criteria'
import { screenerQueryKeys } from './screenerQueryKeys'
import { useSaveScreeningCriteria, useScreeningCriteria } from './useScreeningCriteria'

const { mockUseMutation, mockUseQuery, mockUseQueryClient, mockInvalidateQueries } = vi.hoisted(
  () => ({
    mockUseMutation: vi.fn(),
    mockUseQuery: vi.fn(),
    mockUseQueryClient: vi.fn(),
    mockInvalidateQueries: vi.fn()
  })
)

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQuery: mockUseQuery,
  useQueryClient: mockUseQueryClient
}))

vi.mock('../api/screening-criteria', () => ({
  getScreeningCriteria: vi.fn(),
  saveScreeningCriteria: vi.fn()
}))

describe('useScreeningCriteria hooks', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQuery.mockReset()
    mockUseQueryClient.mockReset()

    mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries })
    mockUseMutation.mockImplementation((options) => options)
    mockUseQuery.mockImplementation((options) => options)
  })

  it('useScreeningCriteria queries with screenerQueryKeys.criteria', () => {
    useScreeningCriteria()

    expect(mockUseQuery).toHaveBeenCalledOnce()
    const [options] = mockUseQuery.mock.calls[0] as [
      { queryKey: readonly unknown[]; queryFn: typeof getScreeningCriteria }
    ]

    // Pinned to the literal as well as the constant: the criteria key belongs to
    // the screener tree, not settingsQueryKeys.
    expect(screenerQueryKeys.criteria).toEqual(['screener', 'criteria'])
    expect(options.queryKey).toEqual(screenerQueryKeys.criteria)
    expect(options.queryFn).toBe(getScreeningCriteria)
  })

  it('useSaveScreeningCriteria uses saveScreeningCriteria as its mutation function', () => {
    useSaveScreeningCriteria()

    expect(mockUseMutation).toHaveBeenCalledOnce()
    const [options] = mockUseMutation.mock.calls[0] as [
      { mutationFn: typeof saveScreeningCriteria }
    ]

    expect(options.mutationFn).toBe(saveScreeningCriteria)
  })

  // The dual invalidation IS the "Save & re-screen" mechanism: the criteria query
  // refreshes the sheet and summary strip, the results query re-runs the screen.
  it('useSaveScreeningCriteria invalidates screenerQueryKeys.criteria on success', () => {
    useSaveScreeningCriteria()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: (data: unknown) => void }]
    options.onSuccess?.({})

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: screenerQueryKeys.criteria
    })
  })

  it('useSaveScreeningCriteria invalidates screenerQueryKeys.results on success so the table re-screens', () => {
    useSaveScreeningCriteria()

    const [options] = mockUseMutation.mock.calls[0] as [{ onSuccess?: (data: unknown) => void }]
    options.onSuccess?.({})

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: screenerQueryKeys.results
    })
  })
})
