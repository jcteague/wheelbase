// [US-115] The Sell Short Call form: the header, the Coverage card, US-101's short-call section
// bounded by the LEAPS with its Contracts field, the `After this sale` preview with its green
// margin or gold advisory, the partial-coverage note, and the footer. Figures are
// plans/us-115/data-model.md § 5, valued 2027-07-23.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PmccLedgerResult } from '../../../main/core/costbasis'
import type { OptionChainQuote } from '../api/market-data'
import type { LegDetail } from '../api/positions'
import { useCallChain } from '../hooks/useCallChain'
import { useSellPmccShortForm } from '../hooks/useSellPmccShortForm'
import type { PmccEndedCycle } from '../lib/pmcc-sell-short'
import {
  XYZ_LEAPS,
  XYZ_LEAPS_3,
  XYZ_LEDGER,
  XYZ_LEDGER_3,
  xyzCycle8
} from '../test-fixtures/pmcc-sell-short'
import { SellPmccShortForm } from './SellPmccShortForm'

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

/** The picker's target: XYZ $118 · 2027-08-20, Δ 0.30. */
const Q118: OptionChainQuote = {
  contractId: 'XYZ270820C00118000',
  strike: '118.0000',
  expiration: '2027-08-20',
  contractType: 'call',
  bid: '1.90',
  ask: '2.00',
  mid: '1.95',
  lastTrade: '1.95',
  openInterest: 100,
  volume: 10,
  greeks: { delta: '0.3000', gamma: '0.0100', theta: '-0.0200', vega: '0.3000' },
  timestamp: '2027-07-23T14:30:00Z'
}

const mockUseCallChain = vi.mocked(useCallChain)
const onClose = vi.fn()
const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault())

type HarnessProps = {
  leaps?: LegDetail
  ledger?: PmccLedgerResult
  previousCycle?: PmccEndedCycle | null
  leapsDelta?: string | null
  isPending?: boolean
}

function Harness({
  leaps = XYZ_LEAPS,
  ledger = XYZ_LEDGER,
  previousCycle = xyzCycle8(),
  leapsDelta = '0.8100',
  isPending = false
}: HarnessProps): React.JSX.Element {
  const { methods, schema } = useSellPmccShortForm({
    leaps: {
      strike: leaps.strike,
      expiration: leaps.expiration,
      fillDate: leaps.fillDate,
      contracts: leaps.contracts
    },
    previousShortRetiredOn: previousCycle?.endedOn ?? null,
    today: TODAY
  })
  return (
    <FormProvider {...methods}>
      <SellPmccShortForm
        schema={schema}
        ticker="XYZ"
        leaps={leaps}
        leapsDelta={leapsDelta}
        ledger={ledger}
        previousCycle={previousCycle}
        today={TODAY}
        isPending={isPending}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </FormProvider>
  )
}

type Draft = { strike: string; expiration: string; price: string; contracts?: string }

const NEXT_SHORT: Draft = { strike: '118', expiration: '2027-08-20', price: '1.95' }
const BELOW_THE_LINE: Draft = { strike: '90', expiration: '2027-08-20', price: '1.50' }

async function enter({ strike, expiration, price, contracts }: Draft): Promise<void> {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Strike'), strike)
  await user.type(screen.getByLabelText('Expiration'), expiration)
  await user.type(screen.getByLabelText('Actual sale price / share'), price)
  if (contracts !== undefined) {
    await user.clear(screen.getByLabelText('Contracts'))
    await user.type(screen.getByLabelText('Contracts'), contracts)
  }
}

const record = (): HTMLElement => screen.getByRole('button', { name: 'Record Short Call' })

/** The error shown beside the labelled field. */
function errorBeside(label: string): HTMLElement {
  const field = screen.getByLabelText(label).closest('div.flex.flex-col')
  if (!(field instanceof HTMLElement)) throw new Error(`no field for ${label}`)
  return within(field).getByRole('alert')
}

beforeEach(() => {
  onClose.mockReset()
  onSubmit.mockClear()
  mockUseCallChain.mockReturnValue({ status: 'success', contracts: [Q118], error: null })
})

