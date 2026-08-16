// [US-67] Screening-criteria sheet — the single editing surface behind all three
// Screener entry points. Covers pre-fill from the persisted criteria, the two
// cross-field band rules gating "Save & re-screen", the two optional toggles,
// "Reset to defaults", all three dismissal paths, and the save round trip.

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ScreeningCriteria } from '../api/screening-criteria'
import { useSaveScreeningCriteria } from '../hooks/useScreeningCriteria'
import { ScreeningCriteriaSheet } from './ScreeningCriteriaSheet'

vi.mock('../hooks/useScreeningCriteria')

const mockMutate = vi.fn()
const mockUseSaveScreeningCriteria = vi.mocked(useSaveScreeningCriteria)
const onClose = vi.fn()

// The story's Background: delta 0.20–0.30, DTE 30–45, OI 500, spread 10%,
// price ceiling off, IV-rank floor off, earnings "Exclude".
const PERSISTED: ScreeningCriteria = {
  deltaMin: '0.20',
  deltaMax: '0.30',
  dteMin: 30,
  dteMax: 45,
  minOpenInterest: 500,
  maxSpreadPercent: '10',
  maxSpreadAbsolute: '0.10',
  maxUnderlyingPrice: null,
  minIvRank: null,
  earningsHandling: 'exclude'
}

// A saved-away-from-defaults document: both optionals enabled and earnings
// flipped, so "Reset to defaults" has something to undo.
const PERSISTED_OPTIONALS_ON: ScreeningCriteria = {
  ...PERSISTED,
  deltaMin: '0.15',
  deltaMax: '0.25',
  dteMin: 20,
  dteMax: 40,
  minOpenInterest: 800,
  maxSpreadPercent: '8',
  maxUnderlyingPrice: '75',
  minIvRank: '30',
  earningsHandling: 'flag'
}

function renderSheet(criteria: ScreeningCriteria = PERSISTED): void {
  render(<ScreeningCriteriaSheet open criteria={criteria} onClose={onClose} />)
}

const saveButton = (): HTMLElement => screen.getByRole('button', { name: 'Save & re-screen' })

// The sheet may hand its success/error callbacks to the mutation hook itself or
// to `mutate(payload, { ... })`; either wiring satisfies the behaviour, so the
// helpers below accept both and fail loudly when neither is present.
function mutationCallback(name: 'onSuccess' | 'onError'): (arg: never) => void {
  const fromHook = mockUseSaveScreeningCriteria.mock.calls.at(-1)?.[0] as
    | Record<string, ((arg: never) => void) | undefined>
    | undefined
  const fromMutate = mockMutate.mock.calls.at(-1)?.[1] as
    | Record<string, ((arg: never) => void) | undefined>
    | undefined
  const callback = fromHook?.[name] ?? fromMutate?.[name]
  expect(callback).toBeTypeOf('function')
  return callback as (arg: never) => void
}

