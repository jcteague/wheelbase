import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { PositionDetailActions } from './PositionDetailActions'

const BASE_PROPS = {
  hasCostBasis: true,
  onOpenCc: vi.fn(),
  onRecordAssignment: vi.fn(),
  onRecordExpiration: vi.fn(),
  onCloseCcEarly: vi.fn()
}

beforeEach(() => {
  BASE_PROPS.onOpenCc.mockReset()
  BASE_PROPS.onRecordAssignment.mockReset()
  BASE_PROPS.onRecordExpiration.mockReset()
  BASE_PROPS.onCloseCcEarly.mockReset()
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
