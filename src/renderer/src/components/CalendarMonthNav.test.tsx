import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { CalendarMonthNav } from './CalendarMonthNav'

describe('CalendarMonthNav', () => {
  it('renders the month label', () => {
    render(
      <CalendarMonthNav label="August 2026" onPrev={vi.fn()} onNext={vi.fn()} onToday={vi.fn()} />
    )

    expect(screen.getByText('August 2026')).toBeInTheDocument()
  })

  it('fires onPrev/onNext/onToday on the respective controls', async () => {
    const user = userEvent.setup()
    const onPrev = vi.fn()
    const onNext = vi.fn()
    const onToday = vi.fn()
    render(
      <CalendarMonthNav label="August 2026" onPrev={onPrev} onNext={onNext} onToday={onToday} />
    )

    await user.click(screen.getByText('‹'))
    await user.click(screen.getByText('›'))
    await user.click(screen.getByText('Today'))

    expect(onPrev).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onToday).toHaveBeenCalledTimes(1)
  })
})
