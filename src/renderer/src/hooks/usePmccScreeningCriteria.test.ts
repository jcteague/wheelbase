// [US-110] Edit PMCC criteria and re-screen — query hooks.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPmccScreeningCriteria,
  savePmccScreeningCriteria,
  type PmccScreeningCriteria
} from '../api/pmcc-screening-criteria'
import { usePmccScreeningCriteria, useSavePmccScreeningCriteria } from './usePmccScreeningCriteria'

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

vi.mock('../api/pmcc-screening-criteria', () => ({
  getPmccScreeningCriteria: vi.fn(),
  savePmccScreeningCriteria: vi.fn()
}))

type QueryOptions = {
  queryKey: readonly unknown[]
  queryFn: unknown
  enabled: boolean
}

type MutationOptions = {
  mutationFn: unknown
  onSuccess: (criteria: PmccScreeningCriteria) => void
}

const SAVED: PmccScreeningCriteria = {
  longDeltaMin: '0.70',
  longDeltaMax: '0.85',
  longDteMin: 180,
  longDteMax: 540,
  shortDeltaMin: '0.25',
  shortDeltaMax: '0.35',
  shortDteMin: 20,
  shortDteMax: 45,
  maxDebitToWidthPercent: '85',
  minOpenInterest: 200,
  maxSpreadPercent: '10',
  maxSpreadAbsolute: '0.10',
  minIvRank: null,
  maxIvRank: null,
  earningsHandling: 'exclude'
}

function queryOptions(): QueryOptions {
  expect(mockUseQuery).toHaveBeenCalledOnce()
  return mockUseQuery.mock.calls[0][0]
}

function mutationOptions(): MutationOptions {
  expect(mockUseMutation).toHaveBeenCalledOnce()
  return mockUseMutation.mock.calls[0][0]
}

describe('usePmccScreeningCriteria hooks', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockReset()
    mockUseQuery.mockReset()
    mockUseQueryClient.mockReset()

    mockUseQueryClient.mockReturnValue({ invalidateQueries: mockInvalidateQueries })
    mockUseMutation.mockImplementation((options) => options)
    mockUseQuery.mockImplementation((options) => options)
  })

  // Its own key under the screener tree, so a PMCC save never refetches the wheel criteria.
  it('usePmccScreeningCriteria queries the pmcc-criteria key with getPmccScreeningCriteria', () => {
    usePmccScreeningCriteria()

    expect(queryOptions()).toMatchObject({
      queryKey: ['screener', 'pmcc-criteria'],
      queryFn: getPmccScreeningCriteria
    })
  })

  it('usePmccScreeningCriteria is enabled by default', () => {
    usePmccScreeningCriteria()

    expect(queryOptions().enabled).toBe(true)
  })

  // The page mounts both lenses' hooks; only the active lens may fetch.
  it('usePmccScreeningCriteria stays idle when told it is not enabled', () => {
    usePmccScreeningCriteria({ enabled: false })

    expect(queryOptions().enabled).toBe(false)
  })

  it('useSavePmccScreeningCriteria uses savePmccScreeningCriteria as its mutation function', () => {
    useSavePmccScreeningCriteria()

    expect(mutationOptions().mutationFn).toBe(savePmccScreeningCriteria)
  })

  // "Save & re-screen" for the PMCC lens: its criteria and its results refetch, and the
  // wheel's criteria and results are left exactly as they were.
  it('useSavePmccScreeningCriteria invalidates only the PMCC criteria and PMCC results on success', () => {
    useSavePmccScreeningCriteria()

    mutationOptions().onSuccess(SAVED)

    expect(mockInvalidateQueries.mock.calls).toEqual([
      [{ queryKey: ['screener', 'pmcc-criteria'] }],
      [{ queryKey: ['screener', 'pmcc-results'] }]
    ])
  })

  it('useSavePmccScreeningCriteria hands the saved criteria to the caller on success', () => {
    const onSuccess = vi.fn()
    useSavePmccScreeningCriteria({ onSuccess })

    mutationOptions().onSuccess(SAVED)

    expect(onSuccess).toHaveBeenCalledWith(SAVED)
  })
})
