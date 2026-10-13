// [US-105] The Roll LEAPS sheet: the portal dialog, the mutation, and where a rejected roll's
// server errors land.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createPortal } from 'react-dom'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { apiError } from '../api/error'
import type { ApiError, LegDetail, RollPmccLeapsResponse } from '../api/positions'
import { useRollPmccLeaps } from '../hooks/useRollPmccLeaps'
import { getSheetPortal } from '../lib/portal'
import {
  LEAPS_LEDGER,
  LEAPS_LEG,
  LEAPS_OPEN_SHORT,
  LEAPS_PMCC_ID,
  LEAPS_TODAY as TODAY,
  LEAPS_UP_OUT_RESPONSE,
  LEAPS_LAST_EVENT_DATE
} from '../test-fixtures/pmcc-leaps-roll'
import { RollPmccLeapsSheet } from './RollPmccLeapsSheet'

vi.mock('../hooks/useRollPmccLeaps')
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

type MutateCallbacks = {
  onError?: (error: ApiError) => void
  onSettled?: () => void
}

const mockMutate = vi.fn()
const mockUseRollPmccLeaps = vi.mocked(useRollPmccLeaps)
let hookOnSuccess: ((data: RollPmccLeapsResponse) => void) | undefined

function mockHook(isPending = false): void {
  mockUseRollPmccLeaps.mockImplementation((options) => {
    hookOnSuccess = options?.onSuccess
    return { mutate: mockMutate, isPending } as unknown as ReturnType<typeof useRollPmccLeaps>
  })
}

const onClose = vi.fn()
const onRecorded = vi.fn()

function renderSheet(openShort: LegDetail | null = LEAPS_OPEN_SHORT): void {
  render(
    <RollPmccLeapsSheet
      positionId={LEAPS_PMCC_ID}
      ticker="XYZ"
      leaps={LEAPS_LEG}
      openShort={openShort}
      lastEventDate={LEAPS_LAST_EVENT_DATE}
      ledger={LEAPS_LEDGER}
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
  await user.type(input('pmcc-leaps-roll-proceeds'), '26.00')
  await user.clear(input('pmcc-leaps-roll-strike'))
  await user.type(input('pmcc-leaps-roll-strike'), '85')
  await user.type(input('pmcc-leaps-roll-debit'), '23.50')
  await user.type(input('pmcc-leaps-roll-expiration'), '2028-01-21')
}

const confirm = (): HTMLElement => screen.getByTestId('pmcc-leaps-roll-confirm')

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

describe('RollPmccLeapsSheet — dialog', () => {
  it('renders a dialog named Roll LEAPS in the sheet portal', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Roll LEAPS' })
    expect(getSheetPortal()).toContainElement(dialog)
  })

  it('Escape closes the sheet', async () => {
    renderSheet()
    screen.getByRole('dialog').focus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores keys other than Escape', () => {
    renderSheet()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('leaves Escape inside a portalled date-picker popover to the popover', () => {
    renderSheet()
    const popover = screen.getByTestId('pmcc-leaps-roll-expiration-popover')
    expect(screen.getByRole('dialog')).not.toContainElement(popover)

    fireEvent.keyDown(popover, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking the scrim closes the sheet', async () => {
    renderSheet()
    await userEvent.click(screen.getByTestId('sheet-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('RollPmccLeapsSheet — submit', () => {
  it('a valid roll mutates with the payload built from the form', async () => {
    await submitUpOut()
    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockMutate.mock.calls[0][0]).toEqual({
      positionId: LEAPS_PMCC_ID,
      proceedsPerContract: 26,
      replacementDebitPerContract: 23.5,
      newStrike: 85,
      newExpiration: '2028-01-21',
      fillDate: TODAY
    })
  })

  it('passes the recorded response to onRecorded on success', async () => {
    mockMutate.mockImplementation(() => hookOnSuccess?.(LEAPS_UP_OUT_RESPONSE))
    await submitUpOut()
    expect(onRecorded).toHaveBeenCalledWith(LEAPS_UP_OUT_RESPONSE)
  })

  it('records a roll with no short call open', async () => {
    renderSheet(null)
    await fillUpOut()
    await waitFor(() => expect(confirm()).toBeEnabled())
    await userEvent.click(confirm())
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
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

describe('RollPmccLeapsSheet — server errors', () => {
  it.each([
    ['newExpiration', 'pmcc-leaps-roll-expiration', 'LEAPS call must expire after the short call.'],
    [
      'newStrike',
      'pmcc-leaps-roll-strike',
      'LEAPS strike must be below the short-call strike ($112.00).'
    ],
    [
      'proceedsPerContract',
      'pmcc-leaps-roll-proceeds',
      'Proceeds from close must be greater than zero'
    ],
    [
      'replacementDebitPerContract',
      'pmcc-leaps-roll-debit',
      'Replacement debit must be greater than zero'
    ]
  ])('a %s error lands beside its field', async (field, id, message) => {
    rejectWith(fieldError(field, message))
    await submitUpOut()
    await waitFor(() => expect(fieldOf(id)).toHaveTextContent(message))
    expect(screen.queryByTestId('pmcc-leaps-roll-save-error')).not.toBeInTheDocument()
  })

  it('a __roll__ error lands on the no-change alert', async () => {
    rejectWith(fieldError('__roll__', 'Roll must change the strike, the expiration, or both'))
    await submitUpOut()
    expect(await screen.findByTestId('pmcc-leaps-roll-no-change')).toHaveTextContent(
      'Roll must change the strike, the expiration, or both'
    )
  })

  it.each(['__root__', '__phase__'])(
    'a %s error shows its own message in the save alert',
    async (field) => {
      rejectWith(fieldError(field, 'Position is not in PMCC_OPEN phase'))
      await submitUpOut()
      const alert = await screen.findByTestId('pmcc-leaps-roll-save-error')
      expect(alert).toHaveTextContent('Position is not in PMCC_OPEN phase')
      expect(alert).not.toHaveTextContent(SAVE_FAILED)
    }
  )

  it('a non-field failure shows the save alert', async () => {
    rejectWith(apiError(500, 'boom'))
    await submitUpOut()
    expect(await screen.findByTestId('pmcc-leaps-roll-save-error')).toHaveTextContent(SAVE_FAILED)
  })

  it('keeps the draft after a failure', async () => {
    rejectWith(apiError(500, 'boom'))
    await submitUpOut()
    await screen.findByTestId('pmcc-leaps-roll-save-error')
    expect(input('pmcc-leaps-roll-proceeds')).toHaveValue('26.00')
    expect(input('pmcc-leaps-roll-strike')).toHaveValue('85')
    expect(input('pmcc-leaps-roll-debit')).toHaveValue('23.50')
    expect(input('pmcc-leaps-roll-expiration')).toHaveValue('2028-01-21')
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('allows a retry after a failure', async () => {
    rejectWith(apiError(500, 'boom'))
    await submitUpOut()
    await screen.findByTestId('pmcc-leaps-roll-save-error')
    await userEvent.click(confirm())
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2))
  })
})
