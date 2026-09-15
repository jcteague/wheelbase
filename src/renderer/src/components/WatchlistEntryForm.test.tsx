import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAddMutate, mockUpdateMutate, mockUseAdd, mockUseUpdate } = vi.hoisted(() => ({
  mockAddMutate: vi.fn(),
  mockUpdateMutate: vi.fn(),
  mockUseAdd: vi.fn(),
  mockUseUpdate: vi.fn()
}))

vi.mock('../hooks/useAddToWatchlist', () => ({ useAddToWatchlist: mockUseAdd }))
vi.mock('../hooks/useUpdateWatchlistEntry', () => ({ useUpdateWatchlistEntry: mockUseUpdate }))

import { type ApiError, apiError } from '../api/error'
import { entry } from './bench-test-utils'
import { WatchlistEntryForm } from './WatchlistEntryForm'

// [US-69] One form, two modes. Add mode is US-63's form unchanged — its ids and test ids
// are load-bearing for `e2e/watchlist.spec.ts`, so the first block here is a regression
// guard as much as a specification. Edit mode seeds from an entry and fixes the ticker.

const AAPL = {
  ticker: 'AAPL',
  notes: 'Would own below $170',
  ownBelowPrice: '170.0000',
  ivrTrigger: null,
  postEarningsOnly: false,
  coreHolding: false,
  addedAt: '2026-09-01T14:00:00.000Z'
}

function failure(detail?: unknown[]): ApiError {
  return apiError(400, detail === undefined ? {} : { detail })
}