beforeEach(() => {
  mockMutate.mockReset()
  onClose.mockReset()
  mockUseSaveScreeningCriteria.mockReturnValue({
    mutate: mockMutate,
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useSaveScreeningCriteria>)
})

it('renders nothing when open is false', () => {
  render(<ScreeningCriteriaSheet open={false} criteria={PERSISTED} onClose={onClose} />)
  expect(screen.queryByText('Screening Criteria')).not.toBeInTheDocument()
})

it('renders the "Screener" eyebrow and "Screening Criteria" title when open', () => {
  renderSheet()
  expect(screen.getByText('Screener')).toBeInTheDocument()
  expect(screen.getByText('Screening Criteria')).toBeInTheDocument()
})

it('pre-fills every field from the persisted criteria', () => {
  renderSheet()

  expect(screen.getByLabelText('Minimum delta')).toHaveValue('0.20')
  expect(screen.getByLabelText('Maximum delta')).toHaveValue('0.30')
  expect(screen.getByLabelText('Minimum DTE')).toHaveValue('30')
  expect(screen.getByLabelText('Maximum DTE')).toHaveValue('45')
  expect(screen.getByLabelText('Minimum open interest')).toHaveValue('500')
  expect(screen.getByLabelText('Max bid-ask spread')).toHaveValue('10')
  expect(screen.getByTestId('price-ceiling-off')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('iv-rank-floor-off')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('earnings-exclude')).toHaveAttribute('aria-pressed', 'true')
})

it('pre-fills the optional inputs and the earnings segment when they are enabled', () => {
  renderSheet(PERSISTED_OPTIONALS_ON)

  expect(screen.getByTestId('price-ceiling-on')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Price ceiling')).toHaveValue('75')
  expect(screen.getByTestId('iv-rank-floor-on')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('IV-rank floor')).toHaveValue('30')
  expect(screen.getByTestId('earnings-flag')).toHaveAttribute('aria-pressed', 'true')
})

it('shows the inverted-band error and disables Save & re-screen for a delta band of 0.30–0.20', async () => {
  const user = userEvent.setup()
  renderSheet()

  const max = screen.getByLabelText('Maximum delta')
  await user.clear(max)
  await user.type(max, '0.10')

  expect(
    await screen.findByText('Minimum delta must be less than maximum delta')
  ).toBeInTheDocument()
  await waitFor(() => expect(saveButton()).toBeDisabled())
})

it('shows the inverted-window error and disables Save & re-screen for a DTE window of 45–30', async () => {
  const user = userEvent.setup()
  renderSheet()

  const max = screen.getByLabelText('Maximum DTE')
  await user.clear(max)
  await user.type(max, '20')

  expect(await screen.findByText('Minimum DTE must be less than maximum DTE')).toBeInTheDocument()
  await waitFor(() => expect(saveButton()).toBeDisabled())
})

it('disables the price-ceiling input while the toggle is Off and enables it when switched On', async () => {
  const user = userEvent.setup()
  renderSheet()

  expect(screen.getByLabelText('Price ceiling')).toBeDisabled()

  await user.click(screen.getByTestId('price-ceiling-on'))

  await waitFor(() => expect(screen.getByLabelText('Price ceiling')).toBeEnabled())
})

it('disables the IV-rank input while the toggle is Off and enables it when switched On', async () => {
  const user = userEvent.setup()
  renderSheet()

  expect(screen.getByLabelText('IV-rank floor')).toBeDisabled()

  await user.click(screen.getByTestId('iv-rank-floor-on'))

  await waitFor(() => expect(screen.getByLabelText('IV-rank floor')).toBeEnabled())
})

it('restores every field to its shipped default when Reset to defaults is clicked', async () => {
  const user = userEvent.setup()
  renderSheet(PERSISTED_OPTIONALS_ON)

  await user.click(await screen.findByRole('button', { name: 'Reset to defaults' }))

  await waitFor(() => expect(screen.getByLabelText('Minimum delta')).toHaveValue('0.20'))
  expect(screen.getByLabelText('Maximum delta')).toHaveValue('0.30')
  expect(screen.getByLabelText('Minimum DTE')).toHaveValue('30')
  expect(screen.getByLabelText('Maximum DTE')).toHaveValue('45')
  expect(screen.getByLabelText('Minimum open interest')).toHaveValue('500')
  expect(screen.getByLabelText('Max bid-ask spread')).toHaveValue('10')
  expect(screen.getByTestId('price-ceiling-off')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('iv-rank-floor-off')).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('earnings-exclude')).toHaveAttribute('aria-pressed', 'true')
})

it('does not persist anything when Reset to defaults is clicked', async () => {
  const user = userEvent.setup()
  renderSheet(PERSISTED_OPTIONALS_ON)

  await user.click(await screen.findByRole('button', { name: 'Reset to defaults' }))

  expect(mockMutate).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

it('closes without saving when Cancel is clicked', async () => {
  const user = userEvent.setup()
  renderSheet()

  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mockMutate).not.toHaveBeenCalled()
})

it('closes without saving when the close button is clicked', async () => {
  const user = userEvent.setup()
  renderSheet()

  await user.click(screen.getByRole('button', { name: 'Close sheet' }))

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mockMutate).not.toHaveBeenCalled()
})

it('closes without saving when the scrim is clicked', async () => {
  const user = userEvent.setup()
  renderSheet()

  await user.click(screen.getByTestId('sheet-scrim'))

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mockMutate).not.toHaveBeenCalled()
})