afterEach(() => {
  mockUseCallChain.mockReset()
})

describe('SellPmccShortForm — header and coverage', () => {
  it('heads the sheet SELL SHORT CALL, against the live LEAPS strike', () => {
    render(<Harness />)
    expect(screen.getByText('SELL SHORT CALL')).toBeInTheDocument()
    expect(screen.getByText('XYZ · against $85.00 LEAPS')).toBeInTheDocument()
  })

  it('shows the LEAPS and how the last cycle ended on the Coverage card', () => {
    render(<Harness />)
    const coverage = screen.getByTestId('pmcc-sell-short-coverage')
    expect(coverage).toHaveTextContent('$85.00 · 2028-01-21 · 182 DTE · Δ 0.81')
    expect(coverage).toHaveTextContent('Cycle 8 expired worthless 2027-07-16 · 7 days uncovered')
  })

  it('reads Δ — while no snapshot carries the LEAPS delta', () => {
    render(<Harness leapsDelta={null} />)
    expect(screen.getByTestId('pmcc-sell-short-coverage')).toHaveTextContent(
      '$85.00 · 2028-01-21 · 182 DTE · Δ —'
    )
  })

  it('says no short has been sold yet when no cycle has ended', () => {
    render(<Harness previousCycle={null} />)
    expect(screen.getByTestId('pmcc-sell-short-coverage')).toHaveTextContent(
      'No short call has been sold against this LEAPS yet'
    )
  })
})

describe('SellPmccShortForm — the short-call section', () => {
  it('bounds the picker by the live LEAPS and captions the bounds', () => {
    render(<Harness />)
    expect(mockUseCallChain).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ticker: 'XYZ',
        bounds: { expirationBefore: '2028-01-21', strikeAbove: '85.0000' }
      })
    )
    expect(
      screen.getByText(
        'XYZ calls before 2028-01-21, strikes above $85.00 · 20–45 DTE · Δ 0.25–0.35'
      )
    ).toBeInTheDocument()
  })

  it('labels the fill as the actual sale price, defaults contracts to the LEAPS held and today', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Actual sale price / share')).toHaveValue('')
    expect(screen.getByLabelText('Contracts')).toHaveValue('1')
    expect(screen.getByText('max 1 (LEAPS held)')).toBeInTheDocument()
    expect(screen.getByLabelText('Fill date')).toHaveValue(TODAY)
  })

  it('defaults contracts to every LEAPS contract held, and says the cap', () => {
    render(<Harness leaps={XYZ_LEAPS_3} ledger={XYZ_LEDGER_3} />)
    expect(screen.getByLabelText('Contracts')).toHaveValue('3')
    expect(screen.getByText('max 3 (LEAPS held)')).toBeInTheDocument()
  })
})

