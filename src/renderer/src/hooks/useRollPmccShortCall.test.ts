// [US-104] useRollPmccShortCall — the Roll Short Call sheet's mutation: it posts through the
// rollPmccShortCall adapter, refreshes every position query, then hands the result back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RollPmccShortCallResponse } from '../api/positions'
import { UP_OUT_RESPONSE } from '../test-fixtures/pmcc-roll'

const { mockUseMutation, mockInvalidateQueries } = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockInvalidateQueries: vi.fn()
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: mockUseMutation,
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries })
}))

vi.mock('../api/positions', () => ({
  rollPmccShortCall: vi.fn()
}))

import { rollPmccShortCall } from '../api/positions'
import { useRollPmccShortCall } from './useRollPmccShortCall'

type MutationOptions = {
  mutationFn: typeof rollPmccShortCall
  onSuccess: (data: RollPmccShortCallResponse) => void
}

function mutationOptions(): MutationOptions {
  expect(mockUseMutation).toHaveBeenCalledOnce()
  const [options] = mockUseMutation.mock.calls[0] as [MutationOptions]
  return options
}

describe('useRollPmccShortCall', () => {
  beforeEach(() => {
    mockUseMutation.mockReset()
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockImplementation((options) => options)
  })

  it('records the roll through the rollPmccShortCall adapter', () => {
    useRollPmccShortCall()

    expect(mutationOptions().mutationFn).toBe(rollPmccShortCall)
  })

  it('invalidates every position query, then passes the recorded roll to onSuccess', () => {
    const onSuccess = vi.fn()
    useRollPmccShortCall({ onSuccess })

    mutationOptions().onSuccess(UP_OUT_RESPONSE)

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['positions'] })
    expect(onSuccess).toHaveBeenCalledWith(UP_OUT_RESPONSE)
  })
})
