import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OptionChainQuote } from '../api/market-data'
import { useCallChain } from '../hooks/useCallChain'
import { LEAPS_PRESET, SHORT_PRESET } from '../lib/pmcc-entry'
import type { SharedFieldsHandle } from './new-position-shared'
import { PmccEntryForm } from './PmccEntryForm'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))

vi.mock('../hooks/useCallChain')
vi.mock('../hooks/useUnderlyingPrice', () => ({
  useUnderlyingPrice: () => '100.00'
}))
vi.mock('../hooks/useCreatePmccPosition', () => ({
  useCreatePmccPosition: () => ({ mutate: mocks.mutate, isPending: mocks.isPending })
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
  }) => <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
}))

const TODAY = '2026-09-14'

const LEAPS: OptionChainQuote = {
  contractId: 'XYZ270917C00080000',
  strike: '80.0000',
  expiration: '2027-09-17',
  contractType: 'call',
  bid: '24.80',
  ask: '25.20',
  mid: '25.00',
  lastTrade: '25.00',
  openInterest: 100,
  volume: 10,
  greeks: { delta: '0.8000', gamma: '0.0100', theta: '-0.0200', vega: '0.3000' },
  timestamp: '2026-09-14T14:42:00Z'
}

const SHORT: OptionChainQuote = {
  ...LEAPS,
  contractId: 'XYZ261016C00110000',
  strike: '110.0000',
  expiration: '2026-10-16',
  bid: '1.90',
  ask: '2.10',
  mid: '2.00',
  greeks: { delta: '0.3000', gamma: '0.0100', theta: '-0.0200', vega: '0.3000' }
}

const EXPECTED_PAYLOAD = {
  strategy: 'PMCC',
  ticker: 'XYZ',
  long: {
    underlying: 'XYZ',
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: 80,
    expiration: '2027-09-17',
    contracts: 1,
    fillPrice: 25,
    fillDate: TODAY,
    fees: 0
  },
  short: {
    underlying: 'XYZ',
    instrumentType: 'CALL',
    deliverableShares: 100,
    strike: 110,
    expiration: '2026-10-16',
    contracts: 1,
    fillPrice: 2,
    fillDate: TODAY,
    fees: 0
  },
  thesis: undefined,
  notes: undefined
}

const mockUseCallChain = vi.mocked(useCallChain)

type Props = Partial<React.ComponentProps<typeof PmccEntryForm>>

function renderForm(props: Props = {}): { onRecorded: ReturnType<typeof vi.fn> } {
  const onRecorded = vi.fn()
  render(<PmccEntryForm onRecorded={onRecorded} onCancel={vi.fn()} today={TODAY} {...props} />)
  return { onRecorded }
}

const input = (selector: string): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>(selector)
  if (!el) throw new Error(`missing ${selector}`)
  return el
}

const section = (title: string): HTMLElement => {
  const el = screen.getByText(title).closest('section')
  if (!el) throw new Error(`missing section ${title}`)
  return el
}

const recordButton = (): HTMLElement => screen.getByTestId('record-pmcc')

async function type(selector: string, value: string): Promise<void> {
  await userEvent.clear(input(selector))
  await userEvent.type(input(selector), value)
}

async function enterFixture(fees = '0.00'): Promise<void> {
  await type('#pmcc-ticker', 'XYZ')
  await type('#pmcc-contracts', '1')
  await userEvent.selectOptions(input('#long-contract'), LEAPS.contractId)
  await type('#long-fill', '25.00')
  await type('#long-fees', fees)
  await userEvent.selectOptions(input('#short-contract'), SHORT.contractId)
  await type('#short-fill', '2.00')
  await type('#short-fees', fees)
  await userEvent.tab()
}

function rejectWith(detail: { field: string; code: string; message: string }[]): void {
  mocks.mutate.mockImplementation((_payload, options) =>
    options.onError({ status: 400, body: { detail } })
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T14:45:00Z'))
  mocks.mutate.mockReset()
  mocks.isPending = false
  mockUseCallChain.mockImplementation(({ preset }) => ({
    status: 'success',
    contracts: preset === LEAPS_PRESET ? [LEAPS] : [SHORT],
    error: null
  }))
})

afterEach(() => {
  vi.useRealTimers()
  mockUseCallChain.mockReset()
})

