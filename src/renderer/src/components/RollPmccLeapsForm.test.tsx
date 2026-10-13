// [US-105] The Roll LEAPS form: the decision context for the open LEAPS, the replacement fields,
// the net preview with the re-anchored effective share cost, the advisories and the rejections.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useFormContext } from 'react-hook-form'
import { vi } from 'vitest'
import type { LegDetail } from '../api/positions'
import { useRollPmccLeapsForm } from '../hooks/useRollPmccLeapsForm'
import type { RollPmccLeapsFormValues } from '../schemas/roll-pmcc-leaps'
import {
  LEAPS_LEDGER,
  LEAPS_LEG,
  LEAPS_OPEN_SHORT,
  LEAPS_TODAY as TODAY,
  LEAPS_LAST_EVENT_DATE
} from '../test-fixtures/pmcc-leaps-roll'
import { RollPmccLeapsForm } from './RollPmccLeapsForm'

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

type Draft = { proceeds: string; strike: string; expiration: string; debit: string }

const UP_OUT: Draft = { proceeds: '26.00', strike: '85', expiration: '2028-01-21', debit: '23.50' }
const OUT_DEBIT: Draft = { ...UP_OUT, strike: '80', debit: '29.20' }
const TOO_MUCH_TIME: Draft = { ...OUT_DEBIT, expiration: '2029-01-19', debit: '37.00' }
const SHORTENS: Draft = { ...OUT_DEBIT, expiration: '2027-08-20', debit: '26.60' }
const STRIKE_ABOVE: Draft = { ...UP_OUT, strike: '112', debit: '9.00' }
const UNCOVERS: Draft = { ...UP_OUT, expiration: '2027-07-16', debit: '20.20' }
const NO_CHANGE: Draft = { ...OUT_DEBIT, expiration: '2027-09-17', debit: '26.00' }
const ZERO_PROCEEDS: Draft = { ...UP_OUT, proceeds: '0.00' }
const ZERO_DEBIT: Draft = { ...UP_OUT, debit: '0.00' }

const onClose = vi.fn()
const onSubmit = vi.fn()

type HarnessProps = {
  openShort?: LegDetail | null
  isPending?: boolean
  children?: React.ReactNode
}

/** Stands in for a failed save that reports on the expiration: values valid, field in error. */
function ServerExpirationError(): React.JSX.Element {
  const { setError } = useFormContext<RollPmccLeapsFormValues>()
  return (
    <button
      type="button"
      onClick={() => setError('newExpiration', { message: 'Rejected by the server.' })}
    >
      server error
    </button>
  )
}

function Harness({
  openShort = LEAPS_OPEN_SHORT,
  isPending = false,
  children
}: HarnessProps): React.JSX.Element {
  const { methods, schema } = useRollPmccLeapsForm(
    { leaps: LEAPS_LEG, openShort, lastEventDate: LEAPS_LAST_EVENT_DATE },
    TODAY
  )
  return (
    <FormProvider {...methods}>
      <RollPmccLeapsForm
        schema={schema}
        ticker="XYZ"
        leaps={LEAPS_LEG}
        openShort={openShort}
        ledger={LEAPS_LEDGER}
        today={TODAY}
        isPending={isPending}
        onSubmit={onSubmit}
        onClose={onClose}
      />
      {children}
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
    ['pmcc-leaps-roll-proceeds', draft.proceeds],
    ['pmcc-leaps-roll-strike', draft.strike],
    ['pmcc-leaps-roll-debit', draft.debit],
    ['pmcc-leaps-roll-expiration', draft.expiration]
  ]
  for (const [id, value] of entries) {
    await user.clear(input(id))
    await user.type(input(id), value)
  }
}

const confirm = (): HTMLElement => screen.getByTestId('pmcc-leaps-roll-confirm')
const ruler = (): HTMLElement => screen.getByTestId('pmcc-coverage-ruler')
const STAYS_OPEN =
  'The XYZ $80.00 LEAPS stays open at 2027-09-17. No close or replacement leg is recorded.'

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