it('saves the exact toPayload shape when valid values are submitted', async () => {
  const user = userEvent.setup()
  renderSheet()

  const deltaMin = screen.getByLabelText('Minimum delta')
  await user.clear(deltaMin)
  await user.type(deltaMin, '0.15')

  const deltaMax = screen.getByLabelText('Maximum delta')
  await user.clear(deltaMax)
  await user.type(deltaMax, '0.20')

  const dteMin = screen.getByLabelText('Minimum DTE')
  await user.clear(dteMin)
  await user.type(dteMin, '40')

  await user.click(saveButton())

  await waitFor(() => expect(mockMutate).toHaveBeenCalled())
  expect(mockMutate.mock.calls[0][0]).toEqual({
    deltaMin: '0.15',
    deltaMax: '0.20',
    dteMin: 40,
    dteMax: 45,
    minOpenInterest: 500,
    maxSpreadPercent: '10',
    maxUnderlyingPrice: null,
    minIvRank: null,
    earningsHandling: 'exclude'
  })
})

it('closes the sheet once the save succeeds', async () => {
  const user = userEvent.setup()
  renderSheet()

  await user.click(saveButton())
  await waitFor(() => expect(mockMutate).toHaveBeenCalled())

  expect(onClose).not.toHaveBeenCalled()

  const saved: ScreeningCriteria = { ...PERSISTED }
  await act(async () => {
    mutationCallback('onSuccess')(saved as never)
  })

  expect(onClose).toHaveBeenCalledTimes(1)
})

it('binds a field error returned by the mutation to that field', async () => {
  const user = userEvent.setup()
  renderSheet()

  await user.click(saveButton())
  await waitFor(() => expect(mockMutate).toHaveBeenCalled())

  // The form was valid, so this message can only come from the mutation's
  // field error being bound onto deltaMax via setError.
  expect(
    screen.queryByText('Minimum delta must be less than maximum delta')
  ).not.toBeInTheDocument()

  await act(async () => {
    mutationCallback('onError')({
      status: 400,
      body: {
        detail: [
          {
            field: 'deltaMax',
            code: 'inverted_band',
            message: 'Minimum delta must be less than maximum delta'
          }
        ]
      }
    } as never)
  })

  expect(
    await screen.findByText('Minimum delta must be less than maximum delta')
  ).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  // A field error the sheet can bind inline is not also repeated as a
  // form-level alert — one failure, one message.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

// A failed save must never be silent: whatever the envelope carries, the trader
// sees something and the sheet stays open so the save can be retried.
async function failSaveWith(body: unknown): Promise<void> {
  const user = userEvent.setup()
  renderSheet()

  await user.click(saveButton())
  await waitFor(() => expect(mockMutate).toHaveBeenCalled())

  await act(async () => {
    mutationCallback('onError')({ status: 500, body } as never)
  })
}

it('surfaces a form-level alert and keeps the sheet open when the save fails with a non-field error', async () => {
  await failSaveWith({
    detail: [
      {
        field: '__root__',
        code: 'internal_error',
        message: 'Could not save screening criteria.'
      }
    ]
  })

  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save screening criteria.')
  expect(onClose).not.toHaveBeenCalled()
})

it('surfaces a form-level alert for a payload field the sheet has no input for', async () => {
  await failSaveWith({
    detail: [
      {
        field: 'earningsHandling',
        code: 'invalid_enum',
        message: 'Earnings handling must be Exclude or Flag only.'
      }
    ]
  })

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Earnings handling must be Exclude or Flag only.'
  )
  expect(onClose).not.toHaveBeenCalled()
})

it('surfaces a fallback form-level alert when the failure carries no usable detail', async () => {
  await failSaveWith(null)

  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
})
