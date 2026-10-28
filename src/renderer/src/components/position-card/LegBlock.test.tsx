import { render, screen } from '@testing-library/react'
import type { CardAction } from '../../lib/card-actions'
import { CALL_BREACHED, EXPIRING } from '../../test-fixtures/card-actions'
import { LegBlock } from './LegBlock'

function renderLeg(actions?: CardAction[]): void {
  render(
    <LegBlock
      tag="P"
      actions={actions}
      title="$180.00 put · 2027-09-12"
      dte="30d"
      mark="$2.60"
      trailing=" · $3.50 credit"
    />
  )
}

describe('LegBlock', () => {
  it('renders the tag and every slot verbatim', () => {
    renderLeg()

    expect(screen.getByText('P')).toHaveAttribute('title', 'Cash-secured put')
    expect(screen.getByText('$180.00 put · 2027-09-12')).toBeInTheDocument()
    expect(screen.getByText('30d')).toBeInTheDocument()
    expect(screen.getByTestId('leg-block')).toHaveTextContent('$2.60 · $3.50 credit')
  })

  it('a plain leg carries no action tone and no marks', () => {
    renderLeg()

    const leg = screen.getByTestId('leg-block')
    expect(leg).not.toHaveAttribute('data-action')
    expect(leg).toHaveClass('border-wb-border-subtle', 'bg-wb-bg-base')
    expect(screen.queryByText('◷')).not.toBeInTheDocument()
  })

  it('a gold action tints the leg and marks it with the glyph and its line', () => {
    renderLeg([EXPIRING])

    const leg = screen.getByTestId('leg-block')
    expect(leg).toHaveAttribute('data-action', 'gold')
    expect(leg).toHaveClass('border-l-[3px]', 'border-l-wb-gold', 'bg-wb-gold-dim')
    expect(leg).not.toHaveClass('bg-wb-bg-base')
    const marks = screen.getByText('◷')
    expect(marks).toHaveAttribute('title', '◷ EXPIRING · Expires in 4 days at $430.00 strike')
    expect(marks).toHaveClass('text-wb-gold')
  })

  it('several actions take the first tone and list every glyph and line', () => {
    renderLeg([CALL_BREACHED, EXPIRING])

    const leg = screen.getByTestId('leg-block')
    expect(leg).toHaveAttribute('data-action', 'red')
    expect(leg).toHaveClass('border-l-wb-red', 'bg-wb-red-dim')
    const marks = screen.getByText('▲ ◷')
    expect(marks).toHaveAttribute(
      'title',
      '▲ CALL BREACHED · Stock is 1.2% above the $430.00 call strike — shares may be called away\n◷ EXPIRING · Expires in 4 days at $430.00 strike'
    )
    expect(marks).toHaveClass('text-wb-red')
  })
})
