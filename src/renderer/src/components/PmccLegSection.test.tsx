import { zodResolver } from '@hookform/resolvers/zod'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OptionChainQuote } from '../api/market-data'
import { useCallChain } from '../hooks/useCallChain'
import { useUnderlyingPrice } from '../hooks/useUnderlyingPrice'
import {
  filterCallChain,
  LEAPS_PRESET,
  SHORT_PRESET,
  type ShortCallChainBounds
} from '../lib/pmcc-entry'
import {
  EMPTY_PMCC_DEFAULTS,
  pmccEntrySchema,
  type PmccEntryFormValues
} from '../schemas/pmcc-entry'
import {
  EMPTY_SELL_PMCC_SHORT_DEFAULTS,
  type SellPmccShortFormValues
} from '../schemas/sell-pmcc-short'
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

type SectionProps = React.ComponentProps<typeof PmccLegSection>

function Harness({
  leg,
  values,
  active,
  ticker,
  pairRule
}: {
  leg: 'long' | 'short'
  values: PmccEntryFormValues
} & Pick<SectionProps, 'active' | 'ticker' | 'pairRule'>): React.JSX.Element {
  // The entry form's own resolver, so `__pair__` (rule 16) is judged as US-101 judges it.
  const methods = useForm<PmccEntryFormValues>({
    defaultValues: values,
    resolver: zodResolver(pmccEntrySchema(TODAY))
  })
  return (
    <FormProvider {...methods}>
      <input aria-label="Ticker" {...methods.register('ticker')} />
      <PmccLegSection
        leg={leg}
        preset={leg === 'long' ? LEAPS_PRESET : SHORT_PRESET}
        today={TODAY}
        active={active}
        ticker={ticker}
        pairRule={pairRule}
      />
      <p>{methods.formState.errors.__pair__?.message}</p>
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

  it('labels the long fill "Premium / share" and previews it as a debit', () => {
    render(<Harness leg="long" values={SELECTED} />)
    expect(screen.getByLabelText('Premium / share')).toHaveValue('25.00')
    expect(screen.getByText('Debit $2,500.00')).toBeInTheDocument()
  })

  it('labels the short fill "Premium / share" and previews it as a credit', () => {
    render(<Harness leg="short" values={SELECTED} />)
    expect(screen.getByLabelText('Premium / share')).toHaveValue('2.00')
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

// [US-115] The Sell Short Call sheet's use: a form with no ticker and no LEAPS leg of its own,
// a chain bounded by the live LEAPS ($85.00 · 2028-01-21), on the Background's 2027-07-23.
const SALE_DAY = '2027-07-23'

const BOUNDS: ShortCallChainBounds = { expirationBefore: '2028-01-21', strikeAbove: '85.0000' }

const SALE: OptionChainQuote = {
  ...SHORT,
  contractId: 'XYZ270820C00118000',
  strike: '118.0000',
  expiration: '2027-08-20',
  bid: '1.90',
  ask: '2.00',
  mid: '1.95',
  timestamp: '2027-07-23T14:42:00Z'
}

/** Strikes at the LEAPS strike: not above it, so the bounds drop it. */
const AT_LEAPS_STRIKE: OptionChainQuote = {
  ...SALE,
  contractId: 'XYZ270820C00085000',
  strike: '85.0000'
}

const OTHER_TICKER: OptionChainQuote = { ...SALE, contractId: 'ABC270820C00118000' }

const SALE_OPTION = 'Aug 20, 2027 · $118.00 · 28 DTE · Δ 0.30 · mid $1.95'

const UNSELECTED = EMPTY_SELL_PMCC_SHORT_DEFAULTS(SALE_DAY, 1)

const SALE_SELECTED: SellPmccShortFormValues = {
  ...UNSELECTED,
  short: {
    ...UNSELECTED.short,
    contractId: SALE.contractId,
    strike: '118.00',
    expiration: '2027-08-20'
  }
}

function SellHarness({
  values = UNSELECTED,
  bounds = BOUNDS,
  fillLabel,
  children
}: {
  values?: SellPmccShortFormValues
} & Pick<SectionProps, 'bounds' | 'fillLabel' | 'children'>): React.JSX.Element {
  const methods = useForm<SellPmccShortFormValues>({ defaultValues: values })
  return (
    <FormProvider {...methods}>
      <PmccLegSection
        leg="short"
        preset={SHORT_PRESET}
        today={SALE_DAY}
        ticker="XYZ"
        bounds={bounds}
        fillLabel={fillLabel}
        pairRule={false}
      >
        {children}
      </PmccLegSection>
    </FormProvider>
  )
}

/** Lets a blur's async validation settle before asserting what it reported. */
async function settleValidation(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function contractOptions(): (string | null)[] {
  return within(screen.getByLabelText('Contract'))
    .getAllByRole('option')
    .map((o) => o.textContent)
}

describe('PmccLegSection — US-115 options', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2027-07-23T14:45:00Z'))
    // The hook's own filter, so the list follows the ticker and bounds the section passes.
    mockUseCallChain.mockImplementation(({ ticker, preset, bounds }) => ({
      status: 'success',
      contracts: filterCallChain([SALE, AT_LEAPS_STRIKE, OTHER_TICKER], preset, {
        underlying: ticker,
        bounds
      }),
      error: null
    }))
  })

  it('requests the given ticker’s chain inside the LEAPS bounds and lists only what they cover', () => {
    render(<SellHarness />)
    expect(mockUseCallChain).toHaveBeenLastCalledWith(
      expect.objectContaining({ ticker: 'XYZ', bounds: BOUNDS })
    )
    expect(contractOptions()).toEqual(['Choose contract / enter manually', SALE_OPTION])
  })

  it('prefers the ticker prop over the form’s own ticker', () => {
    render(<Harness leg="short" values={{ ...SELECTED, ticker: 'ABC' }} ticker="XYZ" />)
    expect(mockUseCallChain).toHaveBeenLastCalledWith(expect.objectContaining({ ticker: 'XYZ' }))
    expect(mockUseUnderlyingPrice).toHaveBeenLastCalledWith('XYZ', { enabled: true })
  })

  it('captions the picker with the LEAPS bounds ahead of the preset band', () => {
    render(<SellHarness />)
    expect(
      screen.getByText(
        'XYZ calls before 2028-01-21, strikes above $85.00 · 20–45 DTE · Δ 0.25–0.35'
      )
    ).toBeInTheDocument()
  })

  it('labels the fill with fillLabel, and a picked contract leaves it empty', async () => {
    render(<SellHarness fillLabel="Actual sale price / share" />)
    expect(screen.queryByLabelText('Premium / share')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Contract'), SALE.contractId)

    expect(document.querySelector('#short-strike')).toHaveValue('118.00')
    expect(document.querySelector('#short-expiration')).toHaveValue('2027-08-20')
    expect(screen.getByLabelText('Actual sale price / share')).toHaveValue('')
  })

  it('re-runs the net-debit rule when the fill blurs, by default', async () => {
    const equalFills = { ...SELECTED, short: { ...SELECTED.short, fillPrice: '25.00' } }
    render(<Harness leg="short" values={equalFills} />)
    fireEvent.blur(screen.getByLabelText('Premium / share'))
    await settleValidation()
    expect(
      screen.getByText('This PMCC entry requires a net debit before fees.')
    ).toBeInTheDocument()
  })

  it('does not run the net-debit rule on blur with pairRule={false}', async () => {
    const equalFills = { ...SELECTED, short: { ...SELECTED.short, fillPrice: '25.00' } }
    render(<Harness leg="short" values={equalFills} pairRule={false} />)
    fireEvent.blur(screen.getByLabelText('Premium / share'))
    await settleValidation()
    expect(screen.getByLabelText('Premium / share')).toHaveValue('25.00')
    expect(
      screen.queryByText('This PMCC entry requires a net debit before fees.')
    ).not.toBeInTheDocument()
  })

  it('renders its children inside the section', () => {
    render(
      <SellHarness>
        <label htmlFor="sell-contracts">Contracts</label>
        <input id="sell-contracts" defaultValue="1" />
      </SellHarness>
    )
    const section = screen.getByText('Sell short call').closest('section')
    expect(section).toContainElement(screen.getByLabelText('Contracts'))
    expect(screen.getByLabelText('Contracts')).toHaveValue('1')
  })

  it('offers manual entry with the unavailable notice when the chain fails', async () => {
    mockUseCallChain.mockReturnValue({ status: 'error', contracts: [], error: null })
    render(<SellHarness values={SALE_SELECTED} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Quotes unavailable. Enter your filled trade manually.'
    )

    await userEvent.click(screen.getByRole('button', { name: 'Enter manually' }))

    const strike = document.querySelector('#short-strike')
    expect(strike).not.toHaveAttribute('readonly')
    expect(strike).toHaveValue('118.00')
  })

  it('holds a selected contract still inside the bounds when a refetch drops it', () => {
    const { rerender } = render(<SellHarness values={SALE_SELECTED} />)
    mockUseCallChain.mockReturnValue({ status: 'success', contracts: [], error: null })
    rerender(<SellHarness values={SALE_SELECTED} />)

    expect(contractOptions()).toEqual(['Choose contract / enter manually', SALE_OPTION])
    expect(screen.getByText('Bid $1.90 · Ask $2.00 · Mid $1.95 · Δ 0.30')).toBeInTheDocument()
  })

  it('does not put back a selected contract that the bounds now exclude', () => {
    const { rerender } = render(<SellHarness values={SALE_SELECTED} />)
    expect(contractOptions()).toEqual(['Choose contract / enter manually', SALE_OPTION])

    // A LEAPS strike of $120.00: the $118.00 call no longer strikes above it.
    const higher: ShortCallChainBounds = { ...BOUNDS, strikeAbove: '120.0000' }
    rerender(<SellHarness values={SALE_SELECTED} bounds={higher} />)

    expect(contractOptions()).toEqual(['Choose contract / enter manually'])
    expect(screen.getByText('No quote available')).toBeInTheDocument()
  })
})
