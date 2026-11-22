// [US-115] The Sell Short Call sheet: the 460px dialog, the LEAPS delta it reads, the payload it
// records through `window.api.sellPmccShort`, where a rejected sale's server errors land, and the
// success view.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallChain } from '../hooks/useCallChain'
import {
  SELL_PMCC_ID,
  SOLD_RESPONSE,
  XYZ_LEAPS,
  XYZ_LEDGER,
  xyzCycle8
} from '../test-fixtures/pmcc-sell-short'
import { SellPmccShortSheet } from './SellPmccShortSheet'

vi.mock('../hooks/useCallChain')
vi.mock('../hooks/useUnderlyingPrice', () => ({ useUnderlyingPrice: vi.fn(() => null) }))
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onChange
  }: {
    id?: string
    value?: string
    onChange: (value: string) => void
  }) => <input id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
}))

const TODAY = '2027-07-23'
const LEAPS_SYMBOL = 'XYZ280121C00085000'
const SAVE_FAILED = 'Could not record the short call. Your entries are preserved. Try again.'

const mockUseCallChain = vi.mocked(useCallChain)
const mockSellPmccShort = vi.fn<typeof window.api.sellPmccShort>()
const mockGetOptionSnapshots = vi.fn<typeof window.api.getOptionSnapshots>()
const onClose = vi.fn()
const onRecorded = vi.fn()

type SheetOverrides = {
  today?: string | null
  leaps?: typeof XYZ_LEAPS
  ledger?: typeof XYZ_LEDGER
  previousCycle?: ReturnType<typeof xyzCycle8> | null
}

function renderSheet({
  today = TODAY,
  leaps = XYZ_LEAPS,
  ledger = XYZ_LEDGER,
  previousCycle = xyzCycle8()
}: SheetOverrides = {}): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SellPmccShortSheet
        positionId={SELL_PMCC_ID}
        ticker="XYZ"
        leaps={leaps}
        ledger={ledger}
        previousCycle={previousCycle}
        today={today ?? undefined}
        onClose={onClose}
        onRecorded={onRecorded}
      />
    </QueryClientProvider>
  )
}

const record = (): HTMLElement => screen.getByRole('button', { name: 'Record Short Call' })

async function enterNextShort(): Promise<void> {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Strike'), '118')
  await user.type(screen.getByLabelText('Expiration'), '2027-08-20')
  await user.type(screen.getByLabelText('Actual sale price / share'), '1.95')
  await waitFor(() => expect(record()).toBeEnabled())
}

async function submitNextShort(): Promise<void> {
  renderSheet()
  await enterNextShort()
  await userEvent.click(record())
}

function errorBeside(label: string): HTMLElement {
  const field = screen.getByLabelText(label).closest('div.flex.flex-col')
  if (!(field instanceof HTMLElement)) throw new Error(`no field for ${label}`)
  return within(field).getByRole('alert')
}

function expectEntriesKept(): void {
  expect(screen.getByLabelText('Strike')).toHaveValue('118')
  expect(screen.getByLabelText('Expiration')).toHaveValue('2027-08-20')
  expect(screen.getByLabelText('Actual sale price / share')).toHaveValue('1.95')
  expect(screen.getByLabelText('Contracts')).toHaveValue('1')
  expect(screen.getByLabelText('Fill date')).toHaveValue(TODAY)
}

beforeEach(() => {
  onClose.mockReset()
  onRecorded.mockReset()
  mockSellPmccShort.mockReset()
  mockGetOptionSnapshots.mockReset()
  mockGetOptionSnapshots.mockResolvedValue({ ok: true, snapshots: {}, unavailable: false })
  mockUseCallChain.mockReturnValue({ status: 'success', contracts: [], error: null })
  Object.assign(window, {
    api: {
      ...(window.api ?? {}),
      sellPmccShort: mockSellPmccShort,
      getOptionSnapshots: mockGetOptionSnapshots
    }
  })
})

afterEach(() => {
  mockUseCallChain.mockReset()
})