const ticks = (): Array<string | null> =>
  Array.from(ruler().querySelectorAll('[data-mark]')).map((el) => el.getAttribute('data-mark'))

const isHighlighted = (el: HTMLElement): boolean =>
  (el.getAttribute('style') ?? '').includes('gold-subtle')

beforeEach(() => {
  onClose.mockReset()
  onSubmit.mockReset()
})

describe('RollPmccLeapsForm — header and coverage', () => {
  it('shows the eyebrow, title and the current LEAPS as the subtitle', () => {
    render(<Harness />)
    expect(screen.getByText('ROLL LEAPS')).toBeInTheDocument()
    expect(screen.getByText('Roll LEAPS Call')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-subtitle')).toHaveTextContent(
      'XYZ CALL $80.00 · exp 2027-09-17 · 70 DTE'
    )
  })

  it('before a replacement is entered, ticks today, the short and the current LEAPS', () => {
    render(<Harness />)
    expect(section('Coverage')).toContainElement(ruler())
    expect(ticks()).toEqual(['today', 'short', 'current'])
    expect(ruler()).toHaveAttribute('data-blocked', 'false')
  })

  it('lists every mark in the legend, the replacement as not entered', () => {
    render(<Harness />)
    const legend = (label: string): HTMLElement => row(label, ruler())
    expect(legend('Today')).toHaveTextContent(TODAY)
    expect(legend('Open short call')).toHaveTextContent('2027-07-16 · 7 DTE')
    expect(legend('Current LEAPS (selling)')).toHaveTextContent('2027-09-17 · 70 DTE')
    expect(legend('Replacement LEAPS (buying)')).toHaveTextContent('not entered')
  })

  it('names the decay window and the short call that needs cover', () => {
    render(<Harness />)
    expect(ruler()).toHaveTextContent(
      'Current LEAPS expires in 70 days — inside the window where its time value starts to decay fast. The open short call needs cover past 2027-07-16.'
    )
  })

  it('a valid replacement adds its tick in gold', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    expect(ticks()).toEqual(['today', 'short', 'current', 'replacement'])
    expect(ruler().querySelector('[data-mark="replacement"]')).toHaveClass('bg-wb-gold')
    expect(row('Replacement LEAPS (buying)', ruler())).toHaveTextContent('2028-01-21 · 196 DTE')
  })
})

describe('RollPmccLeapsForm — current LEAPS and the open short', () => {
  it('lists the current LEAPS, its costs and the effective share cost highlighted', () => {
    render(<Harness />)
    const current = section('Current LEAPS')
    expect(row('Contract', current)).toHaveTextContent('XYZ $80.00 CALL')
    expect(row('Expiration', current)).toHaveTextContent('2027-09-17 (70 DTE)')
    expect(row('Bought at', current)).toHaveTextContent('$25.00 / share')
    expect(row('LEAPS cost to date', current)).toHaveTextContent('$25.00 / share')
    expect(row('Cost basis', current)).toHaveTextContent('$21.80 / share')
    expect(row('Effective share cost', current)).toHaveTextContent('$101.80')
    expect(isHighlighted(row('Effective share cost', current))).toBe(true)
    expect(current).toHaveTextContent(
      'the $80.00 strike plus $21.80 of basis. Re-anchors to the replacement strike after this roll.'
    )
  })

  it('lists the open short call read-only', () => {
    render(<Harness />)
    const short = section('Open short call')
    expect(row('Contract', short)).toHaveTextContent('XYZ $112.00 CALL')
    expect(row('Expiration', short)).toHaveTextContent('2027-07-16 (7 DTE)')
    expect(row('Sold at', short)).toHaveTextContent('$2.40 / share')
    expect(short).toHaveTextContent(
      'Read-only. The replacement LEAPS must expire after it and strike below it.'
    )
  })

  it('with no short open, says so and lists the short as none on the ruler', () => {
    render(<Harness openShort={null} />)
    expect(section('Open short call')).toHaveTextContent(
      'No short call open — nothing to cover, so the expiration and strike checks are skipped.'
    )
    expect(within(section('Open short call')).queryByText('Contract')).not.toBeInTheDocument()
    expect(row('Open short call', ruler())).toHaveTextContent('none')
    expect(ticks()).toEqual(['today', 'current'])
    expect(ruler()).toHaveTextContent(
      'Current LEAPS expires in 70 days — inside the window where its time value starts to decay fast.'
    )
    expect(ruler()).not.toHaveTextContent('needs cover')
  })
})

