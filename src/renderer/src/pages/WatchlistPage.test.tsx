import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiError } from '../api/error'
import type { WatchlistEntry } from '../api/watchlist'
import { useAddToWatchlist } from '../hooks/useAddToWatchlist'
import { useRemoveFromWatchlist } from '../hooks/useRemoveFromWatchlist'
import { useWatchlist } from '../hooks/useWatchlist'
import { WatchlistPage } from './WatchlistPage'

vi.mock('../hooks/useWatchlist')
vi.mock('../hooks/useAddToWatchlist')
vi.mock('../hooks/useRemoveFromWatchlist')

const mockUseWatchlist = vi.mocked(useWatchlist)
const mockUseAddToWatchlist = vi.mocked(useAddToWatchlist)
const mockUseRemoveFromWatchlist = vi.mocked(useRemoveFromWatchlist)

const mockAddMutate = vi.fn()
const mockRemoveMutate = vi.fn()

function entry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    ticker: 'AAPL',
    notes: null,
    ownBelowPrice: null,
    ivrTrigger: null,
    postEarningsOnly: false,
    coreHolding: false,
    addedAt: '2026-07-02T12:00:00.000Z',
    ...overrides
  }
}

function setWatchlist(entries: WatchlistEntry[]): void {
  mockUseWatchlist.mockReturnValue({
    data: entries,
    isLoading: false,
    isError: false
  } as unknown as ReturnType<typeof useWatchlist>)
}

beforeEach(() => {
  mockAddMutate.mockReset()
  mockRemoveMutate.mockReset()
  setWatchlist([])
  mockUseAddToWatchlist.mockReturnValue({
    mutate: mockAddMutate,
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: vi.fn()
  } as unknown as ReturnType<typeof useAddToWatchlist>)
  mockUseRemoveFromWatchlist.mockReturnValue({
    mutate: mockRemoveMutate,
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: vi.fn()
  } as unknown as ReturnType<typeof useRemoveFromWatchlist>)
})

describe('WatchlistPage — list rendering', () => {
  it('renders a row for each entry with the ticker uppercased', () => {
    setWatchlist([entry({ ticker: 'AAPL' }), entry({ ticker: 'MSFT' })])
    render(<WatchlistPage />)

    expect(screen.getByTestId('watchlist-ticker-AAPL')).toHaveTextContent('AAPL')
    expect(screen.getByTestId('watchlist-ticker-MSFT')).toHaveTextContent('MSFT')
  })

  it('renders entries in the order supplied by the hook (newest first)', () => {
    setWatchlist([
      entry({ ticker: 'NVDA', addedAt: '2026-07-14T12:00:00.000Z' }),
      entry({ ticker: 'MSFT', addedAt: '2026-06-28T12:00:00.000Z' }),
      entry({ ticker: 'AAPL', addedAt: '2026-07-02T12:00:00.000Z' })
    ])
    render(<WatchlistPage />)

    const tickers = screen.getAllByTestId('watchlist-ticker').map((el) => el.textContent)
    expect(tickers).toEqual(['NVDA', 'MSFT', 'AAPL'])
  })

  it('shows condition tags for own-below-price and ivr-trigger', () => {
    setWatchlist([entry({ ticker: 'PLTR', ownBelowPrice: '38.0000', ivrTrigger: 50 })])
    render(<WatchlistPage />)

    const row = screen.getByTestId('watchlist-row-PLTR')
    expect(within(row).getByText('≤ $38')).toBeInTheDocument()
    expect(within(row).getByText('IVR ≥ 50')).toBeInTheDocument()
  })

  it('shows the post-earnings and core condition tags', () => {
    setWatchlist([entry({ ticker: 'KO', postEarningsOnly: true, coreHolding: true })])
    render(<WatchlistPage />)

    const row = screen.getByTestId('watchlist-row-KO')
    expect(within(row).getByText('post-earnings')).toBeInTheDocument()
    expect(within(row).getByText('core')).toBeInTheDocument()
  })

  it('renders no condition tags for an entry with no conditions', () => {
    setWatchlist([entry({ ticker: 'NVDA' })])
    render(<WatchlistPage />)

    const row = screen.getByTestId('watchlist-row-NVDA')
    expect(within(row).queryAllByTestId('watchlist-tag')).toHaveLength(0)
  })

  it('shows the thesis note text and an added date', () => {
    setWatchlist([entry({ ticker: 'PLTR', notes: 'Would own below $38 after the run-up' })])
    render(<WatchlistPage />)

    const row = screen.getByTestId('watchlist-row-PLTR')
    expect(within(row).getByText('Would own below $38 after the run-up')).toBeInTheDocument()
    expect(within(row).getByText('Jul 2')).toBeInTheDocument()
  })

  it('calls the remove mutation with the row ticker when ✕ is clicked', () => {
    setWatchlist([entry({ ticker: 'AAPL' }), entry({ ticker: 'MSFT' })])
    render(<WatchlistPage />)

    fireEvent.click(screen.getByTestId('watchlist-remove-AAPL'))
    expect(mockRemoveMutate).toHaveBeenCalledWith('AAPL')
  })
})

