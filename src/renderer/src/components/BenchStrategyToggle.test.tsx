import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BenchStrategyToggle } from './BenchStrategyToggle'

// [US-110] The bench's lens control: Wheel screens for a put per ticker, PMCC for a
// LEAPS + short-call diagonal. Not to be confused with US-101's `StrategyToggle`, which
// picks the structure on the New position sheet.

const noop = (): void => {}

describe('BenchStrategyToggle', () => {
  it('groups both lenses under one accessible name', () => {
    render(<BenchStrategyToggle value="WHEEL" onChange={noop} />)

    const group = screen.getByRole('group', { name: 'Screening strategy' })
    expect(within(group).getByRole('button', { name: 'Wheel' })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'PMCC' })).toBeInTheDocument()
  })

  it('presses the Wheel option and only that one when the lens is Wheel', () => {
    render(<BenchStrategyToggle value="WHEEL" onChange={noop} />)

    expect(screen.getByRole('button', { name: 'Wheel' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'PMCC' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('presses the PMCC option and only that one when the lens is PMCC', () => {
    render(<BenchStrategyToggle value="PMCC" onChange={noop} />)

    expect(screen.getByRole('button', { name: 'PMCC' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Wheel' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('raises onChange with PMCC when PMCC is clicked', async () => {
    const onChange = vi.fn()
    render(<BenchStrategyToggle value="WHEEL" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('PMCC')
  })

  it('raises onChange with WHEEL when Wheel is clicked', async () => {
    const onChange = vi.fn()
    render(<BenchStrategyToggle value="PMCC" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Wheel' }))

    expect(onChange).toHaveBeenCalledWith('WHEEL')
  })

  // The e2e suite drives the lens by these hooks, so they are part of the contract.
  it('carries the e2e hooks on the group and on each option', () => {
    render(<BenchStrategyToggle value="WHEEL" onChange={noop} />)

    expect(screen.getByTestId('bench-strategy')).toBe(
      screen.getByRole('group', { name: 'Screening strategy' })
    )
    expect(screen.getByTestId('bench-strategy-wheel')).toHaveTextContent('Wheel')
    expect(screen.getByTestId('bench-strategy-pmcc')).toHaveTextContent('PMCC')
  })
})
