import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { CalendarViewToggle } from './CalendarViewToggle'

describe('CalendarViewToggle', () => {
  it('renders Month Grid and Agenda options and no Heatmap option', () => {
    render(<CalendarViewToggle value="grid" onChange={vi.fn()} />)

    expect(screen.getByText('Month Grid')).toBeInTheDocument()
    expect(screen.getByText('Agenda')).toBeInTheDocument()
    expect(screen.queryByText('Heatmap')).not.toBeInTheDocument()
  })

  it('calls onChange with the clicked value and marks the active option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CalendarViewToggle value="grid" onChange={onChange} />)

    await user.click(screen.getByText('Agenda'))

    expect(onChange).toHaveBeenCalledWith('agenda')
    expect(screen.getByText('Month Grid').className).toContain('text-wb-gold')
    expect(screen.getByText('Agenda').className).toContain('text-wb-text-secondary')
  })
})
