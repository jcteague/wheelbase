// [US-104] The Roll Short Call sheet: the portal dialog, the mutation, and where a rejected
// roll's server errors land.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createPortal } from 'react-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { apiError } from '../api/error'
import type { ApiError, RollPmccShortCallResponse } from '../api/positions'
import { useRollPmccShortCall } from '../hooks/useRollPmccShortCall'
import { OPEN_LEAPS, OPEN_SHORT, PMCC_ID, UP_OUT_RESPONSE } from '../test-fixtures/pmcc-roll'
import { RollPmccShortCallSheet } from './RollPmccShortCallSheet'

vi.mock('../hooks/useRollPmccShortCall')
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onChange
  }: {
    id?: string
    value?: string
    onChange: (value: string) => void
  }) => (
    <>
      <input id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
      {/* Stands in for Radix's PopoverContent: a React child portalled to document.body. */}
      {createPortal(<button data-testid={`${id}-popover`}>day</button>, document.body)}
    </>
  )
}))

const TODAY = '2026-11-06'

type MutateCallbacks = {
  onError?: (error: ApiError) => void
  onSettled?: () => void
}

const mockMutate = vi.fn()
const mockUseRollPmccShortCall = vi.mocked(useRollPmccShortCall)
let hookOnSuccess: ((data: RollPmccShortCallResponse) => void) | undefined

function mockHook(isPending = false): void {
  mockUseRollPmccShortCall.mockImplementation((options) => {
    hookOnSuccess = options?.onSuccess
    return { mutate: mockMutate, isPending } as unknown as ReturnType<typeof useRollPmccShortCall>
  })
}

const onClose = vi.fn()
const onRecorded = vi.fn()

function renderSheet(): void {
  render(
    <RollPmccShortCallSheet
      positionId={PMCC_ID}
      ticker="XYZ"
      openShort={OPEN_SHORT}
      leaps={OPEN_LEAPS}
      basisPerShare="21.2000"
      effectiveShareCost="101.2000"
      today={TODAY}
      onClose={onClose}
      onRecorded={onRecorded}
    />
  )
}

const input = (id: string): HTMLInputElement => {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input #${id}`)
  return el
}

function fieldOf(id: string): HTMLElement {
  const el = input(id).closest('.flex.flex-col')
  if (!(el instanceof HTMLElement)) throw new Error(`no field for #${id}`)
  return el
}

async function fillUpOut(): Promise<void> {
  const user = userEvent.setup()
  await user.type(input('pmcc-roll-cost-to-close'), '3.00')
  await user.type(input('pmcc-roll-strike'), '112')
  await user.type(input('pmcc-roll-premium'), '2.40')
  await user.type(input('pmcc-roll-expiration'), '2026-12-18')
}

const confirm = (): HTMLElement => screen.getByTestId('pmcc-roll-confirm')

async function submitUpOut(): Promise<void> {
  renderSheet()
  await fillUpOut()
  await waitFor(() => expect(confirm()).toBeEnabled())
  await userEvent.click(confirm())
  await waitFor(() => expect(mockMutate).toHaveBeenCalled())
}

function rejectWith(error: ApiError): void {
  mockMutate.mockImplementation((_payload: unknown, callbacks?: MutateCallbacks) => {
    callbacks?.onError?.(error)
    callbacks?.onSettled?.()
  })
}

const fieldError = (field: string, message: string): ApiError =>
  apiError(400, { detail: [{ field, code: 'test', message }] })

const SAVE_FAILED = 'Could not record the roll. Your entries are preserved. Try again.'

beforeEach(() => {
  mockMutate.mockReset()
  onClose.mockReset()
  onRecorded.mockReset()
  hookOnSuccess = undefined
  mockHook()
})