describe('PmccEntryForm — layout', () => {
  it('puts Ticker and Contracts per leg side by side in a two-column grid', () => {
    renderForm()
    const grid = screen.getByLabelText('Ticker').closest('.grid-cols-2')
    expect(grid).not.toBeNull()
    expect(grid).toContainElement(screen.getByLabelText('Contracts per leg'))
    expect(input('#pmcc-ticker')).toBe(screen.getByLabelText('Ticker'))
    expect(input('#pmcc-contracts')).toBe(screen.getByLabelText('Contracts per leg'))
  })

  it('orders the shared fields, both legs, the cash flows and the Advanced disclosure', () => {
    renderForm()
    const order = [
      screen.getByLabelText('Ticker'),
      screen.getByText('Buy LEAPS call'),
      screen.getByText('Sell short call'),
      screen.getByText('Opening cash flows'),
      screen.getByText('Advanced · Thesis and notes')
    ]
    order.slice(1).forEach((node, i) => {
      expect(order[i].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    expect(within(section('Buy LEAPS call')).getByText('BUY TO OPEN')).toBeInTheDocument()
    expect(
      within(section('Buy LEAPS call')).getByText('180+ DTE · Δ 0.70–0.85')
    ).toBeInTheDocument()
    expect(within(section('Sell short call')).getByText('SELL TO OPEN')).toBeInTheDocument()
    expect(
      within(section('Sell short call')).getByText('20–45 DTE · Δ 0.25–0.35')
    ).toBeInTheDocument()
  })

  it('defaults each leg’s fill date to today and fees to 0.00', () => {
    renderForm()
    expect(input('#long-fill-date')).toHaveValue(TODAY)
    expect(input('#short-fill-date')).toHaveValue(TODAY)
    expect(input('#long-fees')).toHaveValue('0.00')
    expect(input('#short-fees')).toHaveValue('0.00')
  })

  it('pre-fills the ticker from defaultTicker', () => {
    renderForm({ defaultTicker: 'XYZ' })
    expect(input('#pmcc-ticker')).toHaveValue('XYZ')
  })

  it('shows the no-order small print', () => {
    renderForm()
    expect(screen.getByText('Uses your actual fills. No order is placed.')).toBeInTheDocument()
  })
})

describe('PmccEntryForm — footer', () => {
  it('reads "Initial net debit —" while the fills are empty', () => {
    renderForm()
    expect(screen.getByText('Initial net debit')).toBeInTheDocument()
    expect(screen.getByTestId('pmcc-initial-net-debit')).toHaveTextContent('—')
  })

  it('reads $2,300.00 once the fixture is entered', async () => {
    renderForm()
    await enterFixture()
    expect(screen.getByTestId('pmcc-initial-net-debit')).toHaveTextContent('$2,300.00')
  })

  it('adds $1.00 of fees per leg to the debit while the ratio stays 76.67%', async () => {
    renderForm()
    await enterFixture('1.00')
    expect(screen.getByTestId('pmcc-initial-net-debit')).toHaveTextContent('$2,302.00')
    expect(screen.getByText('Debit / strike width, before fees: 76.67%')).toBeInTheDocument()
  })

  it('keeps Record PMCC available on a fresh, still-invalid form', () => {
    renderForm()
    expect(recordButton()).toBeEnabled()
  })

  it('names a missing LEAPS fill beside its field on Record PMCC, focuses it and records nothing', async () => {
    renderForm()
    await enterFixture()
    await userEvent.clear(input('#long-fill'))
    await userEvent.tab()
    expect(recordButton()).toBeEnabled()

    await userEvent.click(recordButton())

    const alert = await within(section('Buy LEAPS call')).findByRole('alert')
    expect(alert).toHaveTextContent('Enter the actual LEAPS fill price.')
    expect(alert.parentElement).toContainElement(input('#long-fill'))
    expect(input('#long-fill')).toHaveFocus()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('reads "Recording…" and stays disabled while the save is pending', () => {
    mocks.isPending = true
    renderForm()
    expect(recordButton()).toHaveTextContent('Recording…')
    expect(recordButton()).toBeDisabled()
  })

  it('reports the pending state to its host', () => {
    mocks.isPending = true
    const onPendingChange = vi.fn()
    renderForm({ onPendingChange })
    expect(onPendingChange).toHaveBeenLastCalledWith(true)
  })

  it('Cancel calls onCancel', async () => {
    const onCancel = vi.fn()
    renderForm({ onCancel })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('PmccEntryForm — submit', () => {
  it('submits the fixture as the contract example payload', async () => {
    renderForm()
    await enterFixture()
    await waitFor(() => expect(recordButton()).toBeEnabled())
    await userEvent.click(recordButton())
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1))
    expect(mocks.mutate.mock.calls[0][0]).toEqual(EXPECTED_PAYLOAD)
  })

  it('reports a recorded PMCC to onRecorded', async () => {
    mocks.mutate.mockImplementation((_payload, options) =>
      options.onSuccess({ position: { id: 'pos-1', ticker: 'XYZ' } })
    )
    const { onRecorded } = renderForm()
    await enterFixture()
    await waitFor(() => expect(recordButton()).toBeEnabled())
    await userEvent.click(recordButton())
    await waitFor(() =>
      expect(onRecorded).toHaveBeenCalledWith({ id: 'pos-1', ticker: 'XYZ', kind: 'PMCC' })
    )
  })

  it('shows an IPC short.expiration rejection inside the short leg’s Expiration field', async () => {
    rejectWith([
      {
        field: 'short.expiration',
        code: 'short_not_before_long',
        message: 'Short call must expire before the LEAPS call.'
      }
    ])
    renderForm()
    await enterFixture()
    await waitFor(() => expect(recordButton()).toBeEnabled())
    await userEvent.click(recordButton())
    const alert = await within(section('Sell short call')).findByRole('alert')
    expect(alert).toHaveTextContent('Short call must expire before the LEAPS call.')
    expect(alert.parentElement).toContainElement(input('#short-expiration'))
  })

  it('shows an IPC __pair__ rejection above the cash flows', async () => {
    rejectWith([
      {
        field: '__pair__',
        code: 'not_net_debit',
        message: 'This PMCC entry requires a net debit before fees.'
      }
    ])
    renderForm()
    await enterFixture()
    await waitFor(() => expect(recordButton()).toBeEnabled())
    await userEvent.click(recordButton())
    const alert = await screen.findByText('This PMCC entry requires a net debit before fees.')
    const cashFlows = screen.getByText('Opening cash flows')
    expect(alert.compareDocumentPosition(cashFlows) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(
      section('Sell short call').compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('explains a net-credit entry on blur, and again on Record PMCC without recording it', async () => {
    renderForm()
    await enterFixture()
    await type('#short-fill', '30.00')
    await userEvent.tab()
    const alert = await screen.findByText('This PMCC entry requires a net debit before fees.')
    expect(alert).toHaveAttribute('role', 'alert')
    expect(recordButton()).toBeEnabled()

    await userEvent.click(recordButton())
    expect(
      await screen.findByText('This PMCC entry requires a net debit before fees.')
    ).toHaveAttribute('role', 'alert')
    expect(mocks.mutate).not.toHaveBeenCalled()

    await type('#short-fill', '2.00')
    await userEvent.tab()
    await waitFor(() =>
      expect(
        screen.queryByText('This PMCC entry requires a net debit before fees.')
      ).not.toBeInTheDocument()
    )
  })

  it('surfaces a cross-leg rule on Record PMCC when no blur ran it', async () => {
    renderForm()
    await enterFixture()
    await userEvent.click(screen.getAllByRole('button', { name: 'Enter manually' })[1])
    await type('#short-strike', '75.00')

    await userEvent.click(recordButton())

    const alert = await within(section('Sell short call')).findByRole('alert')
    expect(alert).toHaveTextContent('Short-call strike must be above the LEAPS strike.')
    expect(mocks.mutate).not.toHaveBeenCalled()
  })

  it('records once however quickly Record PMCC is clicked again', async () => {
    renderForm()
    await enterFixture()

    await userEvent.dblClick(recordButton())
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled())
    await userEvent.click(recordButton())
    await act(async () => {})

    expect(mocks.mutate).toHaveBeenCalledTimes(1)
  })

  it('shows an IPC long.contracts rejection on Contracts per leg', async () => {
    rejectWith([
      {
        field: 'long.contracts',
        code: 'must_be_positive_integer',
        message: 'Contracts must be a positive whole number.'
      }
    ])
    renderForm()
    await enterFixture()
    await waitFor(() => expect(recordButton()).toBeEnabled())
    await userEvent.click(recordButton())
    const field = screen.getByLabelText('Contracts per leg').parentElement
    if (!field) throw new Error('missing contracts field')
    expect(await within(field).findByRole('alert')).toHaveTextContent(
      'Contracts must be a positive whole number.'
    )
  })

  it('recovers from an internal error with entries preserved and Record PMCC available', async () => {
    rejectWith([{ field: '__root__', code: 'internal_error', message: 'SQLITE_READONLY' }])
    renderForm()
    await enterFixture()
    await waitFor(() => expect(recordButton()).toBeEnabled())
    await userEvent.click(recordButton())
    const alert = await screen.findByTestId('pmcc-save-error')
    expect(alert).toHaveTextContent('Could not record PMCC. Your entries are preserved. Try again.')
    expect(
      alert.compareDocumentPosition(input('#pmcc-ticker')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(input('#pmcc-ticker')).toHaveValue('XYZ')
    expect(input('#pmcc-contracts')).toHaveValue('1')
    expect(input('#long-fill')).toHaveValue('25.00')
    expect(input('#short-fill')).toHaveValue('2.00')
    expect(input('#long-strike')).toHaveValue('80.00')
    expect(input('#short-expiration')).toHaveValue('2026-10-16')
    expect(recordButton()).toBeEnabled()
  })
  it.each([
    ['a non-400 error without detail', { status: 500, body: { message: 'boom' } }],
    ['a 400 with an empty detail list', { status: 400, body: { detail: [] } }]
  ])('shows the save alert for %s with entries preserved', async (_, error) => {
    mocks.mutate.mockImplementation((_payload, options) => options.onError(error))
    renderForm()
    await enterFixture()
    await waitFor(() => expect(recordButton()).toBeEnabled())
    await userEvent.click(recordButton())

    const alert = await screen.findByTestId('pmcc-save-error')
    expect(alert).toHaveTextContent('Could not record PMCC. Your entries are preserved. Try again.')
    expect(input('#pmcc-ticker')).toHaveValue('XYZ')
    expect(input('#long-fill')).toHaveValue('25.00')
    expect(input('#short-fill')).toHaveValue('2.00')
    expect(recordButton()).toBeEnabled()
  })
})

describe('PmccEntryForm — chain notice', () => {
  it('shows no chain notice on a fresh form with no ticker', () => {
    mockUseCallChain.mockImplementation(({ ticker }) =>
      ticker === ''
        ? { status: 'idle', contracts: [], error: null }
        : { status: 'pending', contracts: [], error: null }
    )
    renderForm()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading call contracts…')).not.toBeInTheDocument()
  })
})

describe('PmccEntryForm — visibility', () => {
  it('requests both legs’ chains while active', () => {
    renderForm({ defaultTicker: 'XYZ' })
    expect(mockUseCallChain).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
    expect(mockUseCallChain).not.toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('disables both legs’ chain requests while inactive', () => {
    renderForm({ defaultTicker: 'XYZ', active: false })
    expect(mockUseCallChain).toHaveBeenCalledWith(
      expect.objectContaining({ preset: LEAPS_PRESET, enabled: false })
    )
    expect(mockUseCallChain).toHaveBeenCalledWith(
      expect.objectContaining({ preset: SHORT_PRESET, enabled: false })
    )
    expect(mockUseCallChain).not.toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
  })
})

describe('PmccEntryForm — ticker change', () => {
  it('clears both legs’ contract, strike, expiration and fill but not fees or fill dates', async () => {
    renderForm()
    await enterFixture('1.00')
    await type('#pmcc-ticker', 'ABC')
    ;['long', 'short'].forEach((leg) => {
      expect(input(`#${leg}-contract`)).toHaveValue('')
      expect(input(`#${leg}-strike`)).toHaveValue('')
      expect(input(`#${leg}-expiration`)).toHaveValue('')
      expect(input(`#${leg}-fill`)).toHaveValue('')
      expect(input(`#${leg}-fees`)).toHaveValue('1.00')
      expect(input(`#${leg}-fill-date`)).toHaveValue(TODAY)
    })
  })
})

describe('PmccEntryForm — shared fields handle', () => {
  it('exposes ticker and contracts through sharedRef', async () => {
    const sharedRef: React.RefObject<SharedFieldsHandle | null> = { current: null }
    renderForm({ sharedRef })
    await type('#pmcc-ticker', 'XYZ')
    await type('#pmcc-contracts', '2')
    expect(sharedRef.current?.getShared()).toEqual({ ticker: 'XYZ', contracts: '2' })
  })

  it('accepts ticker and contracts through sharedRef', async () => {
    const sharedRef: React.RefObject<SharedFieldsHandle | null> = { current: null }
    renderForm({ sharedRef })
    act(() => sharedRef.current?.setShared({ ticker: 'XYZ', contracts: '2' }))
    expect(input('#pmcc-ticker')).toHaveValue('XYZ')
    expect(input('#pmcc-contracts')).toHaveValue('2')
  })
})
