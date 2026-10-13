// [US-104] The Roll Short Call form: decision context, the replacement fields, the net preview,
// the below-effective-cost advisory and the four client-side rejections.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider } from 'react-hook-form'
import { vi } from 'vitest'
import { useRollPmccShortCallForm } from '../hooks/useRollPmccShortCallForm'
import { OPEN_LEAPS as LEAPS, OPEN_SHORT } from '../test-fixtures/pmcc-roll'
import { RollPmccShortCallForm } from './RollPmccShortCallForm'

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

const TODAY = '2026-11-06'

type Draft = { cost: string; strike: string; expiration: string; premium: string }

const UP_OUT: Draft = { cost: '3.00', strike: '112', expiration: '2026-12-18', premium: '2.40' }
const OUT_CREDIT: Draft = { ...UP_OUT, cost: '1.10', strike: '108', premium: '2.30' }
const BELOW_EFF: Draft = { ...UP_OUT, strike: '98', premium: '2.50' }
const OUTLASTS: Draft = { ...UP_OUT, expiration: '2027-09-17', premium: '6.80' }
const ROLLS_IN: Draft = { ...UP_OUT, expiration: '2026-11-13', premium: '0.90' }
const NO_CHANGE: Draft = { ...UP_OUT, strike: '108', expiration: '2026-11-20' }

const onClose = vi.fn()
const onSubmit = vi.fn()

function Harness({ isPending = false }: { isPending?: boolean }): React.JSX.Element {
  const { methods, schema } = useRollPmccShortCallForm(
    { openShort: OPEN_SHORT, leapsExpiration: LEAPS.expiration },
    TODAY
  )
  return (
    <FormProvider {...methods}>
      <RollPmccShortCallForm
        schema={schema}
        ticker="XYZ"
        openShort={OPEN_SHORT}
        leaps={LEAPS}
        basisPerShare="21.2000"
        effectiveShareCost="101.2000"
        today={TODAY}
        isPending={isPending}
        onSubmit={onSubmit}
        onClose={onClose}
      />
    </FormProvider>
  )
}

const input = (id: string): HTMLInputElement => {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input #${id}`)
  return el
}

async function fill(draft: Draft): Promise<void> {
  const user = userEvent.setup()
  const entries: Array<[string, string]> = [
    ['pmcc-roll-cost-to-close', draft.cost],
    ['pmcc-roll-strike', draft.strike],
    ['pmcc-roll-premium', draft.premium],
    ['pmcc-roll-expiration', draft.expiration]
  ]
  for (const [id, value] of entries) {
    await user.clear(input(id))
    await user.type(input(id), value)
  }
}

const confirm = (): HTMLElement => screen.getByTestId('pmcc-roll-confirm')

function row(label: string, scope: HTMLElement = document.body): HTMLElement {
  const el = within(scope).getByText(label).parentElement
  if (!el) throw new Error(`no row ${label}`)
  return el
}

function section(title: string): HTMLElement {
  const el = Array.from(document.querySelectorAll('section')).find(
    (card) => card.firstElementChild?.textContent === title
  )
  if (!el) throw new Error(`no section ${title}`)
  return el
}

function fieldOf(id: string): HTMLElement {
  const el = input(id).closest('.flex.flex-col')
  if (!(el instanceof HTMLElement)) throw new Error(`no field for #${id}`)
  return el
}

beforeEach(() => {
  onClose.mockReset()
  onSubmit.mockReset()
})

