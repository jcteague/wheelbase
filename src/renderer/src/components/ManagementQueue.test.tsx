import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useManagementQueue } from '../hooks/useManagementQueue'
import { useDismissAlert } from '../hooks/useDismissAlert'
import { ManagementQueue } from './ManagementQueue'

vi.mock('../hooks/useManagementQueue')
vi.mock('../hooks/useDismissAlert')

const mockUseManagementQueue = vi.mocked(useManagementQueue)
const mockUseDismissAlert = vi.mocked(useDismissAlert)

function mutationResult(
  overrides: Record<string, unknown> = {}
): ReturnType<typeof useDismissAlert> {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    error: null,
    data: undefined,
    ...overrides
  } as unknown as ReturnType<typeof useDismissAlert>
}

function queueResult(items: ManagementQueueItem[]): ReturnType<typeof useManagementQueue> {
  return { data: items } as unknown as ReturnType<typeof useManagementQueue>
}

function makeItem(overrides: Partial<ManagementQueueItem>): ManagementQueueItem {
  return {
    alertId: 'a',
    positionId: 'p',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    urgency: 'high',
    summary: 'summary',
    quickAction: 'Review position',
    triggeredAt: '2026-06-25T12:00:00.000Z',
    ...overrides
  }
}

describe('ManagementQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDismissAlert.mockReturnValue(mutationResult())
  })

  it('renders one row per open alert in returned order', () => {
    mockUseManagementQueue.mockReturnValue(
      queueResult([
        makeItem({ alertId: 'a1', positionId: 'p1', ticker: 'AAPL', urgency: 'high' }),
        makeItem({ alertId: 'a2', positionId: 'p2', ticker: 'TSLA', urgency: 'medium' }),
        makeItem({ alertId: 'a3', positionId: 'p3', ticker: 'NVDA', urgency: 'low' })
      ])
    )

    render(<ManagementQueue />)

    const tickers = screen.getAllByText(/AAPL|TSLA|NVDA/)
    expect(tickers.map((el) => el.textContent)).toEqual(['AAPL', 'TSLA', 'NVDA'])
    expect(screen.getAllByRole('button', { name: 'Review position' })).toHaveLength(3)
  })

  it('renders the empty state with no action buttons when there are no alerts', () => {
    mockUseManagementQueue.mockReturnValue(queueResult([]))

    render(<ManagementQueue />)

    expect(screen.getByText('No positions need attention right now')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review position' })).not.toBeInTheDocument()
  })

  it("shows the Confirm Dismissal panel with the generic condition-clears copy when a row's Dismiss is clicked", async () => {
    mockUseManagementQueue.mockReturnValue(
      queueResult([makeItem({ alertId: 'a1', ticker: 'AAPL' })])
    )
    const user = userEvent.setup()

    render(<ManagementQueue />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByText('Hide this alert until the condition clears?')).toBeInTheDocument()
    expect(screen.getByText(/AAPL will disappear from the open queue/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm dismiss' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep alert open' })).toBeInTheDocument()
  })

  it('clicking "Keep alert open" hides the confirm panel without calling dismissAlert', async () => {
    const mutate = vi.fn()
    mockUseDismissAlert.mockReturnValue(mutationResult({ mutate }))
    mockUseManagementQueue.mockReturnValue(
      queueResult([makeItem({ alertId: 'a1', ticker: 'AAPL' })])
    )
    const user = userEvent.setup()

    render(<ManagementQueue />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await user.click(screen.getByRole('button', { name: 'Keep alert open' }))

    expect(
      screen.queryByText('Hide this alert until the condition clears?')
    ).not.toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('clicking "Confirm dismiss" calls dismissAlert with the alertId and hides the panel on success', async () => {
    const mutate = vi.fn((_alertId: string, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.()
    })
    mockUseDismissAlert.mockReturnValue(mutationResult({ mutate }))
    mockUseManagementQueue.mockReturnValue(
      queueResult([makeItem({ alertId: 'a1', ticker: 'AAPL' })])
    )
    const user = userEvent.setup()

    render(<ManagementQueue />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    await user.click(screen.getByRole('button', { name: 'Confirm dismiss' }))

    expect(mutate).toHaveBeenCalledWith('a1', expect.anything())
    await waitFor(() => {
      expect(
        screen.queryByText('Hide this alert until the condition clears?')
      ).not.toBeInTheDocument()
    })
  })

  it('shows an inline ErrorAlert with the server message and keeps the row visible when dismissAlert rejects (e.g. NOT_OPEN)', async () => {
    mockUseManagementQueue.mockReturnValue(
      queueResult([makeItem({ alertId: 'a1', ticker: 'AAPL' })])
    )
    mockUseDismissAlert.mockReturnValue(
      mutationResult({
        error: {
          status: 400,
          body: {
            detail: [
              { field: '__root__', code: 'NOT_OPEN', message: 'Only open alerts can be dismissed' }
            ]
          }
        }
      })
    )
    const user = userEvent.setup()

    render(<ManagementQueue />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Only open alerts can be dismissed')
    expect(screen.getByText('AAPL')).toBeInTheDocument()
  })

  it('disables the Confirm dismiss button while the dismissal is in flight, preventing a double-submit', async () => {
    mockUseDismissAlert.mockReturnValue(mutationResult({ isPending: true }))
    mockUseManagementQueue.mockReturnValue(
      queueResult([makeItem({ alertId: 'a1', ticker: 'AAPL' })])
    )
    const user = userEvent.setup()

    render(<ManagementQueue />)
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByRole('button', { name: 'Dismissing…' })).toBeDisabled()
  })

  it("a delayed dismiss success for an abandoned confirmation does not close a different alert's confirm panel", async () => {
    let capturedOnSuccess: (() => void) | undefined
    const mutate = vi.fn((_alertId: string, options?: { onSuccess?: () => void }) => {
      capturedOnSuccess = options?.onSuccess
    })
    mockUseDismissAlert.mockReturnValue(mutationResult({ mutate }))
    mockUseManagementQueue.mockReturnValue(
      queueResult([
        makeItem({ alertId: 'a1', ticker: 'AAPL' }),
        makeItem({ alertId: 'a2', ticker: 'TSLA' })
      ])
    )
    const user = userEvent.setup()

    render(<ManagementQueue />)
    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' })
    await user.click(dismissButtons[0])
    await user.click(screen.getByRole('button', { name: 'Confirm dismiss' }))
    // Abandon AAPL's (still in-flight) confirmation and open a new one for TSLA.
    await user.click(screen.getByRole('button', { name: 'Keep alert open' }))
    await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[1])
    expect(screen.getByText(/TSLA will disappear/)).toBeInTheDocument()

    // AAPL's dismiss resolves late — it must not close TSLA's still-open panel.
    act(() => capturedOnSuccess?.())

    expect(screen.getByText(/TSLA will disappear/)).toBeInTheDocument()
  })
})
