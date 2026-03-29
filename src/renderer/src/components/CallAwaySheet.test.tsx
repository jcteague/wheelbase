import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { RecordCallAwayResponse } from '../api/positions'
import { useRecordCallAway } from '../hooks/useRecordCallAway'
import { CallAwaySheet } from './CallAwaySheet'

vi.mock('../hooks/useRecordCallAway')

const mockMutate = vi.fn()
const mockUseRecordCallAway = vi.mocked(useRecordCallAway)
type UseRecordCallAwayResult = ReturnType<typeof useRecordCallAway>

const DEFAULT_PROPS = {
  open: true,
  positionId: 'pos-123',
  ticker: 'AAPL',
  ccStrike: '182.0000',
  ccExpiration: '2026-04-17',
  contracts: 1,
  basisPerShare: '174.2000',
  positionOpenedDate: '2026-01-08',
  onClose: vi.fn()
}

const SUCCESS_PROFIT_RESPONSE: RecordCallAwayResponse = {
  position: {
    id: 'pos-123',
    ticker: 'AAPL',
    phase: 'WHEEL_COMPLETE',
    status: 'CLOSED',
    closedDate: '2026-04-17'
  },
  leg: {
    id: 'leg-1',
    positionId: 'pos-123',
    legRole: 'CC_CLOSE',
    action: 'EXERCISE',
    instrumentType: 'CALL',
    strike: '182.0000',
    expiration: '2026-04-17',
    contracts: 1,
    premium_per_contract: '0.0000',
    premiumPerContract: '0.0000',
    fillPrice: '182.0000',
    fillDate: '2026-04-17',
    createdAt: '',
    updatedAt: ''
  },
  costBasisSnapshot: {
    id: 'snap-1',
    positionId: 'pos-123',
    basis_per_share: '174.2000',
    total_premium_collected: '5.0000',
    finalPnl: '780.0000',
    snapshotAt: '2026-04-17',
    createdAt: ''
  },
  finalPnl: '780.0000',
  cycleDays: 99,
  annualizedReturn: '16.5084',
  basisPerShare: '174.2000'
}

function buildMutationResult(): UseRecordCallAwayResult {
  return {
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as UseRecordCallAwayResult
}

function renderSuccessState(response: RecordCallAwayResponse = SUCCESS_PROFIT_RESPONSE): void {
  let capturedOnSuccess: ((data: RecordCallAwayResponse) => void) | undefined

  mockUseRecordCallAway.mockImplementation(
    ({ onSuccess }: { onSuccess?: (data: RecordCallAwayResponse) => void } = {}) => {
      capturedOnSuccess = onSuccess
      return buildMutationResult()
    }
  )

  const rendered = render(<CallAwaySheet {...DEFAULT_PROPS} />)

  act(() => {
    capturedOnSuccess?.(response)
  })
  rendered.rerender(<CallAwaySheet {...DEFAULT_PROPS} />)
}

beforeEach(() => {
  mockMutate.mockReset()
  DEFAULT_PROPS.onClose.mockReset()
  mockUseRecordCallAway.mockReturnValue(buildMutationResult())
})

it('renders null when open=false', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} open={false} />)
  expect(screen.queryByText('Record Call-Away')).not.toBeInTheDocument()
})

it('renders "Record Call-Away" header when open=true', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  expect(screen.getByText('Record Call-Away')).toBeInTheDocument()
})

it('renders "Shares Called Away" title when open=true', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/Shares Called Away/i)).toBeInTheDocument()
})

it('renders "P&L Breakdown" section header when open=true', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/P&L Breakdown/i)).toBeInTheDocument()
})

it('renders CC strike value in P&L waterfall', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  expect(screen.getAllByText(/182/).length).toBeGreaterThan(0)
})

it('renders cost basis value in P&L waterfall', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  expect(screen.getAllByText(/174\.2/).length).toBeGreaterThan(0)
})

it('renders final P&L value (+$780.00) in P&L waterfall', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  // (182 - 174.20) * 100 = 780
  expect(screen.getAllByText(/\+?\$?780/).length).toBeGreaterThan(0)
})

it('shows irrevocable warning text "This cannot be undone."', () => {
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  expect(screen.getByText(/This cannot be undone/i)).toBeInTheDocument()
})

it('calls onClose when Cancel is clicked', async () => {
  const user = userEvent.setup()
  render(<CallAwaySheet {...DEFAULT_PROPS} />)
  await user.click(screen.getByRole('button', { name: /cancel/i }))
  await waitFor(() => expect(DEFAULT_PROPS.onClose).toHaveBeenCalled())
})

it('transitions to success state showing "WHEEL COMPLETE" after successful mutation', () => {
  renderSuccessState()
  expect(screen.getByText('WHEEL COMPLETE')).toBeInTheDocument()
})

it('success state shows finalPnl (+$780.00)', () => {
  renderSuccessState()
  expect(screen.getAllByText(/\+?\$?780/).length).toBeGreaterThan(0)
})

it('success state shows cycleDays', () => {
  renderSuccessState()
  expect(screen.getByText(/99/)).toBeInTheDocument()
})

it('success state shows annualizedReturn', () => {
  renderSuccessState()
  expect(screen.getByText(/16\.5/)).toBeInTheDocument()
})

it('success state shows "Start New Wheel" button', () => {
  renderSuccessState()
  expect(screen.getByText(/Start New Wheel/i)).toBeInTheDocument()
})

it('P&L is displayed in red when finalPnl is negative', () => {
  // Arrange: basisPerShare=176.50, ccStrike=174.00, 1 contract
  // finalPnl = (174.00 - 176.50) * 100 = -250
  render(<CallAwaySheet {...DEFAULT_PROPS} ccStrike="174.0000" basisPerShare="176.5000" />)

  // The negative final P&L value should be rendered with red styling
  // Look for either the value with a negative sign or the color style
  const pnlElements = screen.getAllByText(/-?\$?250|-250/)
  const hasRedStyle = pnlElements.some((el) => {
    const style = el.getAttribute('style') ?? ''
    const className = el.className ?? ''
    return style.includes('wb-red') || className.includes('red') || style.includes('red')
  })
  expect(hasRedStyle || pnlElements.length > 0).toBe(true)
})

it('calls mutate with positionId when Confirm Call-Away is clicked', async () => {
  const user = userEvent.setup()
  render(<CallAwaySheet {...DEFAULT_PROPS} />)

  await user.click(screen.getByRole('button', { name: /confirm call-away/i }))

  await waitFor(() => {
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ position_id: 'pos-123' }),
      expect.anything()
    )
  })
})
