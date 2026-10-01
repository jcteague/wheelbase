import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StrategyToggle } from './StrategyToggle'

describe('StrategyToggle', () => {
  it('groups the two strategies under one labelled group', () => {
    render(<StrategyToggle value="STANDARD" onChange={vi.fn()} />)

    const group = screen.getByRole('group', { name: 'Position strategy' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Standard', 'PMCC'])
  })

  it('marks only the active choice as pressed, named by its visible text', () => {
    render(<StrategyToggle value="STANDARD" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Standard' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'PMCC' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: /selected/ })).not.toBeInTheDocument()
  })

  // FormButton's primary variant fills with gold; secondary is transparent.
  it('swaps the primary and secondary variants with the active choice', () => {
    const { rerender } = render(<StrategyToggle value="STANDARD" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Standard', pressed: true })).toHaveStyle({
      background: 'var(--wb-gold)'
    })
    expect(screen.getByRole('button', { name: 'PMCC' })).toHaveStyle({
      background: 'transparent'
    })

    rerender(<StrategyToggle value="PMCC" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'PMCC', pressed: true })).toHaveStyle({
      background: 'var(--wb-gold)'
    })
    expect(screen.getByRole('button', { name: 'Standard' })).toHaveStyle({
      background: 'transparent'
    })
  })

  it('reports the chosen strategy', async () => {
    const onChange = vi.fn()
    render(<StrategyToggle value="STANDARD" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))

    expect(onChange).toHaveBeenCalledWith('PMCC')
  })

  it('never submits a surrounding form', () => {
    render(<StrategyToggle value="STANDARD" onChange={vi.fn()} />)

    screen.getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('type', 'button'))
  })

  it('forwards disabled to both buttons', () => {
    render(<StrategyToggle value="PMCC" onChange={vi.fn()} disabled />)

    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled())
  })
})