describe('RollPmccShortCallSheet — dialog', () => {
  it('renders a dialog named Roll Short Call', () => {
    renderSheet()
    expect(screen.getByRole('dialog', { name: 'Roll Short Call' })).toBeInTheDocument()
  })

  it('Escape closes the sheet', async () => {
    renderSheet()
    screen.getByRole('dialog').focus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('leaves Escape inside a portalled date-picker popover to the popover', () => {
    renderSheet()
    const popover = screen.getByTestId('pmcc-roll-expiration-popover')
    expect(screen.getByRole('dialog')).not.toContainElement(popover)

    fireEvent.keyDown(popover, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clicking the scrim closes the sheet', async () => {
    renderSheet()
    await userEvent.click(screen.getByTestId('sheet-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('RollPmccShortCallSheet — submit', () => {
  it('a valid roll mutates with the payload built from the form', async () => {
    await submitUpOut()
    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockMutate.mock.calls[0][0]).toEqual({
      positionId: PMCC_ID,
      costToClosePerContract: 3,
      newPremiumPerContract: 2.4,
      newStrike: 112,
      newExpiration: '2026-12-18',
      fillDate: TODAY
    })
  })

  it('passes the recorded response to onRecorded on success', async () => {
    mockMutate.mockImplementation(() => hookOnSuccess?.(UP_OUT_RESPONSE))
    await submitUpOut()
    expect(onRecorded).toHaveBeenCalledWith(UP_OUT_RESPONSE)
  })

  it('a double click records once', async () => {
    renderSheet()
    await fillUpOut()
    await waitFor(() => expect(confirm()).toBeEnabled())
    await userEvent.dblClick(confirm())
    await waitFor(() => expect(mockMutate).toHaveBeenCalled())
    expect(mockMutate).toHaveBeenCalledTimes(1)
  })

  it('while pending the confirm reads Recording… and ignores clicks', async () => {
    mockHook(true)
    renderSheet()
    await fillUpOut()
    expect(confirm()).toHaveTextContent('Recording…')
    expect(confirm()).toBeDisabled()
    await userEvent.click(confirm())
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

describe('RollPmccShortCallSheet — fill date rule', () => {
  it('a fill date before the open short call was filled is rejected and blocks confirm', async () => {
    renderSheet()
    await fillUpOut()
    await waitFor(() => expect(confirm()).toBeEnabled())

    fireEvent.change(input('pmcc-roll-fill-date'), { target: { value: '2026-10-18' } })

    await waitFor(() =>
      expect(fieldOf('pmcc-roll-fill-date')).toHaveTextContent(
        'Fill date cannot be before the short call open date'
      )
    )
    expect(confirm()).toBeDisabled()
  })
})

describe('RollPmccShortCallSheet — server errors', () => {
  it('a newExpiration error lands beside the expiration', async () => {
    rejectWith(fieldError('newExpiration', 'Short call must expire before the LEAPS call.'))
    await submitUpOut()
    await waitFor(() =>
      expect(fieldOf('pmcc-roll-expiration')).toHaveTextContent(
        'Short call must expire before the LEAPS call.'
      )
    )
  })

  it('a fillDate error lands beside the fill date', async () => {
    rejectWith(fieldError('fillDate', 'Fill date cannot be before the short call open date'))
    await submitUpOut()
    await waitFor(() =>
      expect(fieldOf('pmcc-roll-fill-date')).toHaveTextContent(
        'Fill date cannot be before the short call open date'
      )
    )
    expect(screen.queryByTestId('pmcc-roll-save-error')).not.toBeInTheDocument()
  })

  it('a __roll__ error lands on the no-change alert', async () => {
    rejectWith(fieldError('__roll__', 'Roll must change the strike, the expiration, or both'))
    await submitUpOut()
    expect(await screen.findByTestId('pmcc-roll-no-change')).toHaveTextContent(
      'Roll must change the strike, the expiration, or both'
    )
  })

  it('a costToClosePerContract error lands beside the cost to close', async () => {
    rejectWith(fieldError('costToClosePerContract', 'Cost to close must be greater than zero'))
    await submitUpOut()
    await waitFor(() =>
      expect(fieldOf('pmcc-roll-cost-to-close')).toHaveTextContent(
        'Cost to close must be greater than zero'
      )
    )
  })

  it.each(['__root__', '__phase__'])(
    'a %s error shows its own message in the save alert',
    async (field) => {
      rejectWith(fieldError(field, 'This PMCC has no open short call to roll.'))
      await submitUpOut()
      const alert = await screen.findByTestId('pmcc-roll-save-error')
      expect(alert).toHaveTextContent('This PMCC has no open short call to roll.')
      expect(alert).not.toHaveTextContent(SAVE_FAILED)
    }
  )

  it('a fill date after the current expiration lands beside the fill date', async () => {
    rejectWith(fieldError('fillDate', 'Fill date cannot be after the short call expiration date'))
    await submitUpOut()
    await waitFor(() =>
      expect(fieldOf('pmcc-roll-fill-date')).toHaveTextContent(
        'Fill date cannot be after the short call expiration date'
      )
    )
    expect(screen.queryByTestId('pmcc-roll-save-error')).not.toBeInTheDocument()
  })

  it('a newPremiumPerContract error lands beside the premium', async () => {
    rejectWith(fieldError('newPremiumPerContract', 'Replacement premium must be greater than zero'))
    await submitUpOut()
    await waitFor(() =>
      expect(fieldOf('pmcc-roll-premium')).toHaveTextContent(
        'Replacement premium must be greater than zero'
      )
    )
  })

  it('a newStrike error lands beside the strike', async () => {
    rejectWith(fieldError('newStrike', 'Strike must be positive'))
    await submitUpOut()
    await waitFor(() =>
      expect(fieldOf('pmcc-roll-strike')).toHaveTextContent('Strike must be positive')
    )
  })

  it('a non-field failure shows the save alert', async () => {
    rejectWith(apiError(500, 'boom'))
    await submitUpOut()
    expect(await screen.findByTestId('pmcc-roll-save-error')).toHaveTextContent(SAVE_FAILED)
  })

  it('keeps the draft after a failure', async () => {
    rejectWith(apiError(500, 'boom'))
    await submitUpOut()
    await screen.findByTestId('pmcc-roll-save-error')
    expect(input('pmcc-roll-cost-to-close')).toHaveValue('3.00')
    expect(input('pmcc-roll-strike')).toHaveValue('112')
    expect(input('pmcc-roll-premium')).toHaveValue('2.40')
    expect(input('pmcc-roll-expiration')).toHaveValue('2026-12-18')
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('allows a retry after a failure', async () => {
    rejectWith(apiError(500, 'boom'))
    await submitUpOut()
    await screen.findByTestId('pmcc-roll-save-error')
    await userEvent.click(confirm())
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2))
  })
})
