// [US-104] [US-105] The shared PMCC roll fields grid: the two cash inputs it is given, strike,
// expiration with its DTE, fill date and the read-only contracts — and the re-checks it owns.
import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm, useFormContext } from 'react-hook-form'
import { vi } from 'vitest'
import { z } from 'zod'
import { PmccRollFields } from './PmccRollFields'

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

const AFTER_FILL = 'Expiration must be after the fill date'
const NO_CHANGE = 'Roll must change the strike, the expiration, or both'

// A stand-in for a roll schema: the two cross-field rules whose re-checks the grid owns.
const schema = z
  .object({
    sold: z.string().min(1, 'Sold is required'),
    bought: z.string(),
    newStrike: z.string(),
    newExpiration: z.string(),
    fillDate: z.string(),
    __roll__: z.string().optional()
  })
  .superRefine((values, ctx) => {
    if (values.newExpiration && values.newExpiration <= values.fillDate)
      ctx.addIssue({ code: 'custom', path: ['newExpiration'], message: AFTER_FILL })
    if (values.newStrike === '100' && values.newExpiration === '2027-01-15')
      ctx.addIssue({ code: 'custom', path: ['__roll__'], message: NO_CHANGE })
  })

type Values = z.infer<typeof schema>

function NoChangeAlert(): React.JSX.Element | null {
  const {
    formState: { errors }
  } = useFormContext<Values>()
  return errors.__roll__ ? <p data-testid="no-change">{errors.__roll__.message}</p> : null
}

function Harness({
  defaults,
  replacementDte = null
}: {
  defaults: Partial<Values>
  replacementDte?: number | null
}): React.JSX.Element {
  const methods = useForm<Values>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: {
      sold: '',
      bought: '',
      newStrike: '',
      newExpiration: '',
      fillDate: '2026-10-01',
      ...defaults
    }
  })
  return (
    <FormProvider {...methods}>
      <PmccRollFields<Values>
        header="Replacement leg"
        idPrefix="test-roll"
        cashFields={[
          { name: 'sold', label: 'Sold / share', idSuffix: 'sold' },
          { name: 'bought', label: 'Bought / share', idSuffix: 'bought' }
        ]}
        contracts={3}
        replacementDte={replacementDte}
      />
      <NoChangeAlert />
    </FormProvider>
  )
}

const input = (id: string): HTMLInputElement => {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLInputElement)) throw new Error(`no input #${id}`)
  return el
}

const fieldOf = (id: string): HTMLElement => {
  const field = input(id).closest('div.flex-col')
  if (!(field instanceof HTMLElement)) throw new Error(`no field for #${id}`)
  return field
}

async function replace(id: string, value: string): Promise<void> {
  await userEvent.clear(input(id))
  await userEvent.type(input(id), value)
}

describe('PmccRollFields', () => {
  it('renders the given cash inputs, then strike, expiration, fill date and contracts', () => {
    render(<Harness defaults={{}} replacementDte={420} />)
    expect(screen.getByText('Replacement leg')).toBeInTheDocument()
    expect(screen.getByLabelText('Sold / share')).toHaveAttribute('id', 'test-roll-sold')
    expect(screen.getByLabelText('Bought / share')).toHaveAttribute('id', 'test-roll-bought')
    expect(input('test-roll-strike')).toBeInTheDocument()
    expect(input('test-roll-expiration')).toBeInTheDocument()
    expect(input('test-roll-fill-date')).toHaveValue('2026-10-01')
    expect(input('test-roll-contracts')).toHaveValue('3')
    expect(input('test-roll-contracts')).toHaveAttribute('readonly')
    expect(fieldOf('test-roll-expiration')).toHaveTextContent('420 DTE')
  })

  it('shows a cash field error beside that field', async () => {
    render(<Harness defaults={{}} />)
    await userEvent.type(input('test-roll-sold'), '1')
    await userEvent.clear(input('test-roll-sold'))
    await waitFor(() => expect(fieldOf('test-roll-sold')).toHaveTextContent('Sold is required'))
  })

  it('a fill-date change re-checks the expiration', async () => {
    render(<Harness defaults={{ newExpiration: '2027-01-15' }} />)
    await replace('test-roll-fill-date', '2027-02-01')
    await waitFor(() => expect(fieldOf('test-roll-expiration')).toHaveTextContent(AFTER_FILL))
  })

  it('a strike change re-checks the no-change rule', async () => {
    render(<Harness defaults={{ newStrike: '90', newExpiration: '2027-01-15' }} />)
    await replace('test-roll-strike', '100')
    expect(await screen.findByTestId('no-change')).toHaveTextContent(NO_CHANGE)
  })

  it('an expiration change re-checks the no-change rule', async () => {
    render(<Harness defaults={{ newStrike: '100' }} />)
    await replace('test-roll-expiration', '2027-01-15')
    expect(await screen.findByTestId('no-change')).toHaveTextContent(NO_CHANGE)
  })
})