describe('RollPmccShortCallForm — header and context', () => {
  it('shows the eyebrow, title and the open short as the subtitle', () => {
    render(<Harness />)
    expect(screen.getByText('ROLL SHORT CALL')).toBeInTheDocument()
    expect(screen.getByText('Roll Short Call')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent(
      'XYZ CALL $108.00 · exp 2026-11-20 · 14 DTE'
    )
  })

  it('lists the current short call, the read-only LEAPS and the effective share cost', () => {
    render(<Harness />)
    const current = section('Current short call')
    expect(row('Contract', current)).toHaveTextContent('XYZ $108.00 CALL')
    expect(row('Expiration', current)).toHaveTextContent('2026-11-20 (14 DTE)')
    expect(row('Sold at', current)).toHaveTextContent('$1.80 / share')
    expect(row('LEAPS · read-only', current)).toHaveTextContent('$80.00 · 2027-09-17')
    expect(row('Effective share cost', current)).toHaveTextContent('$101.20')
    expect(within(current).getByText(/Not a guaranteed breakeven/)).toBeInTheDocument()
  })

  it('shows the coverage ruler', () => {
    render(<Harness />)
    expect(screen.getByTestId('pmcc-coverage-ruler')).toBeInTheDocument()
  })

  it('before a replacement is entered, the ruler ticks today, the short and the LEAPS and states both runs', () => {
    render(<Harness />)
    const ruler = screen.getByTestId('pmcc-coverage-ruler')
    const ticks = Array.from(ruler.querySelectorAll('[data-mark]')).map((el) =>
      el.getAttribute('data-mark')
    )
    expect(ticks).toEqual(['today', 'current', 'leaps'])
    expect(within(ruler).getByText('Replacement short call').parentElement).toHaveTextContent(
      'not entered'
    )
    expect(ruler).toHaveTextContent(
      'Current short call expires in 14 days. The LEAPS covers 315 days.'
    )
    expect(ruler).toHaveAttribute('data-blocked', 'false')
  })

  it('a valid replacement adds its tick and states the remaining LEAPS coverage', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    const ruler = screen.getByTestId('pmcc-coverage-ruler')
    expect(ruler.querySelector('[data-mark="replacement"]')).toHaveClass('bg-wb-gold')
    expect(ruler).toHaveTextContent(
      'Replacement short at 42 DTE. The LEAPS still covers it by 273 days.'
    )
  })

  it('a replacement before the current short tints the ruler red as a buyback', async () => {
    render(<Harness />)
    await fill(ROLLS_IN)
    const ruler = screen.getByTestId('pmcc-coverage-ruler')
    expect(ruler).toHaveAttribute('data-blocked', 'true')
    expect(ruler).toHaveTextContent(
      'The replacement expires before the current short call — that is a buyback, not a roll.'
    )
  })
})

