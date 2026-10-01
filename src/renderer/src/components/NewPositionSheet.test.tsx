import { fireEvent, render, screen } from '@testing-library/react'
import { createPortal } from 'react-dom'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallChain } from '../hooks/useCallChain'
import { useCreatePosition } from '../hooks/useCreatePosition'
import { buildPromoteSearch } from '../lib/promote'
import { NewPositionSheet } from './NewPositionSheet'

const mocks = vi.hoisted(() => ({ pmccPending: false }))

vi.mock('../hooks/useCreatePosition')
vi.mock('../hooks/usePromotedQuote', () => ({ usePromotedQuote: () => ({ quote: undefined }) }))
vi.mock('../hooks/useMarketStatusDisplay', () => ({
  useMarketStatusDisplay: () => ({
    settingsQuery: {},
    hasMarketData: true,
    statusQuery: {},
    display: 'CLOSED'
  })
}))
vi.mock('../hooks/useCallChain', () => ({
  useCallChain: vi.fn(() => ({ status: 'success', contracts: [], error: null }))
}))
vi.mock('../hooks/useUnderlyingPrice', () => ({ useUnderlyingPrice: () => '100.00' }))
vi.mock('../hooks/useCreatePmccPosition', () => ({
  useCreatePmccPosition: () => ({ mutate: vi.fn(), isPending: mocks.pmccPending })
}))
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    value,
    onChange,
    id
  }: {
    value?: string
    onChange: (v: string) => void
    id?: string
  }) => (
    <>
      <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      {/* Stands in for Radix's PopoverContent: a React child portalled to document.body. */}
      {createPortal(<button data-testid={`${id}-popover`}>day</button>, document.body)}
    </>
  )
}))

const mockUseCreatePosition = vi.mocked(useCreatePosition)
const mockUseCallChain = vi.mocked(useCallChain)

function setWheelPending(isPending: boolean): void {
  mockUseCreatePosition.mockReturnValue({
    mutate: vi.fn(),
    isPending,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null
  } as unknown as ReturnType<typeof useCreatePosition>)
}

const AAPL = {
  ticker: 'AAPL',
  strike: '180.0000',
  expiration: '2026-08-21',
  mark: '2.70',
  timestamp: '2026-08-07T20:00:02Z'
}

type Props = Partial<React.ComponentProps<typeof NewPositionSheet>>

function renderSheet(props: Props = {}): { onClose: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn()
  render(<NewPositionSheet open search="" onClose={onClose} onRecorded={vi.fn()} {...props} />)
  return { onClose }
}

const input = (id: string): HTMLInputElement => {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input #${id}`)
  return el
}

const wheelForm = (): HTMLFormElement => {
  const form = input('ticker').closest('form')
  if (!form) throw new Error('wheel form not mounted')
  return form
}

