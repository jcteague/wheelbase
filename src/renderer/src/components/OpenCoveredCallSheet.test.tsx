import { act, render } from '@testing-library/react'
import { vi } from 'vitest'
import { useOpenCoveredCall } from '../hooks/useOpenCoveredCall'
import { OpenCoveredCallSheet } from './OpenCoveredCallSheet'
import type { CcForm } from './OpenCcForm'

vi.mock('../hooks/useOpenCoveredCall')

type CcFormProps = Parameters<typeof CcForm>[0]
let formProps: CcFormProps | undefined
vi.mock('./OpenCcForm', () => ({
  CcForm: (props: CcFormProps) => {
    formProps = props
    return null
  }
}))

const mockMutate = vi.fn()

const PROPS = {
  open: true,
  positionId: 'pos-123',
  ticker: 'AAPL',
  basisPerShare: '174.2000',
  totalPremiumCollected: '350.0000',
  contracts: 1,
  assignmentDate: '2026-01-16',
  onClose: vi.fn()
}

function fillAndSubmit(): void {
  act(() => {
    formProps!.onStrikeChange('182')
    formProps!.onPremiumChange('2.30')
    formProps!.onExpirationChange('2026-02-21')
  })
  act(() => formProps!.onSubmit())
}

beforeEach(() => {
  formProps = undefined
  mockMutate.mockReset()
  vi.mocked(useOpenCoveredCall).mockReturnValue({
    mutate: mockMutate,
    isPending: false
  } as unknown as ReturnType<typeof useOpenCoveredCall>)
})

it('submits the camelCase payload the handler accepts', () => {
  render(<OpenCoveredCallSheet {...PROPS} />)
  fillAndSubmit()

  expect(mockMutate).toHaveBeenCalledWith(
    expect.objectContaining({
      positionId: 'pos-123',
      strike: 182,
      expiration: '2026-02-21',
      contracts: 1,
      premiumPerContract: 2.3
    }),
    expect.anything()
  )
})

it('shows the handler field errors beside the premium and fill date fields', () => {
  mockMutate.mockImplementation((_payload, options?: { onError?: (error: unknown) => void }) =>
    options?.onError?.({
      status: 400,
      body: {
        detail: [
          { field: 'premiumPerContract', code: 'too_low', message: 'Server: premium too low' },
          { field: 'fillDate', code: 'before_assignment', message: 'Server: date too early' }
        ]
      }
    })
  )
  render(<OpenCoveredCallSheet {...PROPS} />)
  fillAndSubmit()

  expect(formProps!.fieldErrors).toEqual({
    premium: 'Server: premium too low',
    fillDate: 'Server: date too early'
  })
})
