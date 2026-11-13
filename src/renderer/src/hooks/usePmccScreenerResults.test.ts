// [US-110] The PMCC lens's screener results query, and the wheel's results query learning to
// stay idle while the other lens is showing.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPmccScreenerResults } from '../api/pmcc-screener'
import { getScreenerResults } from '../api/screener'
import { usePmccScreenerResults } from './usePmccScreenerResults'
import { useScreenerResults } from './useScreenerResults'

const { mockUseQuery } = vi.hoisted(() => ({ mockUseQuery: vi.fn() }))

vi.mock('@tanstack/react-query', () => ({ useQuery: mockUseQuery }))

vi.mock('../api/pmcc-screener', () => ({ getPmccScreenerResults: vi.fn() }))
vi.mock('../api/screener', () => ({ getScreenerResults: vi.fn() }))

type QueryOptions = {
  queryKey: readonly unknown[]
  queryFn: unknown
  enabled: boolean
  refetchInterval?: unknown
}

function queryOptions(): QueryOptions {
  expect(mockUseQuery).toHaveBeenCalledOnce()
  return mockUseQuery.mock.calls[0][0]
}

beforeEach(() => {
  mockUseQuery.mockReset()
  mockUseQuery.mockImplementation((options) => options)
})

describe('usePmccScreenerResults', () => {
  it('queries the pmcc-results key with getPmccScreenerResults', () => {
    usePmccScreenerResults()

    expect(queryOptions()).toMatchObject({
      queryKey: ['screener', 'pmcc-results'],
      queryFn: getPmccScreenerResults
    })
  })

  // A screen is a deliberate action, never a background poll (US-66 research ADR).
  it('never polls', () => {
    usePmccScreenerResults()

    expect(queryOptions()).not.toHaveProperty('refetchInterval')
  })

  it('is enabled by default', () => {
    usePmccScreenerResults()

    expect(queryOptions().enabled).toBe(true)
  })

  it('stays idle when told it is not enabled', () => {
    usePmccScreenerResults({ enabled: false })

    expect(queryOptions().enabled).toBe(false)
  })
})

describe('useScreenerResults', () => {
  it('still queries the wheel results key with getScreenerResults', () => {
    useScreenerResults()

    expect(queryOptions()).toMatchObject({
      queryKey: ['screener', 'results'],
      queryFn: getScreenerResults
    })
  })

  it('is enabled by default, so existing callers keep fetching', () => {
    useScreenerResults()

    expect(queryOptions().enabled).toBe(true)
  })

  it('stays idle while the PMCC lens is showing', () => {
    useScreenerResults({ enabled: false })

    expect(queryOptions().enabled).toBe(false)
  })
})
