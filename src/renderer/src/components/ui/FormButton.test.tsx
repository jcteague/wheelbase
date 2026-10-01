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
})