describe('RollPmccLeapsForm — fields', () => {
  it('renders the replacement inputs: strike pre-filled, fill date today, contracts read-only', () => {
    render(<Harness />)
    expect(input('pmcc-leaps-roll-proceeds')).toHaveValue('')
    expect(input('pmcc-leaps-roll-debit')).toHaveValue('')
    expect(input('pmcc-leaps-roll-strike')).toHaveValue('80.00')
    expect(input('pmcc-leaps-roll-expiration')).toHaveValue('')
    expect(input('pmcc-leaps-roll-fill-date')).toHaveValue(TODAY)
    expect(input('pmcc-leaps-roll-contracts')).toHaveValue('1')
    expect(input('pmcc-leaps-roll-contracts')).toHaveAttribute('readonly')
  })

  it('labels each input', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Proceeds from close / share')).toBe(
      input('pmcc-leaps-roll-proceeds')
    )
    expect(screen.getByLabelText('Debit (buy to open) / share')).toBe(
      input('pmcc-leaps-roll-debit')
    )
    expect(screen.getByLabelText('Strike')).toBe(input('pmcc-leaps-roll-strike'))
    expect(screen.getByLabelText('Contracts')).toBe(input('pmcc-leaps-roll-contracts'))
  })

  it('shows the replacement DTE beside the expiration once it is valid', async () => {
    render(<Harness />)
    expect(fieldOf('pmcc-leaps-roll-expiration')).not.toHaveTextContent('DTE')
    await fill(UP_OUT)
    expect(within(fieldOf('pmcc-leaps-roll-expiration')).getByText('196 DTE')).toBeInTheDocument()
  })

  it('shows the placeholder and no net until both cash fields are entered', () => {
    render(<Harness />)
    expect(
      screen.getByText(
        'Enter the proceeds from close and the replacement debit to preview the net.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByTestId('pmcc-leaps-roll-net')).not.toBeInTheDocument()
  })

  it('previews the net but no post-roll figures while the strike is empty', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    await userEvent.clear(input('pmcc-leaps-roll-strike'))
    expect(screen.getByTestId('pmcc-leaps-roll-net')).toHaveTextContent(
      'Net Credit: $2.50 per share ($250.00 total)'
    )
    expect(screen.queryByText('Cost basis after roll')).not.toBeInTheDocument()
    expect(screen.queryByText('Effective share cost after roll')).not.toBeInTheDocument()
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

  it('always shows the draft note; Cancel calls onClose', async () => {
    render(<Harness />)
    expect(
      screen.getByText('Your draft is kept until the roll is valid. No order is placed.')
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('RollPmccLeapsForm — net preview', () => {
  it('a roll up and out previews a net credit and re-anchors the effective share cost', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    expect(screen.getByTestId('pmcc-leaps-roll-net')).toHaveTextContent(
      'Net Credit: $2.50 per share ($250.00 total)'
    )
    expect(screen.getByTestId('pmcc-leaps-roll-net-amount')).toHaveClass('text-wb-green')
    expect(screen.getByTestId('pmcc-leaps-roll-label')).toHaveTextContent(
      'Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration · 196 DTE'
    )
    expect(row('Cost basis after roll')).toHaveTextContent('$19.30 / share (from $21.80)')
    expect(row('LEAPS cost to date after')).toHaveTextContent('$22.50 / share (from $25.00)')
    expect(row('Effective share cost after roll')).toHaveTextContent('$104.30 (from $101.80)')
    expect(isHighlighted(row('Effective share cost after roll'))).toBe(true)
    expect(
      screen.getByText(
        '$85.00 strike + $19.30 basis · up $2.50 from $101.80. Cash came out, but the strike moved up more than the credit.'
      )
    ).toBeInTheDocument()
    await waitFor(() => expect(confirm()).toBeEnabled())
    expect(screen.queryByTestId('pmcc-leaps-roll-warning')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pmcc-leaps-roll-coverage-note')).not.toBeInTheDocument()
  })

  it('a roll out at the same strike previews a net debit that lands in the basis', async () => {
    render(<Harness />)
    await fill(OUT_DEBIT)
    expect(screen.getByTestId('pmcc-leaps-roll-net')).toHaveTextContent(
      'Net Debit: $3.20 per share ($320.00 total)'
    )
    expect(screen.getByTestId('pmcc-leaps-roll-net-amount')).toHaveClass('text-wb-red')
    expect(screen.getByTestId('pmcc-leaps-roll-label')).toHaveTextContent(
      'Roll Out: same $80 strike, Sep 2027 to Jan 2028 expiration · 196 DTE'
    )
    expect(row('Cost basis after roll')).toHaveTextContent('$25.00 / share (from $21.80)')
    expect(row('LEAPS cost to date after')).toHaveTextContent('$28.20 / share (from $25.00)')
    expect(row('Effective share cost after roll')).toHaveTextContent('$105.00 (from $101.80)')
    expect(
      screen.getByText(
        '$80.00 strike + $25.00 basis · up $3.20 from $101.80. You are buying time value; it lands in the basis.'
      )
    ).toBeInTheDocument()
    await waitFor(() => expect(confirm()).toBeEnabled())
  })

  it('a credit at the same strike says down and that the cash lowers the basis', async () => {
    render(<Harness />)
    await fill({ ...OUT_DEBIT, debit: '24.00' })
    expect(
      screen.getByText(
        '$80.00 strike + $19.80 basis · down $2.00 from $101.80. Cash came out; it lowers the basis.'
      )
    ).toBeInTheDocument()
  })

  it('a credit at a lower strike says the cash lowers the basis', async () => {
    render(<Harness />)
    await fill({ ...OUT_DEBIT, strike: '75', debit: '24.00' })
    expect(
      screen.getByText(
        '$75.00 strike + $19.80 basis · down $7.00 from $101.80. Cash came out; it lowers the basis.'
      )
    ).toBeInTheDocument()
  })

  it('an even roll reads Net Even in the neutral tone, unchanged, and that no cash moved', async () => {
    render(<Harness />)
    await fill({ ...OUT_DEBIT, debit: '26.00' })
    expect(screen.getByTestId('pmcc-leaps-roll-net')).toHaveTextContent(
      'Net Even: $0.00 per share ($0.00 total)'
    )
    const amount = screen.getByTestId('pmcc-leaps-roll-net-amount')
    expect(amount).toHaveClass('text-wb-text-secondary')
    expect(amount).not.toHaveClass('text-wb-green')
    expect(amount).not.toHaveClass('text-wb-red')
    expect(
      screen.getByText('$80.00 strike + $21.80 basis · unchanged. No net cash changed hands.')
    ).toBeInTheDocument()
  })

  it('warns when the effective share cost after the roll rises above the open short strike', async () => {
    render(<Harness />)
    await fill(TOO_MUCH_TIME)
    expect(screen.getByTestId('pmcc-leaps-roll-net')).toHaveTextContent(
      'Net Debit: $11.00 per share ($1,100.00 total)'
    )
    expect(screen.getByTestId('pmcc-leaps-roll-warning')).toHaveTextContent(
      /^Open short strike \$112\.00 is below your effective share cost of \$112\.80 after this roll\. If assigned, covering from the LEAPS realizes roughly \$0\.80 per share of loss\.$/
    )
    await waitFor(() => expect(confirm()).toBeEnabled())
  })

  it('a replacement that shortens coverage gets an advisory note and stays allowed', async () => {
    render(<Harness />)
    await fill(SHORTENS)
    expect(screen.getByTestId('pmcc-leaps-roll-net')).toHaveTextContent(
      'Net Debit: $0.60 per share ($60.00 total)'
    )
    expect(screen.getByTestId('pmcc-leaps-roll-coverage-note')).toHaveTextContent(
      'Replacement LEAPS is 42 DTE, 28 days shorter than the current LEAPS. It still covers the open short call.'
    )
    expect(screen.getByTestId('pmcc-leaps-roll-label')).toHaveTextContent(/^Roll In:/)
    expect(ruler()).toHaveAttribute('data-blocked', 'false')
    await waitFor(() => expect(confirm()).toBeEnabled())
  })
})

describe('RollPmccLeapsForm — rejections', () => {
  it('a strike at the short strike is rejected at the field, the ruler stays clear', async () => {
    render(<Harness />)
    await fill(STRIKE_ABOVE)
    expect(fieldOf('pmcc-leaps-roll-strike')).toHaveTextContent(
      'LEAPS strike must be below the short-call strike ($112.00).'
    )
    expect(screen.getByText(STAYS_OPEN)).toBeInTheDocument()
    expect(ruler()).toHaveAttribute('data-blocked', 'false')
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a replacement expiring with the short is blocked at the field, the ruler and the footer', async () => {
    render(<Harness />)
    await fill(UNCOVERS)
    expect(fieldOf('pmcc-leaps-roll-expiration')).toHaveTextContent(
      'LEAPS call must expire after the short call.'
    )
    expect(fieldOf('pmcc-leaps-roll-expiration')).not.toHaveTextContent('DTE')
    expect(ruler()).toHaveAttribute('data-blocked', 'true')
    expect(ruler()).toHaveTextContent(
      'The replacement LEAPS expires on or before the short call. Past this point the short call is naked.'
    )
    expect(screen.getByText(STAYS_OPEN)).toBeInTheDocument()
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a strike that is not positive is rejected at the field without the stays-open footer', async () => {
    render(<Harness />)
    await fill({ ...UP_OUT, strike: '0' })
    expect(fieldOf('pmcc-leaps-roll-strike')).toHaveTextContent('Strike must be positive')
    expect(screen.queryByText(STAYS_OPEN)).not.toBeInTheDocument()
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a server error on a valid expiration keeps a numeric DTE in the roll label', async () => {
    render(
      <Harness>
        <ServerExpirationError />
      </Harness>
    )
    await fill(UP_OUT)
    await userEvent.click(screen.getByRole('button', { name: 'server error' }))
    expect(fieldOf('pmcc-leaps-roll-expiration')).toHaveTextContent('Rejected by the server.')
    const label = screen.getByTestId('pmcc-leaps-roll-label')
    expect(label).toHaveTextContent(
      'Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration · 196 DTE'
    )
    expect(label).not.toHaveTextContent('null')
  })

  it('a roll that changes nothing shows the no-change error and disables confirm', async () => {
    render(<Harness />)
    await fill(NO_CHANGE)
    expect(await screen.findByTestId('pmcc-leaps-roll-no-change')).toHaveTextContent(
      'Roll must change the strike, the expiration, or both'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('zero proceeds report beside the field', async () => {
    render(<Harness />)
    await fill(ZERO_PROCEEDS)
    expect(fieldOf('pmcc-leaps-roll-proceeds')).toHaveTextContent(
      'Proceeds from close must be greater than zero'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a zero replacement debit reports beside the field', async () => {
    render(<Harness />)
    await fill(ZERO_DEBIT)
    expect(fieldOf('pmcc-leaps-roll-debit')).toHaveTextContent(
      'Replacement debit must be greater than zero'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  it('a fill date before the last recorded event reports beside the field and disables confirm', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    const user = userEvent.setup()
    await user.clear(input('pmcc-leaps-roll-fill-date'))
    await user.type(input('pmcc-leaps-roll-fill-date'), '2027-06-17')
    expect(fieldOf('pmcc-leaps-roll-fill-date')).toHaveTextContent(
      'Fill date cannot be before the last recorded event (Jun 18, 2027)'
    )
    await waitFor(() => expect(confirm()).toBeDisabled())
  })

  describe('a fill-date change re-checks the replacement expiration', () => {
    const EXPIRATION_NOT_AFTER_FILL = 'Expiration must be after the fill date.'

    async function setFillDate(value: string): Promise<void> {
      const user = userEvent.setup()
      await user.clear(input('pmcc-leaps-roll-fill-date'))
      await user.type(input('pmcc-leaps-roll-fill-date'), value)
    }

    it.each([
      ['with no short open', null],
      ['with the short open', LEAPS_OPEN_SHORT]
    ])(
      '%s: moving the fill date onto the expiration reports it there; moving it back clears it',
      async (_name, openShort) => {
        render(<Harness openShort={openShort} />)
        await fill(SHORTENS)
        await waitFor(() => expect(confirm()).toBeEnabled())

        await setFillDate(SHORTENS.expiration)
        expect(fieldOf('pmcc-leaps-roll-expiration')).toHaveTextContent(EXPIRATION_NOT_AFTER_FILL)
        await waitFor(() => expect(confirm()).toBeDisabled())

        await setFillDate(TODAY)
        await waitFor(() =>
          expect(fieldOf('pmcc-leaps-roll-expiration')).not.toHaveTextContent(
            EXPIRATION_NOT_AFTER_FILL
          )
        )
        await waitFor(() => expect(confirm()).toBeEnabled())
        expect(screen.getByTestId('pmcc-leaps-roll-label')).not.toHaveTextContent('null')
      }
    )

    it('an expiration rejected against a late fill date clears once the fill date moves back', async () => {
      render(<Harness openShort={null} />)
      await setFillDate(SHORTENS.expiration)
      await fill(SHORTENS)
      expect(fieldOf('pmcc-leaps-roll-expiration')).toHaveTextContent(EXPIRATION_NOT_AFTER_FILL)
      await waitFor(() => expect(confirm()).toBeDisabled())

      await setFillDate(TODAY)
      await waitFor(() =>
        expect(fieldOf('pmcc-leaps-roll-expiration')).not.toHaveTextContent(
          EXPIRATION_NOT_AFTER_FILL
        )
      )
      expect(within(fieldOf('pmcc-leaps-roll-expiration')).getByText('42 DTE')).toBeInTheDocument()
      await waitFor(() => expect(confirm()).toBeEnabled())
    })
  })

  it('a valid roll shows none of the rejection messages', async () => {
    render(<Harness />)
    await fill(UP_OUT)
    expect(screen.queryByTestId('pmcc-leaps-roll-no-change')).not.toBeInTheDocument()
    expect(screen.queryByText(STAYS_OPEN)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('RollPmccLeapsForm — no short call open', () => {
  it.each([
    ['a strike above the old short', STRIKE_ABOVE],
    ['an expiration on the old short', UNCOVERS]
  ])('%s is not checked and the confirm is enabled', async (_name, draft) => {
    render(<Harness openShort={null} />)
    await fill(draft)
    await waitFor(() => expect(confirm()).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(STAYS_OPEN)).not.toBeInTheDocument()
    expect(ruler()).toHaveAttribute('data-blocked', 'false')
  })

  it('never warns: there is no short strike to compare', async () => {
    render(<Harness openShort={null} />)
    await fill(TOO_MUCH_TIME)
    await waitFor(() => expect(confirm()).toBeEnabled())
    expect(screen.queryByTestId('pmcc-leaps-roll-warning')).not.toBeInTheDocument()
  })

  it('a shortening note omits the short-call sentence', async () => {
    render(<Harness openShort={null} />)
    await fill(SHORTENS)
    expect(screen.getByTestId('pmcc-leaps-roll-coverage-note')).toHaveTextContent(
      /^Replacement LEAPS is 42 DTE, 28 days shorter than the current LEAPS\.$/
    )
  })
})