describe('RollPmccShortCallForm — fields', () => {
  it('renders the replacement inputs, the fill date defaulting to today, and read-only contracts', () => {
    render(<Harness />)
    ;[
      'pmcc-roll-cost-to-close',
      'pmcc-roll-strike',
      'pmcc-roll-premium',
      'pmcc-roll-expiration'
    ].forEach((id) => expect(input(id)).toHaveValue(''))
    expect(input('pmcc-roll-fill-date')).toHaveValue(TODAY)
    expect(input('pmcc-roll-contracts')).toHaveValue('1')
    expect(input('pmcc-roll-contracts')).toHaveAttribute('readonly')
  })

  it('shows the placeholder and no net until both cash fields are entered', () => {
    render(<Harness />)
    expect(
      screen.getByText('Enter a cost to close and a premium to preview the net.')
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pmcc-roll-net')).not.toBeInTheDocument()
  })

  it('always shows the draft note; Cancel calls onClose', async () => {
    render(<Harness />)
    expect(
      screen.getByText('Your draft is kept until the roll is valid. No order is placed.')
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('starts with the confirm disabled', async () => {
    render(<Harness />)
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('shows the pending label while recording', () => {
    render(<Harness isPending />)
    expect(confirm()).toHaveTextContent('Recording…')
    expect(confirm()).toBeDisabled()
  })
})

describe('RollPmccShortCallForm — net preview', () => {
  it('a roll up and out previews a net debit, its label, DTE and the post-roll costs', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    const net = screen.getByTestId('pmcc-roll-net')
    expect(net).toHaveTextContent('Net Debit: $0.60 per share ($60.00 total)')
    expect(screen.getByTestId('pmcc-roll-net-amount')).toHaveClass('text-wb-red')
    expect(screen.getByTestId('pmcc-roll-label')).toHaveTextContent(
      'Roll Up & Out: $108 to $112 strike, Nov to Dec expiration · 42 DTE'
    )
    expect(within(fieldOf('pmcc-roll-expiration')).getByText('42 DTE')).toBeInTheDocument()
    expect(row('Cost basis after roll')).toHaveTextContent('$21.80 / share (from $21.20)')
    expect(row('Effective share cost after roll')).toHaveTextContent('$101.80 (from $101.20)')
    await waitFor(() => expect(confirm()).toBeEnabled())
  })

  it('a roll out at the same strike previews a net credit', async () => {
    render(<Harness />)
    await fill(OUT_CREDIT)
    expect(screen.getByTestId('pmcc-roll-net')).toHaveTextContent(
      'Net Credit: $1.20 per share ($120.00 total)'
    )
    expect(screen.getByTestId('pmcc-roll-net-amount')).toHaveClass('text-wb-green')
    expect(screen.getByTestId('pmcc-roll-label')).toHaveTextContent(
      'Roll Out: same $108 strike, Nov to Dec expiration'
    )
    await waitFor(() => expect(confirm()).toBeEnabled())
  })

  it('warns when the replacement strike sits below the post-roll effective share cost', async () => {
    render(<Harness />)
    await fill(BELOW_EFF)
    expect(screen.getByTestId('pmcc-roll-warning')).toHaveTextContent(
      'Short strike $98.00 is below your effective share cost of $101.70 after this roll. If assigned, covering from the LEAPS realizes roughly $3.70 per share of loss.'
    )
    await waitFor(() => expect(confirm()).toBeEnabled())
  })

  it('shows no warning for a strike above the effective share cost', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    expect(screen.queryByTestId('pmcc-roll-warning')).not.toBeInTheDocument()
  })
})

describe('RollPmccShortCallForm — rejections', () => {
  it('a roll that changes nothing shows the no-change error and disables confirm', async () => {
    render(<Harness />)
    await fill(NO_CHANGE)
    expect(await screen.findByTestId('pmcc-roll-no-change')).toHaveTextContent(
      'Roll must change the strike, the expiration, or both'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a replacement before the current short reports beside the expiration', async () => {
    render(<Harness />)
    await fill(ROLLS_IN)
    expect(fieldOf('pmcc-roll-expiration')).toHaveTextContent(
      'Replacement expiration must be on or after the current expiration (Nov 20, 2026)'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a replacement that outlasts the LEAPS is blocked at the field, the ruler and the footer', async () => {
    render(<Harness />)
    await fill(OUTLASTS)
    expect(fieldOf('pmcc-roll-expiration')).toHaveTextContent(
      'Short call must expire before the LEAPS call.'
    )
    expect(screen.getByTestId('pmcc-coverage-ruler')).toHaveAttribute('data-blocked', 'true')
    expect(screen.getByTestId('pmcc-coverage-ruler')).toHaveTextContent(
      'The replacement short reaches the LEAPS. Past this point the short call is naked.'
    )
    expect(
      screen.getByText(
        'The XYZ $108.00 short call stays open at 2026-11-20. No close or replacement leg is recorded.'
      )
    ).toBeInTheDocument()
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a zero cost to close reports beside the field', async () => {
    render(<Harness />)
    await fill({ ...UP_OUT, cost: '0.00' })
    expect(fieldOf('pmcc-roll-cost-to-close')).toHaveTextContent(
      'Cost to close must be greater than zero'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a zero replacement premium reports beside the field', async () => {
    render(<Harness />)
    await fill({ ...UP_OUT, premium: '0.00' })
    expect(fieldOf('pmcc-roll-premium')).toHaveTextContent(
      'Replacement premium must be greater than zero'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('changing only the fill date re-checks the expiration-after-fill rule both ways', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await fill({ ...UP_OUT, expiration: '2026-11-27' })
    await waitFor(() => expect(confirm()).toBeEnabled())

    await user.clear(input('pmcc-roll-fill-date'))
    await user.type(input('pmcc-roll-fill-date'), '2026-11-28')
    await waitFor(() =>
      expect(fieldOf('pmcc-roll-expiration')).toHaveTextContent(
        'Expiration must be after the fill date.'
      )
    )
    expect(confirm()).toBeDisabled()

    await user.clear(input('pmcc-roll-fill-date'))
    await user.type(input('pmcc-roll-fill-date'), '2026-11-20')
    await waitFor(() => expect(confirm()).toBeEnabled())
    expect(fieldOf('pmcc-roll-expiration')).not.toHaveTextContent(
      'Expiration must be after the fill date.'
    )
  })

  it('a valid roll shows none of the rejection messages', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    expect(screen.queryByTestId('pmcc-roll-no-change')).not.toBeInTheDocument()
    expect(screen.queryByText(/stays open at/)).not.toBeInTheDocument()
    expect(screen.getByTestId('pmcc-coverage-ruler')).toHaveAttribute('data-blocked', 'false')
  })
})
