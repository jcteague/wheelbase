import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ScreenerStateCard } from './ScreenerStateCard'

describe('ScreenerStateCard', () => {
  it('renders red treatment for the error tone', () => {
    render(
      <ScreenerStateCard
        tone="error"
        title="Market data unavailable"
        body="Alpaca market data couldn't be reached on the last refresh."
        actionLabel="Retry refresh"
        onAction={() => {}}
        data-testid="screener-unavailable"
      />
    )

    const card = screen.getByTestId('screener-unavailable')
    expect(card.getAttribute('data-tone')).toBe('error')
    expect(card.className).toContain('border-wb-red')

    const icon = screen.getByText('⚠')
    expect(icon.className).toContain('text-wb-red')
    expect(icon.className).toContain('bg-wb-red-dim')

    expect(screen.getByText('Market data unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry refresh' })).toBeInTheDocument()
  })

  it('renders muted treatment for the neutral tone with a distinct data-tone', () => {
    render(
      <ScreenerStateCard
        tone="neutral"
        title="No candidates match your criteria"
        body="Every strike on your watchlist was filtered out."
        data-testid="screener-empty"
      />
    )

    const card = screen.getByTestId('screener-empty')
    expect(card.getAttribute('data-tone')).toBe('neutral')
    expect(card.className).toContain('border-wb-border')
    expect(card.className).not.toContain('border-wb-red')

    const icon = screen.getByText('⌕')
    expect(icon.className).toContain('text-wb-text-muted')
    expect(icon.className).toContain('bg-wb-bg-elevated')
  })

  it('fires onAction when the action button is clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(
      <ScreenerStateCard
        tone="error"
        title="Market data unavailable"
        body="Provider outage."
        actionLabel="Retry refresh"
        onAction={onAction}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Retry refresh' }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('renders the caption below the card when provided', () => {
    render(
      <ScreenerStateCard
        tone="neutral"
        title="No candidates match your criteria"
        body="Every strike was filtered out."
        caption="The screen ran successfully — nothing survived the hard filters."
        data-testid="screener-empty"
      />
    )

    const caption = screen.getByText(
      'The screen ran successfully — nothing survived the hard filters.'
    )
    expect(caption).toBeInTheDocument()
    const card = screen.getByTestId('screener-empty')
    expect(card.contains(caption)).toBe(false)
  })

  it('renders no action button when action props are omitted', () => {
    render(<ScreenerStateCard tone="neutral" title="No candidates" body="Nothing matched." />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