describe('SellPmccShortForm — After this sale', () => {
  it('waits for a strike, expiration and sale price before previewing', () => {
    render(<Harness />)
    expect(screen.getByTestId('pmcc-sell-short-preview')).toHaveTextContent(
      'Enter a strike, expiration and sale price to preview this sale.'
    )
    expect(screen.queryByTestId('pmcc-sell-short-credit')).not.toBeInTheDocument()
  })

  it('previews the credit and the ledger from → to, with the strike margin in green', async () => {
    render(<Harness />)
    await enter(NEXT_SHORT)

    expect(screen.getByTestId('pmcc-sell-short-credit')).toHaveTextContent(
      'Credit $195.00 · 28 DTE'
    )
    expect(screen.getByTestId('pmcc-sell-short-basis')).toHaveTextContent(
      'Cost basis after: $6.55 / share (from $8.50)'
    )
    expect(screen.getByTestId('pmcc-sell-short-effective')).toHaveTextContent(
      'Effective share cost after: $91.55 (from $93.50)'
    )
    expect(screen.getByTestId('pmcc-sell-short-recovered')).toHaveTextContent(
      'Premium recovered after: 70.9% (from 62.2%)'
    )
    const strikeLine = screen.getByTestId('pmcc-sell-short-strike-line')
    expect(strikeLine).toHaveTextContent(
      'Strike $118.00 is +$26.45 above your effective share cost'
    )
    expect(strikeLine).toHaveClass('text-wb-green')
    expect(screen.queryByTestId('pmcc-sell-short-warning')).not.toBeInTheDocument()
    expect(record()).toBeEnabled()
  })

  it('below the line, gives the gold advisory in place of the margin and still allows recording', async () => {
    render(<Harness />)
    await enter(BELOW_THE_LINE)

    expect(screen.getByTestId('pmcc-sell-short-credit')).toHaveTextContent(
      'Credit $150.00 · 28 DTE'
    )
    expect(screen.getByTestId('pmcc-sell-short-effective')).toHaveTextContent(
      'Effective share cost after: $92.00 (from $93.50)'
    )
    expect(screen.getByTestId('pmcc-sell-short-warning')).toHaveTextContent(
      'Short strike $90.00 is below your effective share cost of $92.00 after this sale. If assigned, covering from the LEAPS realizes roughly $2.00 per share of loss. You can still record it.'
    )
    expect(screen.queryByTestId('pmcc-sell-short-strike-line')).not.toBeInTheDocument()
    await waitFor(() => expect(record()).toBeEnabled())
  })

  it('notes the LEAPS contracts a partial sale leaves uncovered', async () => {
    render(<Harness leaps={XYZ_LEAPS_3} ledger={XYZ_LEDGER_3} />)
    await enter({ ...NEXT_SHORT, contracts: '1' })

    expect(screen.getByTestId('pmcc-sell-short-basis')).toHaveTextContent(
      'Cost basis after: $7.85 / share (from $8.50)'
    )
    expect(screen.getByTestId('pmcc-sell-short-uncovered')).toHaveTextContent(
      '2 LEAPS contracts remain uncovered. Only one short call can be open at a time, so they stay uncovered until this one is retired.'
    )
  })

  it('adds no uncovered note when every LEAPS contract is covered', async () => {
    render(<Harness leaps={XYZ_LEAPS_3} ledger={XYZ_LEDGER_3} />)
    await enter(NEXT_SHORT)

    expect(screen.getByTestId('pmcc-sell-short-credit')).toHaveTextContent(
      'Credit $585.00 · 28 DTE'
    )
    expect(screen.queryByTestId('pmcc-sell-short-uncovered')).not.toBeInTheDocument()
  })

  it('holds the strike line until every field is valid', async () => {
    render(<Harness />)
    await enter({ ...NEXT_SHORT, strike: '85' })

    expect(screen.getByTestId('pmcc-sell-short-guardrail-pending')).toHaveTextContent(
      'Fix the errors above to see the guardrails'
    )
    expect(screen.queryByTestId('pmcc-sell-short-strike-line')).not.toBeInTheDocument()
  })
})

describe('SellPmccShortForm — validation and footer', () => {
  it('disables Record Short Call until the entry is complete', () => {
    render(<Harness />)
    expect(record()).toBeDisabled()
  })

  it('a strike at the LEAPS strike shows the strike rule beside it and disables recording', async () => {
    render(<Harness />)
    await enter({ ...NEXT_SHORT, strike: '85' })

    await waitFor(() =>
      expect(errorBeside('Strike')).toHaveTextContent(
        'Short-call strike must be above the LEAPS strike.'
      )
    )
    expect(record()).toBeDisabled()
  })

  it('more contracts than the LEAPS holds is rejected beside Contracts and disables recording', async () => {
    render(<Harness />)
    await enter({ ...NEXT_SHORT, contracts: '2' })

    await waitFor(() =>
      expect(errorBeside('Contracts')).toHaveTextContent(
        'Cannot sell more short calls than LEAPS contracts held (1).'
      )
    )
    expect(record()).toBeDisabled()
  })

  it('reads Recording… and stays disabled while the sale is pending', async () => {
    render(<Harness isPending />)
    await enter(NEXT_SHORT)

    expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled()
  })

  it('submits through onSubmit', async () => {
    render(<Harness />)
    await enter(NEXT_SHORT)
    await waitFor(() => expect(record()).toBeEnabled())

    await userEvent.click(record())

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('Cancel closes the sheet', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
