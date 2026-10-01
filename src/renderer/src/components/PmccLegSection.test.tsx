import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OptionChainQuote } from '../api/market-data'
import { useCallChain } from '../hooks/useCallChain'
import { useUnderlyingPrice } from '../hooks/useUnderlyingPrice'
import { LEAPS_PRESET, SHORT_PRESET } from '../lib/pmcc-entry'
import { EMPTY_PMCC_DEFAULTS, type PmccEntryFormValues } from '../schemas/pmcc-entry'
import { PmccLegSection, TICKER_SETTLE_MS } from './PmccLegSection'

vi.mock('../hooks/useCallChain')
vi.mock('../hooks/useUnderlyingPrice', () => ({
  useUnderlyingPrice: vi.fn(() => '100.00')
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

const mockUseCallChain = vi.mocked(useCallChain)
const mockUseUnderlyingPrice = vi.mocked(useUnderlyingPrice)

const SELECTED: PmccEntryFormValues = {
  ...EMPTY_PMCC_DEFAULTS(TODAY),
  ticker: 'XYZ',
  contracts: '1',
  long: {
    contractId: LEAPS.contractId,
    strike: '80.00',
    expiration: '2027-09-17',
    fillPrice: '25.00',
    fees: '0.00',
    fillDate: TODAY
  },
  short: {
    contractId: SHORT.contractId,
    strike: '110.00',
    expiration: '2026-10-16',
    fillPrice: '2.00',
    fees: '0.00',
    fillDate: TODAY
  }
}

function Harness({
  leg,
  values,
  active
}: {
  leg: 'long' | 'short'
  values: PmccEntryFormValues
  active?: boolean
}): React.JSX.Element {
  const methods = useForm<PmccEntryFormValues>({ defaultValues: values })
  return (
    <FormProvider {...methods}>
      <input aria-label="Ticker" {...methods.register('ticker')} />
      <PmccLegSection
        leg={leg}
        preset={leg === 'long' ? LEAPS_PRESET : SHORT_PRESET}
        today={TODAY}
        active={active}
      />
    </FormProvider>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T14:45:00Z'))
  mockUseCallChain.mockImplementation(({ preset }) => ({
    status: 'success',
    contracts: preset === LEAPS_PRESET ? [LEAPS] : [SHORT],
    error: null
  }))
})

afterEach(() => {
  vi.useRealTimers()
  mockUseCallChain.mockReset()
  mockUseUnderlyingPrice.mockClear()
})

describe('PmccLegSection', () => {
  it('heads the long leg "Buy LEAPS call" with its action chip and filter caption', () => {
    render(<Harness leg="long" values={SELECTED} />)
    expect(screen.getByText('Buy LEAPS call')).toBeInTheDocument()
    expect(screen.getByText('BUY TO OPEN')).toBeInTheDocument()
    expect(screen.getByText('180+ DTE · Δ 0.70–0.85')).toBeInTheDocument()
  })

  it('heads the short leg "Sell short call" with its action chip and filter caption', () => {
    render(<Harness leg="short" values={SELECTED} />)
    expect(screen.getByText('Sell short call')).toBeInTheDocument()
    expect(screen.getByText('SELL TO OPEN')).toBeInTheDocument()
    expect(screen.getByText('20–45 DTE · Δ 0.25–0.35')).toBeInTheDocument()
  })

  it('requests the chain for the form’s ticker and the leg’s preset', () => {
    render(<Harness leg="long" values={SELECTED} />)
    expect(mockUseCallChain).toHaveBeenCalledWith({
      ticker: 'XYZ',
      preset: LEAPS_PRESET,
      underlyingPrice: '100.00',
      selectedContractId: LEAPS.contractId,
      enabled: true
    })
    expect(mockUseUnderlyingPrice).toHaveBeenLastCalledWith('XYZ', { enabled: true })
  })

  it('holds the chain and price requests until the typed ticker settles', () => {
    vi.useFakeTimers()
    render(<Harness leg="long" values={EMPTY_PMCC_DEFAULTS(TODAY)} />)

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'AAPL' } })
    expect(mockUseCallChain).toHaveBeenLastCalledWith(expect.objectContaining({ ticker: '' }))
    expect(mockUseUnderlyingPrice).toHaveBeenLastCalledWith('', { enabled: true })
    expect(mockUseCallChain).not.toHaveBeenCalledWith(expect.objectContaining({ ticker: 'A' }))

    act(() => vi.advanceTimersByTime(TICKER_SETTLE_MS))

    expect(mockUseCallChain).toHaveBeenLastCalledWith(expect.objectContaining({ ticker: 'AAPL' }))
    expect(mockUseUnderlyingPrice).toHaveBeenLastCalledWith('AAPL', { enabled: true })
    expect(mockUseCallChain).not.toHaveBeenCalledWith(expect.objectContaining({ ticker: 'A' }))
  })

  it('disables the chain and price requests while the leg is not on screen', () => {
    render(<Harness leg="long" values={SELECTED} active={false} />)
    expect(mockUseCallChain).toHaveBeenLastCalledWith(
      expect.objectContaining({ ticker: 'XYZ', enabled: false })
    )
    expect(mockUseUnderlyingPrice).toHaveBeenLastCalledWith('XYZ', { enabled: false })
  })

  it('keeps the selection, its last quote and the stale notice after a refetch drops it', () => {
    const { rerender } = render(<Harness leg="long" values={SELECTED} />)
    expect(screen.getByLabelText('Contract')).toHaveValue(LEAPS.contractId)

    // Ten minutes after the 14:42 quote, the polled page no longer carries the contract.
    vi.setSystemTime(new Date('2026-09-14T14:52:00Z'))
    const other: OptionChainQuote = { ...LEAPS, contractId: 'XYZ270917C00075000' }
    mockUseCallChain.mockReturnValue({ status: 'success', contracts: [other], error: null })
    rerender(<Harness leg="long" values={SELECTED} />)

    expect(screen.getByLabelText('Contract')).toHaveValue(LEAPS.contractId)
    expect(document.querySelector('#long-strike')).toHaveAttribute('readonly')
    expect(screen.getByText('Bid $24.80 · Ask $25.20 · Mid $25.00 · Δ 0.80')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Quote is stale. Verify against your actual fill.'
    )
  })

  it('forgets the held quote once the leg switches to manual entry', async () => {
    const { rerender } = render(<Harness leg="long" values={SELECTED} />)
    mockUseCallChain.mockReturnValue({ status: 'success', contracts: [], error: null })
    rerender(<Harness leg="long" values={SELECTED} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enter manually' }))

    expect(screen.getByLabelText('Contract')).toHaveValue('')
    expect(screen.getByText('No quote available')).toBeInTheDocument()
  })

  it('shows the selected contract’s quote and quote time', () => {
    render(<Harness leg="long" values={SELECTED} />)
    expect(screen.getByText('Bid $24.80 · Ask $25.20 · Mid $25.00 · Δ 0.80')).toBeInTheDocument()
    expect(screen.getByText('Sep 14, 2026 · 10:42 ET')).toBeInTheDocument()
  })

  it('shows an em-dashed quote when the selected contract has no quote', () => {
    mockUseCallChain.mockReturnValue({ status: 'error', contracts: [], error: null })
    render(<Harness leg="long" values={SELECTED} />)
    expect(screen.getByText('Quote / delta: —')).toBeInTheDocument()
    expect(screen.getByText('No quote available')).toBeInTheDocument()
  })

  it('shows the DTE hint under Expiration', () => {
    render(<Harness leg="long" values={SELECTED} />)
    expect(screen.getByText('368 DTE')).toBeInTheDocument()
  })

  it('locks strike and expiration while a chain contract is selected', () => {
    render(<Harness leg="long" values={SELECTED} />)
    expect(document.querySelector('#long-strike')).toHaveAttribute('readonly')
    expect(document.querySelector('#long-expiration')).toHaveAttribute('readonly')
    expect(document.querySelector('#long-strike')).toHaveValue('80.00')
    expect(document.querySelector('#long-expiration')).toHaveValue('2027-09-17')
  })

  it('unlocks strike and expiration after "Enter manually", keeping their values', async () => {
    render(<Harness leg="long" values={SELECTED} />)
    await userEvent.click(screen.getByRole('button', { name: 'Enter manually' }))
    const strike = document.querySelector('#long-strike')
    const expiration = document.querySelector('#long-expiration')
    expect(strike).not.toHaveAttribute('readonly')
    expect(expiration).not.toHaveAttribute('readonly')
    expect(strike).toHaveValue('80.00')
    expect(expiration).toHaveValue('2027-09-17')
    expect(screen.getByText('Quote / delta: —')).toBeInTheDocument()
  })

  it('writes a chosen contract’s strike and expiration but never the fill', async () => {
    const manual: PmccEntryFormValues = {
      ...SELECTED,
      long: { ...SELECTED.long, contractId: undefined, strike: '', expiration: '' }
    }
    render(<Harness leg="long" values={manual} />)
    await userEvent.selectOptions(screen.getByLabelText('Contract'), LEAPS.contractId)
    expect(document.querySelector('#long-strike')).toHaveValue('80.00')
    expect(document.querySelector('#long-expiration')).toHaveValue('2027-09-17')
    expect(document.querySelector('#long-fill')).toHaveValue('25.00')
  })

  it('renders the field ids the e2e suite targets', () => {
    render(<Harness leg="short" values={SELECTED} />)
    ;['contract', 'strike', 'expiration', 'fill', 'fees', 'fill-date'].forEach((f) =>
      expect(document.querySelector(`#short-${f}`)).toBeInTheDocument()
    )
  })

  it('labels the long fill "Actual purchase / share" and previews it as a debit', () => {
    render(<Harness leg="long" values={SELECTED} />)
    expect(screen.getByLabelText('Actual purchase / share')).toHaveValue('25.00')
    expect(screen.getByText('Debit $2,500.00')).toBeInTheDocument()
  })

  it('labels the short fill "Actual sale / share" and previews it as a credit', () => {
    render(<Harness leg="short" values={SELECTED} />)
    expect(screen.getByLabelText('Actual sale / share')).toHaveValue('2.00')
    expect(screen.getByText('Credit $200.00')).toBeInTheDocument()
  })

  it('dashes the preview while the fill is half-typed', () => {
    render(
      <Harness
        leg="short"
        values={{ ...SELECTED, short: { ...SELECTED.short, fillPrice: '2.' } }}
      />
    )
    expect(screen.getByText('Credit —')).toBeInTheDocument()
  })

  it('shows no chain notice on a fresh leg with no ticker', () => {
    mockUseCallChain.mockReturnValue({ status: 'idle', contracts: [], error: null })
    render(<Harness leg="long" values={EMPTY_PMCC_DEFAULTS(TODAY)} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText('Loading call contracts…')).not.toBeInTheDocument()
  })
})