describe('WatchlistEntryForm', () => {
  beforeEach(() => {
    mockAddMutate.mockReset()
    mockUpdateMutate.mockReset()
    mockUseAdd.mockReturnValue({ mutate: mockAddMutate, isPending: false })
    mockUseUpdate.mockReturnValue({ mutate: mockUpdateMutate, isPending: false })
  })

  describe('add mode', () => {
    it('renders the add heading, a ticker input, and no cancel button', () => {
      render(<WatchlistEntryForm />)

      expect(screen.getByText('Add to watchlist')).toBeTruthy()
      expect(document.querySelector('#ticker')).toBeTruthy()
      expect(screen.queryByTestId('watchlist-edit-cancel')).toBeNull()
      expect(screen.getByTestId('watchlist-add-submit')).toHaveTextContent('Add ticker')
    })

    it('submits through the add mutation', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByTestId('watchlist-add-submit'))

      await waitFor(() => expect(mockAddMutate).toHaveBeenCalledTimes(1))
      expect(mockAddMutate.mock.calls[0][0]).toMatchObject({ ticker: 'NVDA' })
      expect(mockUpdateMutate).not.toHaveBeenCalled()
    })

    it('opens a condition from its chip and submits the typed value', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByRole('button', { name: '+Would own below' }))
      await userEvent.type(document.querySelector('#ownBelowPrice') as HTMLInputElement, '38')
      await userEvent.click(screen.getByRole('button', { name: '+Wait for high IV' }))
      await userEvent.type(document.querySelector('#ivrTrigger') as HTMLInputElement, '50')
      await userEvent.click(screen.getByTestId('watchlist-add-submit'))

      await waitFor(() => expect(mockAddMutate).toHaveBeenCalledTimes(1))
      expect(mockAddMutate.mock.calls[0][0]).toMatchObject({
        ticker: 'NVDA',
        ownBelowPrice: 38,
        ivrTrigger: 50
      })
    })

    it('fills the IVR trigger from a preset', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.click(screen.getByRole('button', { name: '+Wait for high IV' }))
      await userEvent.click(screen.getByRole('button', { name: '70' }))

      expect(document.querySelector<HTMLInputElement>('#ivrTrigger')?.value).toBe('70')
    })

    it('closes a condition row and drops its value when removed', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByRole('button', { name: '+Would own below' }))
      await userEvent.type(document.querySelector('#ownBelowPrice') as HTMLInputElement, '38')
      await userEvent.click(
        within(screen.getByText('Would own below').parentElement as HTMLElement).getByTitle(
          'Remove condition'
        )
      )

      expect(document.querySelector('#ownBelowPrice')).toBeNull()

      await userEvent.click(screen.getByTestId('watchlist-add-submit'))

      await waitFor(() => expect(mockAddMutate).toHaveBeenCalledTimes(1))
      // `null`, not `undefined`: one payload shape for both channels, and the service
      // stores an absent condition the same either way.
      expect(mockAddMutate.mock.calls[0][0]).toMatchObject({ ownBelowPrice: null })
    })

    it('toggles the flag chips', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByRole('button', { name: '+Post-earnings only' }))
      await userEvent.click(screen.getByRole('button', { name: '+Core holding' }))

      expect(screen.getByRole('button', { name: '✓Post-earnings only' })).toBeTruthy()

      await userEvent.click(screen.getByTestId('watchlist-add-submit'))

      await waitFor(() => expect(mockAddMutate).toHaveBeenCalledTimes(1))
      expect(mockAddMutate.mock.calls[0][0]).toMatchObject({
        postEarningsOnly: true,
        coreHolding: true
      })
    })

    it('states an invalid condition value inside its own row', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByRole('button', { name: '+Would own below' }))
      await userEvent.type(document.querySelector('#ownBelowPrice') as HTMLInputElement, '0')
      await userEvent.click(screen.getByTestId('watchlist-add-submit'))

      await waitFor(() =>
        expect(screen.getByText('Enter a dollar amount greater than 0')).toBeTruthy()
      )
      expect(mockAddMutate).not.toHaveBeenCalled()
    })

    it('clears the form and closes both condition rows once the add succeeds', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByRole('button', { name: '+Would own below' }))
      await userEvent.type(document.querySelector('#ownBelowPrice') as HTMLInputElement, '38')
      await userEvent.click(screen.getByTestId('watchlist-add-submit'))

      await waitFor(() => expect(mockAddMutate).toHaveBeenCalledTimes(1))
      const options = mockAddMutate.mock.calls[0][1] as { onSuccess: () => void }
      act(() => options.onSuccess())

      expect((screen.getByLabelText('Ticker') as HTMLInputElement).value).toBe('')
      expect(document.querySelector('#ownBelowPrice')).toBeNull()
    })

    // Add mode has a ticker input, so a ticker error belongs on it rather than in the
    // form-level alert the edit mode has to fall back to.
    it('binds a ticker error to the ticker input', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByTestId('watchlist-add-submit'))
      await waitFor(() => expect(mockAddMutate).toHaveBeenCalledTimes(1))

      const options = mockAddMutate.mock.calls[0][1] as { onError: (e: ApiError) => void }
      act(() =>
        options.onError(
          failure([
            { field: 'ticker', code: 'duplicate', message: 'NVDA is already on the watchlist' }
          ])
        )
      )

      await waitFor(() => expect(screen.getByText('NVDA is already on the watchlist')).toBeTruthy())
    })

    it('falls back to add-specific copy when the failure names no field', async () => {
      render(<WatchlistEntryForm />)

      await userEvent.type(screen.getByLabelText('Ticker'), 'NVDA')
      await userEvent.click(screen.getByTestId('watchlist-add-submit'))
      await waitFor(() => expect(mockAddMutate).toHaveBeenCalledTimes(1))

      const options = mockAddMutate.mock.calls[0][1] as { onError: (e: ApiError) => void }
      act(() => options.onError(failure()))

      await waitFor(() =>
        expect(screen.getByText('Could not add the ticker — please try again.')).toBeTruthy()
      )
    })
  })

  describe('edit mode', () => {
    it('names the stock in the heading and fixes the ticker rather than offering an input', () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      expect(screen.getByText('Edit AAPL')).toBeTruthy()
      expect(screen.getByTestId('watchlist-entry-ticker')).toHaveTextContent('AAPL')
      expect(screen.getByText('· ticker fixed')).toBeTruthy()
      expect(document.querySelector('#ticker')).toBeNull()
      expect(screen.queryByRole('textbox', { name: /ticker/i })).toBeNull()
    })

    it('seeds the thesis and its counter', () => {
      render(<WatchlistEntryForm entry={entry({ ...AAPL, notes: 'Would own below $170' })} />)

      expect(document.querySelector<HTMLTextAreaElement>('#thesis')?.value).toBe(
        'Would own below $170'
      )
      expect(screen.getByText('20 / 500')).toBeTruthy()
    })

    it('opens a seeded price condition and hides its chip', () => {
      render(<WatchlistEntryForm entry={entry({ ...AAPL, ownBelowPrice: '170.0000' })} />)

      expect(document.querySelector<HTMLInputElement>('#ownBelowPrice')?.value).toBe('170.00')
      expect(screen.queryByRole('button', { name: 'Would own below' })).toBeNull()
    })

    // Nothing constrains a stored price to 2dp — the add form accepts `170.125` and the
    // detail panel renders it in full. Seeding the input rounded would let a trader who
    // opened the form to fix a typo in the thesis silently rewrite their trading trigger.
    it('seeds a price condition that carries more than 2dp without rounding it', async () => {
      render(<WatchlistEntryForm entry={entry({ ...AAPL, ownBelowPrice: '170.1250' })} />)

      expect(document.querySelector<HTMLInputElement>('#ownBelowPrice')?.value).toBe('170.125')

      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))
      expect(mockUpdateMutate.mock.calls[0][0]).toMatchObject({ ownBelowPrice: 170.125 })
    })

    it('opens a seeded IVR condition with its presets', () => {
      render(<WatchlistEntryForm entry={entry({ ...AAPL, ivrTrigger: 50 })} />)

      expect(document.querySelector<HTMLInputElement>('#ivrTrigger')?.value).toBe('50')
      expect(screen.getByRole('button', { name: '30' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '70' })).toBeTruthy()
    })

    it('leaves an absent condition closed, offering its chip instead', () => {
      render(
        <WatchlistEntryForm entry={entry({ ...AAPL, ownBelowPrice: null, ivrTrigger: null })} />
      )

      expect(document.querySelector('#ownBelowPrice')).toBeNull()
      expect(document.querySelector('#ivrTrigger')).toBeNull()
      expect(screen.getByRole('button', { name: '+Would own below' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '+Wait for high IV' })).toBeTruthy()
    })

    it('seeds the flag chips as active', () => {
      render(
        <WatchlistEntryForm entry={entry({ ...AAPL, postEarningsOnly: true, coreHolding: true })} />
      )

      expect(screen.getByRole('button', { name: '✓Post-earnings only' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '✓Core holding' })).toBeTruthy()
    })

    it('offers Cancel and Save changes instead of Add ticker', () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      expect(screen.getByTestId('watchlist-edit-cancel')).toHaveTextContent('Cancel')
      expect(screen.getByTestId('watchlist-edit-submit')).toHaveTextContent('Save changes')
      expect(screen.queryByTestId('watchlist-add-submit')).toBeNull()
    })

    it('shows a pending label while the update is in flight', () => {
      mockUseUpdate.mockReturnValue({ mutate: mockUpdateMutate, isPending: true })
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      expect(screen.getByTestId('watchlist-edit-submit')).toHaveTextContent('Saving…')
    })

    it('submits every editable field as a full replacement', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      const thesis = document.querySelector('#thesis') as HTMLTextAreaElement
      await userEvent.clear(thesis)
      await userEvent.type(thesis, 'Would own below $165 after the split')
      const price = document.querySelector('#ownBelowPrice') as HTMLInputElement
      await userEvent.clear(price)
      await userEvent.type(price, '165')
      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))
      expect(mockUpdateMutate.mock.calls[0][0]).toEqual({
        ticker: 'AAPL',
        notes: 'Would own below $165 after the split',
        ownBelowPrice: 165,
        ivrTrigger: null,
        postEarningsOnly: false,
        coreHolding: false
      })
      expect(mockAddMutate).not.toHaveBeenCalled()
    })

    it('sends null for a cleared thesis', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      await userEvent.clear(document.querySelector('#thesis') as HTMLTextAreaElement)
      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))
      expect(mockUpdateMutate.mock.calls[0][0]).toMatchObject({ notes: null })
    })

    it('adds a condition that was not set before', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      await userEvent.click(screen.getByRole('button', { name: '+Wait for high IV' }))
      await userEvent.type(document.querySelector('#ivrTrigger') as HTMLInputElement, '50')
      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))
      expect(mockUpdateMutate.mock.calls[0][0]).toMatchObject({ ivrTrigger: 50 })
    })

    it('removes one condition while leaving the other in place', async () => {
      render(
        <WatchlistEntryForm entry={entry({ ...AAPL, ownBelowPrice: '170.0000', ivrTrigger: 50 })} />
      )

      const ivrRow = screen.getByText('Wait for high IV').parentElement as HTMLElement
      await userEvent.click(within(ivrRow).getByTitle('Remove condition'))
      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))
      expect(mockUpdateMutate.mock.calls[0][0]).toMatchObject({
        ivrTrigger: null,
        ownBelowPrice: 170
      })
    })

    it('rejects an over-length thesis client-side and never calls the mutation', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      const thesis = document.querySelector('#thesis') as HTMLTextAreaElement
      await userEvent.clear(thesis)
      // `paste` rather than `type`: 501 keystrokes is pointlessly slow, and the bound is
      // what is under test, not the typing.
      await userEvent.click(thesis)
      await userEvent.paste('a'.repeat(501))
      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))

      await waitFor(() =>
        expect(screen.getByText('Note must be 500 characters or fewer')).toBeTruthy()
      )
      const counter = screen.getByText('501 / 500')
      expect(counter.className).toContain('text-wb-red')
      expect(mockUpdateMutate).not.toHaveBeenCalled()
    })

    // The resolver measures the trimmed thesis, so the counter must too — otherwise a
    // paste that trims back under the bound reads red beside a form that saves fine.
    it('counts the thesis the way the resolver measures it', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      const thesis = document.querySelector('#thesis') as HTMLTextAreaElement
      await userEvent.clear(thesis)
      await userEvent.click(thesis)
      await userEvent.paste(`${'a'.repeat(498)}     `)

      expect(screen.getByText('498 / 500')).toBeTruthy()

      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))

      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))
      expect(mockUpdateMutate.mock.calls[0][0]).toMatchObject({ notes: 'a'.repeat(498) })
    })

    it('invokes onSaved when the update succeeds', async () => {
      const onSaved = vi.fn()
      render(<WatchlistEntryForm entry={entry(AAPL)} onSaved={onSaved} />)

      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))

      const options = mockUpdateMutate.mock.calls[0][1] as { onSuccess: () => void }
      options.onSuccess()

      expect(onSaved).toHaveBeenCalledTimes(1)
    })

    it('invokes onCancel without mutating', async () => {
      const onCancel = vi.fn()
      render(<WatchlistEntryForm entry={entry(AAPL)} onCancel={onCancel} />)

      await userEvent.click(screen.getByTestId('watchlist-edit-cancel'))

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(mockUpdateMutate).not.toHaveBeenCalled()
      expect(mockAddMutate).not.toHaveBeenCalled()
    })

    // There is no ticker input in edit mode, so a ticker-field error has nothing to bind
    // to. Routing it to the form alert is what keeps it from failing silently.
    it('surfaces a ticker error as a form-level alert', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))

      const options = mockUpdateMutate.mock.calls[0][1] as { onError: (e: ApiError) => void }
      options.onError(
        failure([{ field: 'ticker', code: 'not_found', message: 'AAPL is not on the watchlist' }])
      )

      await waitFor(() => expect(screen.getByText('AAPL is not on the watchlist')).toBeTruthy())
    })

    // A preload `invoke` that rejects outright — channel gone, serialization failure —
    // carries no envelope at all. Reading `.detail` off nothing would throw inside the
    // error handler, so the save would fail with the form showing nothing.
    it('survives a rejection that carries no envelope body', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))

      const options = mockUpdateMutate.mock.calls[0][1] as { onError: (e: ApiError) => void }
      act(() => options.onError({ status: 500, body: undefined }))

      await waitFor(() =>
        expect(screen.getByText('Could not save the changes — please try again.')).toBeTruthy()
      )
    })

    it('falls back to edit-specific copy when the failure names no field', async () => {
      render(<WatchlistEntryForm entry={entry(AAPL)} />)

      await userEvent.click(screen.getByTestId('watchlist-edit-submit'))
      await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalledTimes(1))

      const options = mockUpdateMutate.mock.calls[0][1] as { onError: (e: ApiError) => void }
      options.onError(failure())

      await waitFor(() =>
        expect(screen.getByText('Could not save the changes — please try again.')).toBeTruthy()
      )
    })
  })
})
