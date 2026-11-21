import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CollapsedDrawer } from './CollapsedDrawer'

describe('CollapsedDrawer', () => {
  it('shows title and N fields text in header when meta is absent', () => {
    render(
      <CollapsedDrawer title="Timeline summary" fieldCount={6}>
        <div>child content</div>
      </CollapsedDrawer>
    )
    expect(screen.getByText('Timeline summary')).toBeInTheDocument()
    expect(screen.getByText('6 fields')).toBeInTheDocument()
  })

  it('shows the meta label in place of the field count when meta is given', () => {
    render(
      <CollapsedDrawer title="Leg timeline" meta="9 cycles · 44d uncovered">
        <div>child content</div>
      </CollapsedDrawer>
    )
    const trigger = screen.getByRole('button')
    expect(within(trigger).getByText('Leg timeline')).toBeInTheDocument()
    expect(within(trigger).getByText('9 cycles · 44d uncovered')).toBeInTheDocument()
    expect(within(trigger).queryByText(/fields/)).not.toBeInTheDocument()
  })

  it('content is hidden by default when defaultOpen is not set', () => {
    render(
      <CollapsedDrawer title="Leg reference" fieldCount={3}>
        <div>hidden child text</div>
      </CollapsedDrawer>
    )
    expect(screen.queryByText('hidden child text')).not.toBeInTheDocument()
  })

  it('content is visible when defaultOpen={true}', () => {
    render(
      <CollapsedDrawer title="Leg reference" fieldCount={3} defaultOpen={true}>
        <div>visible child text</div>
      </CollapsedDrawer>
    )
    expect(screen.getByText('visible child text')).toBeInTheDocument()
  })

  it('clicking header toggles content visibility', async () => {
    const user = userEvent.setup()
    render(
      <CollapsedDrawer title="Leg reference" fieldCount={3}>
        <div>toggle child text</div>
      </CollapsedDrawer>
    )

    const trigger = screen.getByRole('button')

    // Initially hidden
    expect(screen.queryByText('toggle child text')).not.toBeInTheDocument()

    // Click to open
    await user.click(trigger)
    expect(screen.getByText('toggle child text')).toBeInTheDocument()

    // Click to close
    await user.click(trigger)
    expect(screen.queryByText('toggle child text')).not.toBeInTheDocument()
  })

  it('drawer container uses bg-wb-bg-surface (defined Tailwind token)', () => {
    render(
      <CollapsedDrawer title="Leg reference" fieldCount={3}>
        <div>child content</div>
      </CollapsedDrawer>
    )
    const trigger = screen.getByRole('button')
    const container = trigger.parentElement
    expect(container).not.toBeNull()
    expect(container).toHaveClass('bg-wb-bg-surface')
  })

  it('aria-expanded is false by default, true after click', async () => {
    const user = userEvent.setup()
    render(
      <CollapsedDrawer title="Leg reference" fieldCount={3}>
        <div>child content</div>
      </CollapsedDrawer>
    )

    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
