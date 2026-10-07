import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormButton } from './FormButton'

describe('FormButton', () => {
  it('renders the label', () => {
    render(<FormButton label="Open Wheel" />)
    expect(screen.getByRole('button', { name: 'Open Wheel' })).toBeInTheDocument()
  })

  it('is type="submit" by default', () => {
    render(<FormButton label="Open Wheel" />)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('shows pending label and is disabled when isPending', () => {
    render(<FormButton label="Open Wheel" pendingLabel="Opening…" isPending />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveTextContent('Opening…')
    expect(btn).toBeDisabled()
  })

  it('applies gold background when not pending', () => {
    const { container } = render(<FormButton label="Submit" />)
    const btn = container.querySelector('button') as HTMLButtonElement
    const style = btn.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-gold)')
  })

  it('uses an elevated background on a pending secondary button', () => {
    const { container } = render(<FormButton label="Cancel" variant="secondary" isPending />)
    const style = container.querySelector('button')?.getAttribute('style') ?? ''
    expect(style).toContain('var(--wb-bg-elevated)')
  })

  it('reflects aria-pressed when set', () => {
    render(<FormButton label="PMCC" variant="secondary" aria-pressed />)
    expect(screen.getByRole('button', { name: 'PMCC', pressed: true })).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const handler = vi.fn()
    render(<FormButton label="Go" onClick={handler} />)
    await userEvent.click(screen.getByRole('button'))
    expect(handler).toHaveBeenCalledOnce()
  })

  // [US-104] A disabled confirm reads as unavailable, not as an inert gold button
  it('renders a disabled button with the opacity-40 and cursor-not-allowed treatment', () => {
    render(<FormButton label="Confirm roll" disabled />)
    const btn = screen.getByRole('button', { name: 'Confirm roll' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveClass('opacity-40')
    expect(btn).toHaveClass('cursor-not-allowed')
  })

  it('an enabled primary button has neither disabled class applied', () => {
    render(<FormButton label="Confirm roll" />)
    const btn = screen.getByRole('button', { name: 'Confirm roll' })
    expect(btn).toBeEnabled()
    expect(btn).not.toHaveClass('opacity-40')
    expect(btn).not.toHaveClass('cursor-not-allowed')
  })

  it('still shows the pending label when isPending and disabled are both set', () => {
    render(<FormButton label="Confirm roll" pendingLabel="Recording…" isPending disabled />)
    expect(screen.getByRole('button')).toHaveTextContent('Recording…')
  })
})
