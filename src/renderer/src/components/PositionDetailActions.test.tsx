import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { PositionDetailActions } from './PositionDetailActions'

const BASE_PROPS = {
  hasCostBasis: true,
  ccExpired: false,
  onOpenCc: vi.fn(),
  onRecordAssignment: vi.fn(),
  onRecordExpiration: vi.fn(),
  onCloseCcEarly: vi.fn(),
  onRecordCallAway: vi.fn(),
  onRecordCcExpiration: vi.fn(),
  onRollCsp: vi.fn(),
  onRollCc: vi.fn()
}

beforeEach(() => {
  BASE_PROPS.onOpenCc.mockReset()
  BASE_PROPS.onRecordAssignment.mockReset()
  BASE_PROPS.onRecordExpiration.mockReset()
  BASE_PROPS.onCloseCcEarly.mockReset()
  BASE_PROPS.onRecordCallAway.mockReset()
  BASE_PROPS.onRecordCcExpiration.mockReset()
  BASE_PROPS.onRollCsp.mockReset()
  BASE_PROPS.onRollCc.mockReset()
})

it('renders "Close CC Early →" button when phase=CC_OPEN', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  expect(screen.getByText(/Close CC Early/i)).toBeInTheDocument()
})

it('does not render "Close CC Early →" button when phase=HOLDING_SHARES', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="HOLDING_SHARES" />)
  expect(screen.queryByText(/Close CC Early/i)).not.toBeInTheDocument()
})

it('calls onCloseCcEarly when "Close CC Early →" button is clicked', async () => {
  const user = userEvent.setup()
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  await user.click(screen.getByText(/Close CC Early/i))
  expect(BASE_PROPS.onCloseCcEarly).toHaveBeenCalledOnce()
})

it('renders "Record Call-Away →" button when phase is CC_OPEN', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  expect(screen.getByTestId('record-call-away-btn')).toBeInTheDocument()
})

it('does not render "Record Call-Away →" button when phase is HOLDING_SHARES', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="HOLDING_SHARES" />)
  expect(screen.queryByTestId('record-call-away-btn')).not.toBeInTheDocument()
})

it('calls onRecordCallAway when the "Record Call-Away →" button is clicked', async () => {
  const user = userEvent.setup()
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" />)
  await user.click(screen.getByTestId('record-call-away-btn'))
  expect(BASE_PROPS.onRecordCallAway).toHaveBeenCalledOnce()
})

it('renders "Roll CSP →" button with data-testid="roll-csp-btn" when phase=CSP_OPEN', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="CSP_OPEN" />)
  const btn = screen.getByTestId('roll-csp-btn')
  expect(btn).toBeInTheDocument()
  expect(btn).toHaveTextContent('Roll CSP →')
})

it('does not render "Roll CSP →" button when phase=HOLDING_SHARES', () => {
  render(<PositionDetailActions {...BASE_PROPS} phase="HOLDING_SHARES" />)
  expect(screen.queryByTestId('roll-csp-btn')).not.toBeInTheDocument()
})

it('calls onRollCsp when "Roll CSP →" button is clicked', async () => {
  const user = userEvent.setup()
  render(<PositionDetailActions {...BASE_PROPS} phase="CSP_OPEN" />)
  await user.click(screen.getByTestId('roll-csp-btn'))
  expect(BASE_PROPS.onRollCsp).toHaveBeenCalledOnce()
})

it('PositionDetailActions: shows "Roll CC →" button when phase is CC_OPEN', () => {
  const onRollCc = vi.fn()
  render(<PositionDetailActions {...BASE_PROPS} phase="CC_OPEN" onRollCc={onRollCc} />)
  expect(screen.getByTestId('roll-cc-btn')).toBeInTheDocument()
})

it('PositionDetailActions: does not show "Roll CC →" button when phase is CSP_OPEN', () => {
  const onRollCc = vi.fn()
  render(<PositionDetailActions {...BASE_PROPS} phase="CSP_OPEN" onRollCc={onRollCc} />)
  expect(screen.queryByTestId('roll-cc-btn')).not.toBeInTheDocument()
})
