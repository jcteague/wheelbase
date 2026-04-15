import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { RollCcResponse } from '../api/positions'
import { useRollCc } from '../hooks/useRollCc'
import { RollCcSheet } from './RollCcSheet'

vi.mock('../hooks/useRollCc')
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onChange,
    'aria-label': ariaLabel,
    'data-testid': dataTestId
  }: {
    id?: string
    value?: string
    onChange: (value: string) => void
    'aria-label'?: string
    'data-testid'?: string
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))

const mockMutate = vi.fn()
const mockUseRollCc = vi.mocked(useRollCc)

const DEFAULT_PROPS = {
  open: true,
  positionId: 'pos-cc-1',
  ticker: 'NVDA',
  strike: '190.0000',
  expiration: '2026-04-18',
  contracts: 1,
  premiumPerContract: '4.5000',
  basisPerShare: '176.5000',
  totalPremiumCollected: '450.0000',
  onClose: vi.fn()
}

const SUCCESS_RESPONSE: RollCcResponse = {
  position: { id: 'pos-cc-1', ticker: 'NVDA', phase: 'CC_OPEN', status: 'ACTIVE' },
  rollFromLeg: {
    id: 'leg-from-1',
    legRole: 'ROLL_FROM',
    action: 'BUY',
    instrumentType: 'CALL',
    strike: '190.0000',
    expiration: '2026-04-18',
    contracts: 1,
    premium_per_contract: '1.2000',
    premiumPerContract: '1.2000',
    fillDate: '2026-04-13'
  },
  rollToLeg: {
    id: 'leg-to-1',
    legRole: 'ROLL_TO',
    action: 'SELL',
    instrumentType: 'CALL',
    strike: '195.0000',
    expiration: '2026-05-16',
    contracts: 1,
    premium_per_contract: '2.8000',
    premiumPerContract: '2.8000',
    fillDate: '2026-04-13'
  },
  rollChainId: 'chain-uuid-abcd',
  costBasisSnapshot: {
    id: 'snap-1',
    positionId: 'pos-cc-1',
    basisPerShare: '174.9000',
    totalPremiumCollected: '610.0000',
    finalPnl: null,
    snapshotAt: '2026-04-13T00:00:00.000Z',
    createdAt: '2026-04-13T00:00:00.000Z'
  }
}

beforeEach(() => {
  mockMutate.mockReset()
  DEFAULT_PROPS.onClose.mockReset()
  mockUseRollCc.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useRollCc>)
})

it('renders nothing when open=false', () => {
  render(<RollCcSheet {...DEFAULT_PROPS} open={false} />)
  expect(screen.queryByText('Roll Covered Call')).not.toBeInTheDocument()
})

it('renders RollCcForm when open=true', () => {
  render(<RollCcSheet {...DEFAULT_PROPS} />)
  expect(screen.getByText('Roll Covered Call')).toBeInTheDocument()
})

it('schema validation — rejects empty new expiration', async () => {
  const user = userEvent.setup()
  render(<RollCcSheet {...DEFAULT_PROPS} />)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '1.20')

  const premiumInput = screen.getByLabelText(/new premium/i)
  await user.clear(premiumInput)
  await user.type(premiumInput, '2.80')

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  await waitFor(() => {
    expect(screen.getByText(/new expiration is required/i)).toBeInTheDocument()
  })
})

it('schema validation — rejects new expiration before current expiration', async () => {
  const user = userEvent.setup()
  render(<RollCcSheet {...DEFAULT_PROPS} />)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '1.20')

  const premiumInput = screen.getByLabelText(/new premium/i)
  await user.clear(premiumInput)
  await user.type(premiumInput, '2.80')

  const expInput = screen.getByLabelText(/new expiration/i)
  await user.clear(expInput)
  await user.type(expInput, '2026-04-11')

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  await waitFor(() => {
    expect(screen.getByText(/on or after/i)).toBeInTheDocument()
  })
})

it('schema validation — rejects zero cost to close', async () => {
  const user = userEvent.setup()
  render(<RollCcSheet {...DEFAULT_PROPS} />)

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  await waitFor(() => {
    expect(screen.getByText(/cost to close must be greater than zero/i)).toBeInTheDocument()
  })
})

it('schema validation — rejects zero new premium', async () => {
  const user = userEvent.setup()
  render(<RollCcSheet {...DEFAULT_PROPS} />)

  const costInput = screen.getByLabelText(/cost to close/i)
  await user.clear(costInput)
  await user.type(costInput, '1.20')

  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  await waitFor(() => {
    expect(screen.getByText(/new premium must be greater than zero/i)).toBeInTheDocument()
  })
})

it('transitions to RollCcSuccess when mutation resolves', () => {
  let capturedOnSuccess: ((data: RollCcResponse) => void) | undefined

  mockUseRollCc.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: RollCcResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useRollCc>
    }
  )

  const { rerender } = render(<RollCcSheet {...DEFAULT_PROPS} />)

  capturedOnSuccess?.(SUCCESS_RESPONSE)
  rerender(<RollCcSheet {...DEFAULT_PROPS} />)

  expect(screen.getByText(/CC Rolled Successfully/)).toBeInTheDocument()
})

it('success screen shows pre-roll basis even when basisPerShare prop updates after mutation', async () => {
  let capturedOnSuccess: ((data: RollCcResponse) => void) | undefined
  const user = userEvent.setup()

  mockUseRollCc.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: RollCcResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return {
        mutate: mockMutate,
        isPending: false,
        isSuccess: false,
        isError: false,
        data: undefined,
        error: null
      } as unknown as ReturnType<typeof useRollCc>
    }
  )

  const { rerender } = render(<RollCcSheet {...DEFAULT_PROPS} basisPerShare="176.5000" />)

  // fill required fields and submit to capture prevBasis
  await user.type(screen.getByLabelText(/cost to close/i), '1.20')
  await user.type(screen.getByLabelText(/new premium/i), '2.80')
  await user.type(screen.getByLabelText(/new expiration/i), '2026-05-16')
  await user.click(screen.getByRole('button', { name: /confirm roll/i }))

  // simulate props updating (React Query refetch) before success renders
  capturedOnSuccess?.(SUCCESS_RESPONSE)
  rerender(<RollCcSheet {...DEFAULT_PROPS} basisPerShare="174.9000" />)

  // prevBasis should be the value at submit time (176.5000), not the updated prop (174.9000)
  expect(screen.getByText(/\$176\.50.*\$174\.90/)).toBeInTheDocument()
})
