// [US-115] useSellPmccShort — the Sell Short Call sheet's mutation: it records through the
// sellPmccShort adapter, refreshes every position query, then hands the result back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SellPmccShortResponse } from '../api/positions'
import { SOLD_RESPONSE } from '../test-fixtures/pmcc-sell-short'

type MutationOptions = {
  mutationFn: unknown
  onSuccess: (data: SellPmccShortResponse) => void
}

const { mockUseMutation, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUseMutation: vi.fn((options: MutationOptions) => options),
  mockInvalidateQueries: vi.fn()
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries })
}))

vi.mock('../api/positions', () => ({
  sellPmccShort: vi.fn()
}))

import { sellPmccShort } from '../api/positions'
import { useSellPmccShort } from './useSellPmccShort'

function mutationOptions(): MutationOptions {
  expect(mockUseMutation).toHaveBeenCalledOnce()
  return mockUseMutation.mock.calls[0][0]
}

describe('useSellPmccShort', () => {
  beforeEach(() => {
    mockUseMutation.mockClear()
    mockInvalidateQueries.mockReset()
  })

  it('records the sale through the sellPmccShort adapter', () => {
    useSellPmccShort()

    expect(mutationOptions().mutationFn).toBe(sellPmccShort)
  })

  it('invalidates every position query, then passes the recorded sale to onSuccess', () => {
    const onSuccess = vi.fn()
    useSellPmccShort({ onSuccess })

    mutationOptions().onSuccess(SOLD_RESPONSE)

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['positions'] })
    expect(onSuccess).toHaveBeenCalledWith(SOLD_RESPONSE)
  })
})
