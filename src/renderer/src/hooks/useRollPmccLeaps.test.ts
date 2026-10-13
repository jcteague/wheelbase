// [US-105] useRollPmccLeaps — the Roll LEAPS sheet's mutation: it posts through the
// rollPmccLeaps adapter, refreshes every position query, then hands the result back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RollPmccLeapsResponse } from '../api/positions'
import { LEAPS_UP_OUT_RESPONSE } from '../test-fixtures/pmcc-leaps-roll'

const { mockUseMutation, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockInvalidateQueries: vi.fn()
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries })
}))

vi.mock('../api/positions', () => ({
  rollPmccLeaps: vi.fn()
}))

import { rollPmccLeaps } from '../api/positions'
import { useRollPmccLeaps } from './useRollPmccLeaps'

type MutationOptions = {
  mutationFn: typeof rollPmccLeaps
  onSuccess: (data: RollPmccLeapsResponse) => void
}

function mutationOptions(): MutationOptions {
  expect(mockUseMutation).toHaveBeenCalledOnce()
  const [options] = mockUseMutation.mock.calls[0] as [MutationOptions]
  return options
}

describe('useRollPmccLeaps', () => {
  beforeEach(() => {
    mockUseMutation.mockReset()
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockImplementation((options) => options)
  })

  it('records the roll through the rollPmccLeaps adapter', () => {
    useRollPmccLeaps()

    expect(mutationOptions().mutationFn).toBe(rollPmccLeaps)
  })

  it('invalidates every position query, then passes the recorded roll to onSuccess', () => {
    const onSuccess = vi.fn()
    useRollPmccLeaps({ onSuccess })

    mutationOptions().onSuccess(LEAPS_UP_OUT_RESPONSE)

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['positions'] })
    expect(onSuccess).toHaveBeenCalledWith(LEAPS_UP_OUT_RESPONSE)
  })
})
