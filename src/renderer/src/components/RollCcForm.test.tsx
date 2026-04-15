import { render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { RollCcForm } from './RollCcForm'

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({
    id,
    value,
    onChange,
    'aria-label': ariaLabel,
    'data-testid': dataTestId
  }: {
    id?: string
    value?: string
    onChange: (value: string) => void
    'aria-label'?: string
    'data-testid'?: string
  }) => (
    <input
      id={id}
      aria-label={ariaLabel}
      data-testid={dataTestId}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))

type RollCcFormValues = {
  new_strike: string
  new_expiration: string
  cost_to_close: string
  new_premium: string
  fill_date?: string
}

type WrapperProps = {
  strike?: string
  expiration?: string
  newStrike?: string
  newExpiration?: string
  basisPerShare?: string
  costToClose?: string
  newPremium?: string
  isPending?: boolean
}

function Wrapper({
  strike = '185.00',
  expiration = '2026-04-18',
  newStrike = '185.00',
  newExpiration = '2026-04-18',
  basisPerShare = '180.00',
  costToClose = '0',
  newPremium = '0',
  isPending = false
}: WrapperProps): React.JSX.Element {
  const {
    register,
    formState: { errors },
    control
  } = useForm<RollCcFormValues>({
    defaultValues: {
      new_strike: newStrike,
      new_expiration: newExpiration,
      cost_to_close: costToClose,
      new_premium: newPremium,
      fill_date: ''
    }
  })

  return (
    <RollCcForm
      ticker="AAPL"
      strike={strike}
      expiration={expiration}
      contracts={1}
      premiumPerContract="2.5000"
      basisPerShare={basisPerShare}
      register={register}
      errors={errors}
      control={control}
      costToClose={costToClose}
      newPremium={newPremium}
      newStrike={newStrike}
      newExpiration={newExpiration}
      isPending={isPending}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
    />
  )
}

describe('RollCcForm', () => {
  it('renders Current Leg section with strike, expiration, DTE, premium, and cost basis', () => {
    render(<Wrapper />)
    expect(screen.getByText(/Current Leg/i)).toBeInTheDocument()
    expect(screen.getAllByText(/\$185\.00/).length).toBeGreaterThan(0)
    expect(screen.getByText(/2026-04-18.*DTE/)).toBeInTheDocument()
    expect(screen.getByText(/\$2\.50/)).toBeInTheDocument()
    expect(screen.getByText(/\$180\.00.*\/share/)).toBeInTheDocument()
  })

  it('renders New Leg inputs: New Strike, New Expiration, Cost to Close, New Premium, Fill Date', () => {
    render(<Wrapper />)
    expect(screen.getByText(/New Leg/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/new strike/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/new expiration/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cost to close/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/new premium/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/fill date/i)).toBeInTheDocument()
  })

  it('shows roll type badge and description when strike or expiration differs', () => {
    render(
      <Wrapper
        strike="185.00"
        expiration="2026-04-18"
        newStrike="190.00"
        newExpiration="2026-05-16"
      />
    )
    expect(screen.getByText(/Roll Up & Out/i)).toBeInTheDocument()
  })

  it('shows amber below-cost-basis warning when newStrike < basisPerShare', () => {
    render(<Wrapper newStrike="175.00" basisPerShare="176.50" newExpiration="2026-05-16" />)
    expect(screen.getByText(/below your cost basis/i)).toBeInTheDocument()
    expect(screen.getByText(/\$1\.50\/share/i)).toBeInTheDocument()
  })

  it('does not show below-cost-basis warning when newStrike > basisPerShare', () => {
    render(<Wrapper newStrike="185.00" basisPerShare="176.50" newExpiration="2026-05-16" />)
    expect(screen.queryByText(/below your cost basis/i)).not.toBeInTheDocument()
  })

  it('shows "cannot be undone" amber warning when no validation error', () => {
    render(<Wrapper />)
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
  })

  it('Confirm Roll button is disabled when hasNoChange is true', () => {
    render(
      <Wrapper
        strike="185.00"
        expiration="2026-04-18"
        newStrike="185.00"
        newExpiration="2026-04-18"
      />
    )
    const confirmButton = screen.getByRole('button', { name: /confirm roll/i })
    expect(confirmButton).toBeDisabled()
  })

  it('shows "Roll must change" error message when strike and expiration are unchanged', () => {
    render(
      <Wrapper
        strike="185.00"
        expiration="2026-04-18"
        newStrike="185.00"
        newExpiration="2026-04-18"
      />
    )
    expect(
      screen.getByText(/Roll must change the expiration, strike, or both/i)
    ).toBeInTheDocument()
  })

  it('shows projected post-roll basis when costToClose and newPremium are valid', () => {
    render(
      <Wrapper
        newStrike="190.00"
        newExpiration="2026-05-16"
        costToClose="3.50"
        newPremium="4.20"
        basisPerShare="180.00"
      />
    )
    // projected = 180.00 - (4.20 - 3.50) = 179.30
    expect(screen.getByText(/179\.30.*\/share/)).toBeInTheDocument()
  })

  it('below-cost-basis warning compares against projected post-roll basis', () => {
    // basisPerShare=176.50, costToClose=0.50, newPremium=0.20 → net = -0.30 (debit)
    // projected = 176.50 - (-0.30) = 176.80; newStrike=176.00 < 176.80 → warning
    render(
      <Wrapper
        newStrike="176.00"
        newExpiration="2026-05-16"
        basisPerShare="176.50"
        costToClose="0.50"
        newPremium="0.20"
      />
    )
    expect(screen.getByText(/below your cost basis/i)).toBeInTheDocument()
    // diff = 176.80 - 176.00 = 0.80
    expect(screen.getByText(/\$0\.80\/share/i)).toBeInTheDocument()
  })

  it('shows descriptive roll detail in eyebrow label for Roll Up & Out', () => {
    render(
      <Wrapper
        strike="185.00"
        expiration="2026-04-18"
        newStrike="190.00"
        newExpiration="2026-05-16"
      />
    )
    expect(screen.getByText(/Roll Up & Out:.*185.*190.*strike/i)).toBeInTheDocument()
    expect(screen.getByText(/Apr.*May.*expiration/i)).toBeInTheDocument()
  })

  it('below-cost-basis warning text includes "If called away, this guarantees a loss"', () => {
    render(<Wrapper newStrike="175.00" basisPerShare="176.50" newExpiration="2026-05-16" />)
    expect(screen.getByText(/If called away, this guarantees a loss/i)).toBeInTheDocument()
  })
})