describe('SellPmccShortSheet — dialog', () => {
  it('renders a 460px dialog named Sell Short Call', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Sell Short Call' })
    expect(dialog.parentElement).toHaveStyle({ width: '460px' })
  })

  it('Escape closes the sheet', async () => {
    renderSheet()
    screen.getByRole('dialog').focus()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('defaults the fill date and the coverage DTE to the New York day', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 01:00 UTC on 2027-07-24 is still 2027-07-23 in New York.
    vi.setSystemTime(new Date('2027-07-24T01:00:00Z'))
    try {
      renderSheet({ today: null })
      expect(screen.getByLabelText('Fill date')).toHaveValue('2027-07-23')
      expect(screen.getByTestId('pmcc-sell-short-coverage')).toHaveTextContent('182 DTE')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads the LEAPS delta from its option snapshot', async () => {
    mockGetOptionSnapshots.mockResolvedValue({
      ok: true,
      snapshots: {
        [LEAPS_SYMBOL]: {
          bid: '23.40',
          ask: '23.80',
          mid: '23.60',
          lastTrade: '23.60',
          openInterest: 50,
          volume: 5,
          greeks: { delta: '0.8100', gamma: '0.0050', theta: '-0.0100', vega: '0.4000' },
          timestamp: '2027-07-23T14:30:00Z'
        }
      },
      unavailable: false
    })
    renderSheet()

    await waitFor(() =>
      expect(screen.getByTestId('pmcc-sell-short-coverage')).toHaveTextContent(
        '$85.00 · 2028-01-21 · 182 DTE · Δ 0.81'
      )
    )
    expect(mockGetOptionSnapshots).toHaveBeenCalledWith({ symbols: [LEAPS_SYMBOL] })
  })
  it('shows Δ — when the LEAPS cannot form an option symbol', async () => {
    renderSheet({ leaps: { ...XYZ_LEAPS, strike: '0.0000' } })

    await waitFor(() =>
      expect(screen.getByTestId('pmcc-sell-short-coverage')).toHaveTextContent(
        '$0.00 · 2028-01-21 · 182 DTE · Δ —'
      )
    )
  })
})

describe('SellPmccShortSheet — without a previous cycle', () => {
  it('accepts a fill after the LEAPS fill when no short call has ended', async () => {
    renderSheet({ previousCycle: null })
    const user = userEvent.setup()
    const fillDate = screen.getByLabelText('Fill date')
    await user.clear(fillDate)
    await user.type(fillDate, '2027-07-12')
    await enterNextShort()

    expect(record()).toBeEnabled()
  })

  it('shows — for premium recovered when the ledger has no LEAPS cost', async () => {
    renderSheet({
      ledger: {
        ...XYZ_LEDGER,
        leapsCostPerShare: '0.0000',
        leapsCostTotal: '0.0000',
        premiumRecoveredPercent: null
      }
    })
    await enterNextShort()

    expect(screen.getByTestId('pmcc-sell-short-recovered')).toHaveTextContent(
      'Premium recovered after: — (from —)'
    )
  })
})

describe('SellPmccShortSheet — submit', () => {
  it('records the sale with the payload built from the form', async () => {
    mockSellPmccShort.mockResolvedValue({ ok: true, ...SOLD_RESPONSE })
    await submitNextShort()

    await waitFor(() => expect(mockSellPmccShort).toHaveBeenCalledTimes(1))
    expect(mockSellPmccShort).toHaveBeenCalledWith({
      positionId: SELL_PMCC_ID,
      strike: 118,
      expiration: '2027-08-20',
      contracts: 1,
      fillPrice: 1.95,
      fillDate: TODAY,
      fees: 0
    })
  })

  it('reads Recording… and records once while the sale is pending', async () => {
    mockSellPmccShort.mockReturnValue(new Promise(() => {}))
    renderSheet()
    await enterNextShort()

    await userEvent.dblClick(record())

    expect(await screen.findByRole('button', { name: 'Recording…' })).toBeDisabled()
    expect(mockSellPmccShort).toHaveBeenCalledTimes(1)
  })

  it('shows the cycle the sale opened, tells the page, and Done closes the sheet', async () => {
    mockSellPmccShort.mockResolvedValue({ ok: true, ...SOLD_RESPONSE })
    await submitNextShort()

    expect(await screen.findByText('PMCC updated')).toBeInTheDocument()
    expect(screen.getByText('Cycle 9 opened')).toBeInTheDocument()
    expect(screen.getByTestId('pmcc-sell-short-success')).toHaveTextContent(
      'Cost basis$6.55 / share'
    )
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ cycleNumber: 9 }))
    expect(onClose).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('SellPmccShortSheet — server errors', () => {
  it.each([
    ['expiration', 'Expiration', 'Short call must expire before the LEAPS call.'],
    ['strike', 'Strike', 'Short-call strike must be above the LEAPS strike.'],
    ['contracts', 'Contracts', 'Cannot sell more short calls than LEAPS contracts held (1).'],
    [
      'fillDate',
      'Fill date',
      'Fill date cannot be before the previous short call was retired (2027-07-16).'
    ],
    ['fillPrice', 'Actual sale price / share', 'Actual fill price must be greater than zero.']
  ])('a %s rejection lands beside %s and keeps every entry', async (field, label, message) => {
    mockSellPmccShort.mockResolvedValue({
      ok: false,
      errors: [{ field, code: 'rejected', message }]
    })
    await submitNextShort()

    await waitFor(() => expect(errorBeside(label)).toHaveTextContent(message))
    expectEntriesKept()
    expect(screen.queryByTestId('pmcc-sell-short-save-error')).not.toBeInTheDocument()
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('an internal error shows the save-failed copy, keeps every entry and allows a retry', async () => {
    mockSellPmccShort.mockResolvedValue({
      ok: false,
      errors: [
        { field: '__root__', code: 'internal_error', message: 'An unexpected error occurred' }
      ]
    })
    await submitNextShort()

    expect(await screen.findByTestId('pmcc-sell-short-save-error')).toHaveTextContent(SAVE_FAILED)
    expectEntriesKept()
    expect(record()).toBeEnabled()
    expect(screen.queryByText('PMCC updated')).not.toBeInTheDocument()
  })
})