beforeEach(() => {
  mocks.pmccPending = false
  setWheelPending(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NewPositionSheet — chrome', () => {
  it('renders nothing while closed', () => {
    renderSheet({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens a dialog named New position with the sheet header copy', () => {
    renderSheet()

    expect(screen.getByRole('dialog', { name: 'New position' })).toBeInTheDocument()
    expect(screen.getByText('OPEN WHEEL')).toBeInTheDocument()
    expect(screen.getByText('New position')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent('Record a completed trade')
  })

  it('moves focus into the dialog on open', () => {
    renderSheet()
    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('opens in Standard with the wheel form and its helper line', () => {
    renderSheet()

    expect(screen.getByRole('group', { name: 'Position strategy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standard', pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Start the wheel with a cash-secured put.')).toBeInTheDocument()
    ;['ticker', 'strike', 'contracts', 'premiumPerContract', 'expiration'].forEach((id) =>
      expect(input(id)).toBeVisible()
    )
    expect(screen.getByRole('button', { name: 'Open wheel' })).toBeVisible()
  })

  it('keeps Cancel and the Open wheel submit together in the fixed footer, below the fields', () => {
    renderSheet()

    const submit = screen.getByRole('button', { name: 'Open wheel' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const footer = submit.parentElement
    expect(footer).not.toBeNull()
    expect(cancel.parentElement).toBe(footer)
    expect(footer).not.toContainElement(input('ticker'))
    expect(
      footer!.compareDocumentPosition(input('ticker')) & Node.DOCUMENT_POSITION_PRECEDING
    ).toBeTruthy()
  })
})

describe('NewPositionSheet — closing', () => {
  it.each([
    [
      'Escape',
      async (): Promise<void> => {
        await userEvent.keyboard('{Escape}')
      }
    ],
    [
      'the × button',
      async (): Promise<void> => userEvent.click(screen.getByLabelText('Close sheet'))
    ],
    ['the scrim', async (): Promise<void> => userEvent.click(screen.getByTestId('sheet-scrim'))],
    [
      'Cancel',
      async (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    ]
  ])('closes on %s', async (_, act) => {
    const { onClose } = renderSheet()

    await act()

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('leaves Escape inside a portalled date-picker popover to the popover', () => {
    const { onClose } = renderSheet()
    const popover = screen.getByTestId('expiration-popover')
    expect(screen.getByRole('dialog')).not.toContainElement(popover)

    fireEvent.keyDown(popover, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores every close gesture while the wheel mutation is pending', async () => {
    setWheelPending(true)
    const { onClose } = renderSheet()

    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByLabelText('Close sheet'))
    await userEvent.click(screen.getByTestId('sheet-scrim'))
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel).toBeDisabled()

    expect(onClose).not.toHaveBeenCalled()
  })

  it('disables the strategy toggle while a mutation is pending', () => {
    setWheelPending(true)
    renderSheet()

    expect(screen.getByRole('button', { name: 'Standard', pressed: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'PMCC' })).toBeDisabled()
  })

  it('restores focus to the trigger once closed', () => {
    const trigger = document.createElement('a')
    trigger.tabIndex = 0
    document.body.appendChild(trigger)
    const returnFocusRef = { current: trigger }
    const onClose = vi.fn()
    const { rerender } = render(
      <NewPositionSheet
        open
        search=""
        onClose={onClose}
        onRecorded={vi.fn()}
        returnFocusRef={returnFocusRef}
      />
    )

    rerender(
      <NewPositionSheet
        open={false}
        search=""
        onClose={onClose}
        onRecorded={vi.fn()}
        returnFocusRef={returnFocusRef}
      />
    )

    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('restores focus to whichever element opened it, not the header trigger', () => {
    const header = document.createElement('a')
    header.tabIndex = 0
    const sidebar = document.createElement('button')
    document.body.append(header, sidebar)
    sidebar.focus()
    const props = { search: '', onClose: vi.fn(), onRecorded: vi.fn() }
    const returnFocusRef = { current: header }

    const { rerender } = render(
      <NewPositionSheet open {...props} returnFocusRef={returnFocusRef} />
    )
    expect(sidebar).not.toHaveFocus()
    rerender(<NewPositionSheet open={false} {...props} returnFocusRef={returnFocusRef} />)

    expect(sidebar).toHaveFocus()
    header.remove()
    sidebar.remove()
  })

  it('falls back to the header trigger when the opener has left the document', () => {
    const header = document.createElement('a')
    header.tabIndex = 0
    const success = document.createElement('button')
    document.body.append(header, success)
    success.focus()
    const props = { search: '', onClose: vi.fn(), onRecorded: vi.fn() }
    const returnFocusRef = { current: header }

    const { rerender } = render(
      <NewPositionSheet open {...props} returnFocusRef={returnFocusRef} />
    )
    success.remove()
    rerender(<NewPositionSheet open={false} {...props} returnFocusRef={returnFocusRef} />)

    expect(header).toHaveFocus()
    header.remove()
  })
})

// [US-68] The consuming half of the promote-navigation contract, moved here from the
// deleted NewWheelPage: the sheet decides, from the search string alone, whether the
// Standard form opens promoted or plain.
describe('NewPositionSheet — Standard prefill and promote', () => {
  it('honours the bare ?ticker= prefill', () => {
    renderSheet({ search: 'ticker=TSLA' })

    expect(input('ticker')).toHaveValue('TSLA')
    expect(input('strike')).toHaveValue('')
  })

  it('hands the wheel form the promoted candidate', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

    renderSheet({ search: buildPromoteSearch(AAPL, 'Would own below $170') })

    expect(input('ticker')).toHaveValue('AAPL')
    expect(input('strike')).toHaveValue('180')
    expect(input('premiumPerContract')).toHaveValue('2.70')
    expect(input('thesis')).toHaveValue('Would own below $170')
  })

  it('consumes the promote params once so a later plain open cannot resurrect them', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderSheet({ search: buildPromoteSearch(AAPL) })

    expect(replaceState).toHaveBeenCalledOnce()
    const [, , url] = replaceState.mock.calls[0]
    expect(String(url)).not.toContain('promoted=1')
    expect(String(url)).not.toContain('ticker=AAPL')
  })

  it('leaves the URL alone when nothing was promoted', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')

    renderSheet({ search: 'ticker=TSLA' })

    expect(replaceState).not.toHaveBeenCalled()
  })

  it('degrades a malformed promote to the plain form but still consumes it', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const params = new URLSearchParams(buildPromoteSearch(AAPL))
    params.set('premium', 'not-a-price')

    renderSheet({ search: params.toString() })

    expect(input('ticker')).toHaveValue('AAPL')
    expect(input('strike')).toHaveValue('')
    expect(replaceState).toHaveBeenCalledOnce()
    expect(String(replaceState.mock.calls[0][2])).not.toContain('ticker=AAPL')
  })
})

describe('NewPositionSheet — switching strategy', () => {
  it('hides, not unmounts, the wheel form and shows the PMCC form', async () => {
    renderSheet()

    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))

    expect(screen.getByRole('button', { name: 'PMCC', pressed: true })).toBeInTheDocument()
    expect(screen.getByText('Long LEAPS call + a shorter-dated short call.')).toBeInTheDocument()
    expect(wheelForm()).toBeInTheDocument()
    expect(wheelForm()).not.toBeVisible()
    expect(input('pmcc-ticker')).toBeVisible()
    expect(screen.getByTestId('record-pmcc')).toBeVisible()
  })

  it('keeps the hidden PMCC form’s chain requests disabled until PMCC is chosen', async () => {
    mockUseCallChain.mockClear()
    renderSheet()
    expect(mockUseCallChain).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
    expect(mockUseCallChain).not.toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))

    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))
    expect(mockUseCallChain).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: true }))

    mockUseCallChain.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Standard' }))
    expect(mockUseCallChain).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('ignores a click on the already-active Standard choice', async () => {
    renderSheet()
    await userEvent.type(input('ticker'), 'XYZ')

    await userEvent.click(screen.getByRole('button', { name: 'Standard', pressed: true }))

    expect(screen.getByRole('button', { name: 'Standard', pressed: true })).toBeInTheDocument()
    expect(wheelForm()).toBeVisible()
    expect(input('ticker')).toHaveValue('XYZ')
  })

  it('carries ticker and contracts from Standard into PMCC', async () => {
    renderSheet()
    await userEvent.type(input('ticker'), 'XYZ')
    await userEvent.type(input('contracts'), '2')

    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))

    expect(screen.getByLabelText('Ticker', { selector: '#pmcc-ticker' })).toHaveValue('XYZ')
    expect(screen.getByLabelText('Contracts per leg')).toHaveValue('2')
  })

  it('keeps the wheel draft when switching back', async () => {
    renderSheet()
    await userEvent.type(input('strike'), '95.00')
    await userEvent.type(input('premiumPerContract'), '1.25')

    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))
    await userEvent.click(screen.getByRole('button', { name: 'Standard' }))

    expect(input('strike')).toHaveValue('95.00')
    expect(input('premiumPerContract')).toHaveValue('1.25')
    expect(wheelForm()).toBeVisible()
  })

  it('carries ticker and contracts from PMCC back into Standard', async () => {
    renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))
    await userEvent.type(input('pmcc-ticker'), 'ABC')
    await userEvent.clear(input('pmcc-contracts'))
    await userEvent.type(input('pmcc-contracts'), '3')

    await userEvent.click(screen.getByRole('button', { name: 'Standard' }))

    expect(input('ticker')).toHaveValue('ABC')
    expect(input('contracts')).toHaveValue('3')
  })

  it('disables the toggle while the PMCC mutation is pending', async () => {
    renderSheet()
    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))

    mocks.pmccPending = true
    await userEvent.type(input('pmcc-ticker'), 'X')

    expect(screen.getByRole('button', { name: 'Standard' })).toBeDisabled()
  })

  it('reopens fresh in Standard after a close', async () => {
    const props = { search: '', onClose: vi.fn(), onRecorded: vi.fn() }
    const { rerender } = render(<NewPositionSheet open {...props} />)
    await userEvent.type(input('ticker'), 'XYZ')
    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))

    rerender(<NewPositionSheet open={false} {...props} />)
    rerender(<NewPositionSheet open {...props} />)

    expect(screen.getByRole('button', { name: 'Standard', pressed: true })).toBeInTheDocument()
    expect(input('ticker')).toHaveValue('')
  })
})