describe('WatchlistPage — add form', () => {
  it('submits the add mutation with the parsed payload for a valid ticker', async () => {
    render(<WatchlistPage />)

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'NVDA' } })
    fireEvent.click(screen.getByTestId('watchlist-add-submit'))

    await waitFor(() => {
      expect(mockAddMutate).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'NVDA' }),
        expect.anything()
      )
    })
  })

  it('shows a required-symbol error when the ticker is empty', async () => {
    render(<WatchlistPage />)

    fireEvent.click(screen.getByTestId('watchlist-add-submit'))

    expect(await screen.findByText('Enter a ticker symbol')).toBeInTheDocument()
    expect(mockAddMutate).not.toHaveBeenCalled()
  })

  it('shows a malformed-symbol error for a numeric ticker', async () => {
    render(<WatchlistPage />)

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: '12345' } })
    fireEvent.click(screen.getByTestId('watchlist-add-submit'))

    expect(await screen.findByText('Enter a valid ticker symbol')).toBeInTheDocument()
    expect(mockAddMutate).not.toHaveBeenCalled()
  })

  it('surfaces a server duplicate error inline on the ticker field', async () => {
    mockAddMutate.mockImplementation((_payload, opts) => {
      opts.onError(
        apiError(400, {
          detail: [
            { field: 'ticker', code: 'duplicate', message: 'AAPL is already on the watchlist' }
          ]
        })
      )
    })
    render(<WatchlistPage />)

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'AAPL' } })
    fireEvent.click(screen.getByTestId('watchlist-add-submit'))

    expect(await screen.findByText('AAPL is already on the watchlist')).toBeInTheDocument()
  })

  it('surfaces a non-field server error as a form-level alert', async () => {
    mockAddMutate.mockImplementation((_payload, opts) => {
      opts.onError(
        apiError(400, {
          detail: [{ field: '__root__', code: 'internal_error', message: 'Database write failed' }]
        })
      )
    })
    render(<WatchlistPage />)

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'NVDA' } })
    fireEvent.click(screen.getByTestId('watchlist-add-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Database write failed')
  })

  it('falls back to a generic alert when a failed add carries no detail', async () => {
    mockAddMutate.mockImplementation((_payload, opts) => {
      opts.onError(apiError(500, {}))
    })
    render(<WatchlistPage />)

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'NVDA' } })
    fireEvent.click(screen.getByTestId('watchlist-add-submit'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add the ticker — please try again.'
    )
  })

  it('rejects a would-own-below price that contains a thousands separator', async () => {
    render(<WatchlistPage />)

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'NVDA' } })
    fireEvent.click(screen.getByText('Would own below'))
    fireEvent.change(screen.getByPlaceholderText('38.00'), { target: { value: '1,000' } })
    fireEvent.click(screen.getByTestId('watchlist-add-submit'))

    expect(await screen.findByText('Enter a dollar amount greater than 0')).toBeInTheDocument()
    expect(mockAddMutate).not.toHaveBeenCalled()
  })

  it('caps the thesis textarea at the displayed 500-character limit', () => {
    render(<WatchlistPage />)

    expect(screen.getByLabelText('Thesis (optional)')).toHaveAttribute('maxlength', '500')
  })
})

describe('WatchlistPage — remove errors', () => {
  it('surfaces an alert when the remove mutation fails', () => {
    setWatchlist([entry({ ticker: 'AAPL' })])
    mockUseRemoveFromWatchlist.mockReturnValue({
      mutate: mockRemoveMutate,
      isPending: false,
      isError: true,
      error: apiError(400, {
        detail: [{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }]
      }),
      isSuccess: false,
      reset: vi.fn()
    } as unknown as ReturnType<typeof useRemoveFromWatchlist>)
    render(<WatchlistPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('AAPL is not on the watchlist')
  })
})

describe('WatchlistPage — empty state', () => {
  it('renders empty-state guidance about enabling the screener', () => {
    setWatchlist([])
    render(<WatchlistPage />)

    expect(screen.getByText('No tickers yet')).toBeInTheDocument()
    expect(screen.getByText(/screener/i)).toBeInTheDocument()
    expect(screen.queryAllByTestId('watchlist-ticker')).toHaveLength(0)
  })
})
